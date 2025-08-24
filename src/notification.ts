import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type ActionResult,
  type Content,
  type GenerateTextParams,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type Provider,
  type ProviderResult,
  Service,
  type State,
  logger,
  type MessagePayload,
  type WorldPayload,
  EventType,
} from '@elizaos/core';
import { z } from 'zod';
import axios from 'axios';

/**
 * Defines the configuration schema for the plugin
 */
const configSchema = z.object({
  COINMARKETCAP_API_KEY: z.string().min(1, 'CoinMarketCap API key is required'),
  RPC_REST_URL: z
    .string()
    .url()
    .default('https://evm-rpc.sei-apis.com')
    .transform((val) => val.trim()),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  PRICE_CHECK_INTERVAL: z.number().default(60000), // 1 minute
  PROPOSAL_CHECK_INTERVAL: z.number().default(300000), // 5 minutes
});

/**
 * Interface for price alert data
 */
interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: 'above' | 'below';
  chatId: string;
  userId: string;
  createdAt: Date;
}

interface ProposalAlert {
  id: string;
  chatId: string;
  userId: string;
  createdAt: Date;
}

interface PriceData {
  price: number;
  marketCap: number;
  volume24h: number;
  percentChange24h: number;
}

interface Proposal {
  proposal_id: string;
  content: {
    title: string;
    description: string;
  };
  status: string;
  submit_time: string;
  voting_start_time: string;
  voting_end_time: string;
}

/**
 * Notification Service to handle price and proposal monitoring
 */
export class NotificationService extends Service {
  static override serviceType = 'notification';

  override capabilityDescription =
    'Provides notification functionality for SEI price alerts and governance proposals.';

  private coinMarketCapApiKey: string;
  private seiRestUrl: string;
  private telegramBotToken: string;
  private telegramChatId: string;
  private discordWebhookUrl: string;
  private priceCheckInterval: number;
  private proposalCheckInterval: number;

  private priceAlerts: Map<string, PriceAlert> = new Map();
  private proposalAlerts: Map<string, ProposalAlert> = new Map();
  private knownProposals: Set<string> = new Set();
  private priceCheckTimer?: NodeJS.Timeout;
  private proposalCheckTimer?: NodeJS.Timeout;

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    this.coinMarketCapApiKey = process.env.COINMARKETCAP_API_KEY || '';
    this.seiRestUrl = process.env.SEI_REST_URL || 'https://sei-api.polkachu.com';
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.telegramChatId = process.env.TELEGRAM_CHAT_ID || '';
    this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';
    this.priceCheckInterval = Number(process.env.PRICE_CHECK_INTERVAL) || 60000;
    this.proposalCheckInterval = Number(process.env.PROPOSAL_CHECK_INTERVAL) || 300000;
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('Starting notification service');
    const service = new NotificationService(runtime);
    await service.initialize();
    return service;
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping notification service');
    const service = runtime.getService(NotificationService.serviceType) as NotificationService;
    if (!service) {
      throw new Error('Notification service not found');
    }
    await service.stop();
  }

  override async stop(): Promise<void> {
    if (this.priceCheckTimer) {
      clearInterval(this.priceCheckTimer);
    }
    if (this.proposalCheckTimer) {
      clearInterval(this.proposalCheckTimer);
    }
    logger.info('Notification service stopped');
  }

  async initialize(): Promise<void> {
    // Load existing proposals to prevent duplicate notifications
    await this.loadExistingProposals();
    
    // Start monitoring intervals
    this.startPriceMonitoring();
    this.startProposalMonitoring();
    
    logger.info('Notification service initialized');
  }

  /**
   * Gets the current price of SEI from CoinMarketCap
   */
  async getSeiPrice(): Promise<PriceData> {
    try {
      const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', {
        headers: {
          'X-CMC_PRO_API_KEY': this.coinMarketCapApiKey,
        },
        params: {
          symbol: 'SEI',
          convert: 'USD',
        },
      });

      if (response.status !== 200) {
        throw new Error(`CoinMarketCap API returned status ${response.status}`);
      }

      const seiData = response.data.data.SEI;
      const quote = seiData.quote.USD;

      return {
        price: quote.price,
        marketCap: quote.market_cap,
        volume24h: quote.volume_24h,
        percentChange24h: quote.percent_change_24h,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get SEI price from CoinMarketCap');
      throw new Error(`Failed to get SEI price: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets governance proposals from SEI network
   */
  async getProposals(status?: string, limit: number = 50): Promise<Proposal[]> {
    try {
      let url = `${this.seiRestUrl}/cosmos/gov/v1beta1/proposals`;
      const params: any = {};

      // Only add status if specified and valid
      if (status && status !== 'all') {
        params.proposal_status = status;
      }

      if (limit) {
        params.limit = limit.toString();
      }

      const response = await axios.get(url, {
        params,
        headers: { accept: 'application/json' },
      });

      if (response.status !== 200) {
        throw new Error(`SEI API returned status ${response.status}`);
      }

      return response.data.proposals || [];
    } catch (error) {
      logger.error({ error }, 'Failed to get SEI proposals');
      throw new Error(`Failed to get proposals: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validates and normalizes chat_id format
   */
  private validateChatId(chatId: string): string {
    // If it's a numeric string (with optional negative sign), return as-is
    if (/^-?\d+$/.test(chatId)) {
      return chatId;
    }
    
    // If it starts with @, return as-is (username format)
    if (chatId.startsWith('@')) {
      return chatId;
    }
    
    // If it's a string like "client_chat", try to get a valid chat_id from environment
    // or throw an error since this is invalid
    if (this.telegramChatId && /^-?\d+$/.test(this.telegramChatId)) {
      logger.warn(`Invalid chat_id "${chatId}", using default chat_id from environment: ${this.telegramChatId}`);
      return this.telegramChatId;
    }
    
    throw new Error(`Invalid chat_id format: "${chatId}". Chat ID must be a numeric string or start with '@'.`);
  }

  /**
   * Properly escapes text for MarkdownV2 format
   */
  private escapeMarkdownV2(text: string): string {
    // Characters that need to be escaped in MarkdownV2: _ * [ ] ( ) ~ ` > # + - = | { } . ! \
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
  }

  /**
   * Sends a message via Telegram with proper error handling
   */
  async sendTelegramMessage(message: string, chatId?: string): Promise<void> {
    try {
      const targetChatId = chatId || this.telegramChatId;
      
      // Validate and normalize chat_id
      const validChatId = this.validateChatId(targetChatId);

      const response = await axios.post(
        `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`,
        {
          chat_id: validChatId,
          text: message,
          parse_mode: 'MarkdownV2',
        },
        {
          timeout: 10000, // 10 second timeout
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status !== 200) {
        throw new Error(`Telegram API returned status ${response.status}: ${response.data?.description || 'Unknown error'}`);
      }

      logger.info(`Telegram message sent successfully to ${validChatId}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorDetails = error.response?.data?.description || error.message;
        logger.error({ 
          error: errorDetails, 
          status: error.response?.status,
          chatId: chatId || this.telegramChatId 
        }, 'Failed to send Telegram message');
        
        // Try sending without MarkdownV2 if parsing failed
        if (error.response?.status === 400 && errorDetails.includes('parse')) {
          logger.info('Retrying message without MarkdownV2 formatting...');
          await this.sendPlainTelegramMessage(message.replace(/\\./g, ''), chatId);
          return;
        }
      }
      throw error;
    }
  }

  /**
   * Sends a plain text message via Telegram (fallback for markdown errors)
   */
  private async sendPlainTelegramMessage(message: string, chatId?: string): Promise<void> {
    try {
      const targetChatId = chatId || this.telegramChatId;
      const validChatId = this.validateChatId(targetChatId);

      const response = await axios.post(
        `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`,
        {
          chat_id: validChatId,
          text: message,
          // No parse_mode for plain text
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status !== 200) {
        throw new Error(`Telegram API returned status ${response.status}: ${response.data?.description || 'Unknown error'}`);
      }

      logger.info(`Plain Telegram message sent successfully to ${validChatId}`);
    } catch (error) {
      logger.error({ error }, 'Failed to send plain Telegram message');
      throw error;
    }
  }

  /**
   * Sends a message via Discord webhook
   */
  async sendDiscordMessage(message: string): Promise<void> {
    try {
      if (!this.discordWebhookUrl) {
        logger.warn('Discord webhook URL not configured, skipping Discord notification');
        return;
      }

      const response = await axios.post(
        this.discordWebhookUrl,
        {
          content: message,
          username: 'Sei Mate',
          avatar_url: 'https://elizaos.github.io/eliza-avatars/Eliza/portrait.png',
        },
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status !== 204) {
        throw new Error(`Discord webhook returned status ${response.status}`);
      }

      logger.info('Discord message sent successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to send Discord message');
      throw error;
    }
  }

  /**
   * Sends notification to all configured platforms
   */
  async sendNotification(message: string, chatId?: string): Promise<void> {
    const notifications: Promise<void>[] = [];

    // Send to Telegram if configured
    if (this.telegramBotToken && (chatId || this.telegramChatId)) {
      notifications.push(this.sendTelegramMessage(message, chatId));
    }

    // Send to Discord if configured
    if (this.discordWebhookUrl) {
      notifications.push(this.sendDiscordMessage(message));
    }

    if (notifications.length === 0) {
      logger.warn('No notification platforms configured');
      return;
    }

    // Send to all platforms concurrently
    try {
      await Promise.allSettled(notifications);
    } catch (error) {
      logger.error({ error }, 'Some notifications failed to send');
    }
  }

  /**
   * Adds a price alert
   */
  addPriceAlert(
    symbol: string,
    targetPrice: number,
    condition: 'above' | 'below',
    chatId: string,
    userId: string
  ): string {
    const id = `${symbol}_${targetPrice}_${condition}_${Date.now()}`;
    const alert: PriceAlert = {
      id,
      symbol: symbol.toUpperCase(),
      targetPrice,
      condition,
      chatId,
      userId,
      createdAt: new Date(),
    };

    this.priceAlerts.set(id, alert);
    logger.info(`Price alert added: ${id}`);
    return id;
  }

  /**
   * Adds a proposal alert
   */
  addProposalAlert(chatId: string, userId: string): string {
    const id = `proposal_${Date.now()}`;
    const alert: ProposalAlert = {
      id,
      chatId,
      userId,
      createdAt: new Date(),
    };

    this.proposalAlerts.set(id, alert);
    logger.info(`Proposal alert added: ${id}`);
    return id;
  }

  /**
   * Starts price monitoring with improved message formatting
   */
  private startPriceMonitoring(): void {
    this.priceCheckTimer = setInterval(async () => {
      if (this.priceAlerts.size === 0) return;

      try {
        const priceData = await this.getSeiPrice();
        const currentPrice = priceData.price;

        for (const [alertId, alert] of this.priceAlerts.entries()) {
          if (alert.symbol !== 'SEI') continue;

          const shouldTrigger =
            (alert.condition === 'above' && currentPrice >= alert.targetPrice) ||
            (alert.condition === 'below' && currentPrice <= alert.targetPrice);

          if (shouldTrigger) {
            // Create unescaped message first
            const unescapedMessage = `🚨 *SEI Price Alert*

SEI has reached $${currentPrice.toFixed(6)}!

Your alert: ${alert.condition} $${alert.targetPrice}

📈 24h Change: ${priceData.percentChange24h.toFixed(2)}%
💰 Market Cap: $${(priceData.marketCap / 1e9).toFixed(2)}B
📊 24h Volume: $${(priceData.volume24h / 1e6).toFixed(2)}M`;

            // Properly escape for MarkdownV2
            const message = this.escapeMarkdownV2(unescapedMessage);

            await this.sendNotification(message, alert.chatId);
            this.priceAlerts.delete(alertId);
            logger.info(`Price alert triggered and removed: ${alertId}`);
          }
        }
      } catch (error) {
        logger.error({ error }, 'Error during price monitoring');
      }
    }, this.priceCheckInterval);
  }

  /**
   * Starts proposal monitoring with improved message formatting
   */
  private startProposalMonitoring(): void {
    this.proposalCheckTimer = setInterval(async () => {
      if (this.proposalAlerts.size === 0) return;

      try {
        const proposals = await this.getProposals('all', 10);

        for (const proposal of proposals) {
          if (!this.knownProposals.has(proposal.proposal_id)) {
            this.knownProposals.add(proposal.proposal_id);

            for (const [alertId, alert] of this.proposalAlerts.entries()) {
              // Create unescaped message first
              const description = proposal.content.description.substring(0, 200) + 
                (proposal.content.description.length > 200 ? '...' : '');
              
              const unescapedMessage = `🗳️ *New SEI Governance Proposal*

*Proposal #${proposal.proposal_id}*

📋 *Title:* ${proposal.content.title}

📝 *Description:* ${description}

🗓️ *Voting Start:* ${new Date(proposal.voting_start_time).toLocaleDateString()}
🗓️ *Voting End:* ${new Date(proposal.voting_end_time).toLocaleDateString()}

📊 *Status:* ${proposal.status}`;

              // Properly escape for MarkdownV2
              const message = this.escapeMarkdownV2(unescapedMessage);

              await this.sendNotification(message, alert.chatId);
            }

            logger.info(`New proposal notification sent: ${proposal.proposal_id}`);
          }
        }
      } catch (error) {
        logger.error({ error }, 'Error during proposal monitoring');
      }
    }, this.proposalCheckInterval);
  }

  /**
   * Loads existing proposals to prevent duplicate notifications
   */
  private async loadExistingProposals(): Promise<void> {
    try {
      const proposals = await this.getProposals('all', 50);
      for (const proposal of proposals) {
        this.knownProposals.add(proposal.proposal_id);
      }
      logger.info(`Loaded ${this.knownProposals.size} existing proposals`);
    } catch (error) {
      logger.warn({ error }, 'Failed to load existing proposals');
    }
  }
}

/**
 * Action to set up price alerts
 */
const setPriceAlertAction: Action = {
  name: 'SET_PRICE_ALERT',
  similes: ['PRICE_ALERT', 'SEI_PRICE_ALERT', 'NOTIFY_PRICE', 'PRICE_NOTIFICATION'],
  description: 'Creates a price alert that will notify you via Telegram when SEI reaches your target price',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;

    const text = message.content.text.toLowerCase();
    return (
      text.includes('alert') &&
      (text.includes('sei') || text.includes('price')) &&
      /\d+\.?\d*/.test(text)
    ) || (
      text.includes('notify') &&
      text.includes('price') &&
      /\d+\.?\d*/.test(text)
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> = {},
    callback?: HandlerCallback,
    _responses?: Memory[]
  ): Promise<ActionResult> => {
    try {
      if (!message.content.text) {
        return {
          success: false,
          error: new Error('Message content text is undefined'),
          text: 'I need a message with text to process your request.',
        };
      }

      const text = message.content.text.toLowerCase();
      
      // Extract price and condition
      const priceMatch = text.match(/(\d+\.?\d*)/);
      const isAbove = text.includes('above') || text.includes('reaches') || text.includes('hits');
      const isBelow = text.includes('below') || text.includes('drops') || text.includes('falls');

      if (!priceMatch) {
        return {
          success: false,
          error: new Error('No price specified'),
          text: 'Please specify a target price (e.g., "Alert me when SEI reaches 0.003")',
        };
      }

      const targetPrice = parseFloat(priceMatch[1]);
      const condition = isBelow ? 'below' : 'above'; // Default to above if not specified

      const service = runtime.getService(NotificationService.serviceType) as NotificationService;
      if (!service) {
        throw new Error('Notification service not available');
      }

      // Use a valid chat_id - either from the message source or the default configured one
      const chatId = message.content.source || process.env.TELEGRAM_CHAT_ID || '';
      
      const alertId = service.addPriceAlert(
        'SEI',
        targetPrice,
        condition,
        chatId,
        (message.content.userId as string) || ''
      );

      const response = `✅ Price alert set successfully!\n\nI'll notify you when SEI goes ${condition} $${targetPrice}.\n\nAlert ID: ${alertId}`;

      if (callback) {
        await callback({
          text: response,
          actions: ['SET_PRICE_ALERT'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['SET_PRICE_ALERT'],
          source: message.content.source,
          alertId,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set price alert';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't set up the price alert. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Alert me when SEI price reaches $0.50',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '✅ Price alert set successfully!\n\nI\'ll notify you when SEI goes above $0.50.\n\nAlert ID: SEI_0.50_above_1234567890',
          actions: ['SET_PRICE_ALERT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Notify me when SEI drops below $0.30',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '✅ Price alert set successfully!\n\nI\'ll notify you when SEI goes below $0.30.\n\nAlert ID: SEI_0.30_below_1234567890',
          actions: ['SET_PRICE_ALERT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Set price alert for SEI at $1.00',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '✅ Price alert set successfully!\n\nI\'ll notify you when SEI goes above $1.00.\n\nAlert ID: SEI_1.00_above_1234567890',
          actions: ['SET_PRICE_ALERT'],
        },
      },
    ],
  ],
};

/**
 * Action to set up proposal alerts
 */
const setProposalAlertAction: Action = {
  name: 'SET_PROPOSAL_ALERT',
  similes: ['PROPOSAL_ALERT', 'GOVERNANCE_ALERT', 'NOTIFY_PROPOSAL', 'PROPOSAL_NOTIFICATION'],
  description: 'Creates alerts to notify you via Telegram when new SEI governance proposals are submitted',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;

    const text = message.content.text.toLowerCase();
    return (
      text.includes('alert') &&
      (text.includes('proposal') || text.includes('governance'))
    ) || (
      text.includes('notify') &&
      (text.includes('proposal') || text.includes('governance'))
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> = {},
    callback?: HandlerCallback,
    _responses?: Memory[]
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService(NotificationService.serviceType) as NotificationService;
      if (!service) {
        throw new Error('Notification service not available');
      }

      // Use a valid chat_id - either from the message source or the default configured one
      const chatId = message.content.source || process.env.TELEGRAM_CHAT_ID || '';

      const alertId = service.addProposalAlert(
        chatId,
        (message.content.userId as string) || ''
      );

      const response = `✅ Proposal alert set successfully!\n\nI'll notify you whenever there's a new SEI governance proposal.\n\nAlert ID: ${alertId}`;

      if (callback) {
        await callback({
          text: response,
          actions: ['SET_PROPOSAL_ALERT'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['SET_PROPOSAL_ALERT'],
          source: message.content.source,
          alertId,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set proposal alert';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't set up the proposal alert. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Alert me when there are new SEI governance proposals',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '✅ Proposal alert set successfully!\n\nI\'ll notify you whenever there\'s a new SEI governance proposal.\n\nAlert ID: proposal_1234567890',
          actions: ['SET_PROPOSAL_ALERT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Notify me about new governance proposals',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '✅ Proposal alert set successfully!\n\nI\'ll notify you whenever there\'s a new SEI governance proposal.\n\nAlert ID: proposal_1234567890',
          actions: ['SET_PROPOSAL_ALERT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Set up governance alerts for SEI',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '✅ Proposal alert set successfully!\n\nI\'ll notify you whenever there\'s a new SEI governance proposal.\n\nAlert ID: proposal_1234567890',
          actions: ['SET_PROPOSAL_ALERT'],
        },
      },
    ],
  ],
};

export const notificationPlugin: Plugin = {
  name: 'plugin-sei-notification',
  description: 'Provides notification functionality for SEI price alerts and governance proposals',
  config: {
    COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY,
    SEI_REST_URL: process.env.SEI_REST_URL,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL,
    PRICE_CHECK_INTERVAL: process.env.PRICE_CHECK_INTERVAL,
    PROPOSAL_CHECK_INTERVAL: process.env.PROPOSAL_CHECK_INTERVAL,
  },
  
  async init(config: Record<string, string>) {
    logger.info('Initializing plugin-sei-notification');
    try {
      const validatedConfig = await configSchema.parseAsync({
        ...config,
        PRICE_CHECK_INTERVAL: Number(config.PRICE_CHECK_INTERVAL) || 60000,
        PROPOSAL_CHECK_INTERVAL: Number(config.PROPOSAL_CHECK_INTERVAL) || 300000,
      });

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = String(value);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid plugin configuration: ${error.errors.map((e) => e.message).join(', ')}`
        );
      }
      throw error;
    }
  },

  models: {
    [ModelType.TEXT_SMALL]: async (
      _runtime,
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'I can help you set up notifications for SEI price alerts and governance proposals.';
    },
    [ModelType.TEXT_LARGE]: async (
      _runtime,
      {
        prompt,
        stopSequences = [],
        maxTokens = 8192,
        temperature = 0.7,
        frequencyPenalty = 0.7,
        presencePenalty = 0.7,
      }: GenerateTextParams
    ) => {
      return 'I specialize in monitoring SEI cryptocurrency prices and governance proposals. You can ask me to set up alerts like "Alert me when SEI reaches 0.003" or "Notify me about new proposals". I\'ll send you Telegram notifications when your conditions are met.';
    },
  },

  routes: [
    {
      name: 'api-sei-price',
      path: '/api/sei/price',
      type: 'GET',
      handler: async (req: any, res: any) => {
        try {
          const service = req.runtime.getService(NotificationService.serviceType) as NotificationService;
          if (!service) {
            return res.status(500).json({ error: 'Notification service not available' });
          }

          const priceData = await service.getSeiPrice();
          res.json(priceData);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get SEI price',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      name: 'api-sei-proposals',
      path: '/api/sei/proposals',
      type: 'GET',
      handler: async (req: any, res: any) => {
        try {
          const service = req.runtime.getService(NotificationService.serviceType) as NotificationService;
          if (!service) {
            return res.status(500).json({ error: 'Notification service not available' });
          }

          const status = req.query.status as string;
          const limit = parseInt(req.query.limit as string) || 50;
          
          const proposals = await service.getProposals(status, limit);
          res.json({ proposals });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get SEI proposals',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
  ],

  events: {
    [EventType.MESSAGE_RECEIVED]: [
      async (params: MessagePayload) => {
        logger.debug('MESSAGE_RECEIVED event received');
        logger.debug({ message: params.message }, 'Message:');
      },
    ],
  },

  services: [NotificationService],
  actions: [setPriceAlertAction, setProposalAlertAction],
  providers: [],
};

export default notificationPlugin;
