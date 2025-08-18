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
import * as dotenv from 'dotenv';

dotenv.config();

// Define SEI mainnet chain configuration
const seiMainnet = {
  id: 1329,
  name: 'SEI',
  network: 'sei-mainnet',
  nativeCurrency: {
    decimals: 18,
    name: 'SEI',
    symbol: 'SEI',
  },
  rpcUrls: {
    default: { http: ['https://evm-rpc.sei-apis.com'] },
    public: { http: ['https://evm-rpc.sei-apis.com'] },
  },
  blockExplorers: {
    default: { name: 'SEI Explorer', url: 'https://seitrace.com' },
  },
} as const;

/**
 * Defines the configuration schema for the SEI perpetual trading plugin
 */
const configSchema = z.object({
  SEI_PRIVATE_KEY: z.string().min(1, 'SEI private key is required'),
  SEI_RPC_URL: z.string().url().default('https://evm-rpc.sei-apis.com'),
  SEI_CITREX_ENVIRONMENT: z.enum(['mainnet', 'testnet']).default('mainnet'),
  SEI_SUB_ACCOUNT_ID: z.number().default(0),
});

// Import types from Citrex SDK following sei-agent-kit pattern
// We'll cast to Config type as done in sei-agent-kit

/**
 * Interface for order data following Citrex SDK patterns
 */
interface OrderData {
  isBuy: boolean;
  price: number;
  productId: number;
  quantity: number;
  orderType?: 'LIMIT' | 'MARKET';
  timeInForce?: 'FOK' | 'IOC' | 'GTC';
  expiration?: number;
  nonce?: number;
  priceIncrement?: number;
  slippage?: number;
}

/**
 * Interface for position data
 */
interface PositionData {
  productId: number;
  symbol: string;
  size: number;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  marginUsed: number;
}

/**
 * Interface for product information
 */
interface ProductInfo {
  id: number;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  markPrice: number;
  minQuantity: number;
  maxQuantity: number;
  increment: number;
  active: boolean;
}

/**
 * Interface for account balance
 */
interface AccountBalance {
  totalBalance: number;
  availableBalance: number;
  marginUsed: number;
  unrealizedPnl: number;
}

/**
 * SEI Perpetual Trading Service to handle perpetual trading functionality
 */
export class SeiPerpetualTradingService extends Service {
  static override serviceType = 'sei-perpetual-trading';

  override capabilityDescription =
    'Provides SEI perpetual trading functionality using Citrex protocol with position management, order placement, and account monitoring.';

  private privateKey: string;
  private rpcUrl: string;
  private environment: 'mainnet' | 'testnet';
  private subAccountId: number;

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    
    this.privateKey = process.env.SEI_PRIVATE_KEY || '';
    this.rpcUrl = process.env.SEI_RPC_URL || 'https://evm-rpc.sei-apis.com';
    this.environment = (process.env.SEI_CITREX_ENVIRONMENT as 'mainnet' | 'testnet') || 'mainnet';
    this.subAccountId = parseInt(process.env.SEI_SUB_ACCOUNT_ID || '0');
    
    if (!this.privateKey) {
      throw new Error('SEI_PRIVATE_KEY environment variable is required');
    }
  }

  private getCitrexConfig() {
    return {
      debug: false,
      environment: this.environment,
      rpc: this.rpcUrl,
      subAccountId: this.subAccountId,
    };
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('Starting SEI perpetual trading service');
    return new SeiPerpetualTradingService(runtime);
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping SEI perpetual trading service');
    const service = runtime.getService(SeiPerpetualTradingService.serviceType);
    if (!service) {
      throw new Error('SEI perpetual trading service not found');
    }
    if ('stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    logger.info('SEI perpetual trading service stopped');
  }

  /**
   * Gets available products for trading
   */
  async getProducts(): Promise<ProductInfo[]> {
    try {
      logger.info('Fetching available products...');
      
      // Dynamic import and initialization following sei-agent-kit pattern
      const CitrexSDK = (await import('citrex-sdk')).default;
      const client = new CitrexSDK(this.privateKey as `0x${string}`, this.getCitrexConfig() as any);
      
      const result = await client.getProducts();
      
      return result.products.map((product: any) => ({
        id: product.id,
        symbol: product.symbol,
        baseAsset: product.baseAsset,
        quoteAsset: product.quoteAsset,
        markPrice: Number(product.markPrice) / 1e18, // Convert from wei
        minQuantity: Number(product.minQuantity),
        maxQuantity: Number(product.maxQuantity),
        increment: Number(product.increment),
        active: product.active,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get products');
      throw new Error(`Failed to get products: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets account balances
   */
  async getAccountBalance(): Promise<AccountBalance> {
    try {
      logger.info('Fetching account balance...');
      
      // Dynamic import and initialization following sei-agent-kit pattern
      const CitrexSDK = (await import('citrex-sdk')).default;
      const client = new CitrexSDK(this.privateKey as `0x${string}`, this.getCitrexConfig() as any);
      
      const balances = await client.listBalances();
      const accountHealth = await client.getAccountHealth();
      
      // Access properties based on actual SDK return structure
      return {
        totalBalance: Number((balances as any).totalBalance || 0) / 1e6, // Convert from USDC decimals
        availableBalance: Number((balances as any).availableBalance || 0) / 1e6,
        marginUsed: Number((accountHealth as any).marginUsed || 0) / 1e6,
        unrealizedPnl: Number((accountHealth as any).unrealizedPnl || 0) / 1e6,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get account balance');
      throw new Error(`Failed to get account balance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets current positions
   */
  async getPositions(productSymbol?: string): Promise<PositionData[]> {
    try {
      logger.info(`Fetching positions${productSymbol ? ` for ${productSymbol}` : ''}...`);
      
      // Dynamic import and initialization following sei-agent-kit pattern
      const CitrexSDK = (await import('citrex-sdk')).default;
      const client = new CitrexSDK(this.privateKey as `0x${string}`, this.getCitrexConfig() as any);
      
      // Handle productSymbol type - cast to the expected type
      const result = await client.listPositions(productSymbol as any);
      
      return (result.positions || []).map((position: any) => ({
        productId: position.productId,
        symbol: position.symbol,
        size: Number(position.size),
        side: position.size > 0 ? 'LONG' : 'SHORT',
        entryPrice: Number(position.entryPrice) / 1e18,
        markPrice: Number(position.markPrice) / 1e18,
        unrealizedPnl: Number(position.unrealizedPnl) / 1e6,
        marginUsed: Number(position.marginUsed) / 1e6,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get positions');
      throw new Error(`Failed to get positions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Places a new order
   */
  async placeOrder(orderData: OrderData): Promise<any> {
    try {
      logger.info(`Placing ${orderData.isBuy ? 'BUY' : 'SELL'} order: ${orderData.quantity} @ ${orderData.price} for product ${orderData.productId}`);
      
      // Dynamic import and initialization following sei-agent-kit pattern
      const CitrexSDK = (await import('citrex-sdk')).default;
      const client = new CitrexSDK(this.privateKey as `0x${string}`, this.getCitrexConfig() as any);
      
      const orderArgs = {
        isBuy: orderData.isBuy,
        price: orderData.price,
        productId: orderData.productId,
        quantity: orderData.quantity,
        orderType: orderData.orderType as any || 'LIMIT',
        timeInForce: orderData.timeInForce as any || 'GTC',
        expiration: orderData.expiration || Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        nonce: orderData.nonce || Date.now() * 1000000, // nanoseconds
        priceIncrement: orderData.priceIncrement ? BigInt(orderData.priceIncrement) : undefined,
        slippage: orderData.slippage || 2.5,
      };
      
      const result = await client.placeOrder(orderArgs);
      
      logger.info(`Order placed successfully: ${(result as any).order?.id || 'unknown'}`);
      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to place order');
      throw new Error(`Failed to place order: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets open orders
   */
  async getOpenOrders(productSymbol?: string): Promise<any[]> {
    try {
      logger.info(`Fetching open orders${productSymbol ? ` for ${productSymbol}` : ''}...`);
      
      // Dynamic import and initialization following sei-agent-kit pattern
      const CitrexSDK = (await import('citrex-sdk')).default;
      const client = new CitrexSDK(this.privateKey as `0x${string}`, this.getCitrexConfig() as any);
      
      const result = await client.listOpenOrders(productSymbol as any);
      return result.orders || [];
    } catch (error) {
      logger.error({ error }, 'Failed to get open orders');
      throw new Error(`Failed to get open orders: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Cancels an order
   */
  async cancelOrder(orderId: string, productId: number): Promise<any> {
    try {
      logger.info(`Cancelling order ${orderId} for product ${productId}`);
      
      // Dynamic import and initialization following sei-agent-kit pattern
      const CitrexSDK = (await import('citrex-sdk')).default;
      const client = new CitrexSDK(this.privateKey as `0x${string}`, this.getCitrexConfig() as any);
      
      const result = await client.cancelOrder(orderId as `0x${string}`, productId);
      
      logger.info(`Order cancelled successfully: ${orderId}`);
      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to cancel order');
      throw new Error(`Failed to cancel order: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Deposits USDC to trading account
   */
  async deposit(amount: number): Promise<string> {
    try {
      logger.info(`Depositing ${amount} USDC to trading account`);
      
      // Dynamic import and initialization following sei-agent-kit pattern
      const CitrexSDK = (await import('citrex-sdk')).default;
      const client = new CitrexSDK(this.privateKey as `0x${string}`, this.getCitrexConfig() as any);
      
      const result = await client.deposit(amount);
      
      if ((result as any).success) {
        logger.info(`Deposit successful: ${(result as any).transactionHash}`);
        return `Deposit successful, transaction hash: ${(result as any).transactionHash}`;
      } else {
        throw new Error('Deposit failed');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to deposit');
      throw new Error(`Failed to deposit: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Withdraws USDC from trading account
   */
  async withdraw(amount: number): Promise<string> {
    try {
      logger.info(`Withdrawing ${amount} USDC from trading account`);
      
      // Dynamic import and initialization following sei-agent-kit pattern
      const CitrexSDK = (await import('citrex-sdk')).default;
      const client = new CitrexSDK(this.privateKey as `0x${string}`, this.getCitrexConfig() as any);
      
      const result = await client.withdraw(amount);
      
      if ((result as any).success) {
        logger.info(`Withdrawal successful: ${(result as any).transactionHash || 'completed'}`);
        return `Withdrawal successful${(result as any).transactionHash ? ', transaction hash: ' + (result as any).transactionHash : ''}`;
      } else {
        throw new Error('Withdrawal failed');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to withdraw');
      throw new Error(`Failed to withdraw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse product symbol from text input
   */
  parseProductFromText(text: string, availableProducts: ProductInfo[]): ProductInfo | null {
    const lowerText = text.toLowerCase();
    
    for (const product of availableProducts) {
      if (lowerText.includes(product.symbol.toLowerCase()) || 
          lowerText.includes(product.baseAsset.toLowerCase())) {
        return product;
      }
    }
    
    return null;
  }

  /**
   * Parse order side from text input
   */
  parseOrderSideFromText(text: string): boolean | null {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('buy') || lowerText.includes('long')) {
      return true;
    } else if (lowerText.includes('sell') || lowerText.includes('short')) {
      return false;
    }
    
    return null;
  }

  /**
   * Parse quantity from text input
   */
  parseQuantityFromText(text: string): number {
    const quantityMatch = text.match(/(\d+(?:\.\d+)?)/);
    return quantityMatch ? parseFloat(quantityMatch[1]) : 1.0;
  }

  /**
   * Parse price from text input
   */
  parsePriceFromText(text: string): number | null {
    const priceMatch = text.match(/(?:at|@|price)\s*(\d+(?:\.\d+)?)/i);
    return priceMatch ? parseFloat(priceMatch[1]) : null;
  }
}

const placeOrderAction: Action = {
  name: 'PLACE_PERPETUAL_ORDER',
  similes: ['PLACE_ORDER', 'BUY_PERP', 'SELL_PERP', 'LONG_POSITION', 'SHORT_POSITION', 'TRADE_PERPETUAL'],
  description: 'Places a perpetual order on Citrex protocol with position management',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return (text.includes('buy') || text.includes('sell') || text.includes('long') || text.includes('short')) &&
           (text.includes('perp') || text.includes('perpetual') || text.includes('position') || text.includes('order'));
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
          text: 'I need a message with text to process your order request.',
        };
      }

      const service = runtime.getService(SeiPerpetualTradingService.serviceType) as SeiPerpetualTradingService;
      if (!service) {
        throw new Error('SEI perpetual trading service not available');
      }

      const text = message.content.text.toLowerCase();
      
      // Get available products
      const products = await service.getProducts();
      
      // Parse order details
      const product = service.parseProductFromText(text, products);
      const isBuy = service.parseOrderSideFromText(text);
      const quantity = service.parseQuantityFromText(text);
      const price = service.parsePriceFromText(text);
      
      if (!product) {
        return {
          success: false,
          error: new Error('Product not found'),
          text: 'I couldn\'t identify the trading pair. Available products: ' + products.map(p => p.symbol).join(', '),
        };
      }
      
      if (isBuy === null) {
        return {
          success: false,
          error: new Error('Order side not specified'),
          text: 'Please specify whether you want to buy/long or sell/short.',
        };
      }
      
      // Use market price if no price specified
      const orderPrice = price || product.markPrice;
      
      const orderData: OrderData = {
        isBuy,
        price: orderPrice,
        productId: product.id,
        quantity,
        orderType: price ? 'LIMIT' : 'MARKET',
        timeInForce: 'GTC',
        priceIncrement: product.increment,
      };
      
      // Place the order
      const orderResult = await service.placeOrder(orderData);
      
      const response = `✅ Successfully placed ${isBuy ? 'BUY' : 'SELL'} order for ${quantity} ${product.symbol} at $${orderPrice}\n\n📋 Order ID: ${orderResult.orderId}\n🔗 Status: ${orderResult.status || 'Pending'}`;

      if (callback) {
        await callback({
          text: response,
          actions: ['PLACE_PERPETUAL_ORDER'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['PLACE_PERPETUAL_ORDER'],
          source: message.content.source,
          orderResult,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to place order';
      logger.error({ error }, 'Place order action failed');
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `❌ Sorry, I couldn't place the order. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Buy 1 ETHPERP at $3000',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '✅ Successfully placed BUY order for 1 ETHPERP at $3000\n\n📋 Order ID: 0x123...\n🔗 Status: Pending',
          actions: ['PLACE_PERPETUAL_ORDER'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Short 0.5 BTCPERP',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '✅ Successfully placed SELL order for 0.5 BTCPERP at $65000\n\n📋 Order ID: 0x456...\n🔗 Status: Pending',
          actions: ['PLACE_PERPETUAL_ORDER'],
        },
      },
    ],
  ],
};

const getPositionsAction: Action = {
  name: 'GET_POSITIONS',
  similes: ['CHECK_POSITIONS', 'LIST_POSITIONS', 'MY_POSITIONS', 'POSITION_STATUS'],
  description: 'Gets current perpetual positions with PnL and margin information',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return text.includes('position') || text.includes('pnl') || text.includes('profit') || text.includes('loss');
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
      const service = runtime.getService(SeiPerpetualTradingService.serviceType) as SeiPerpetualTradingService;
      if (!service) {
        throw new Error('SEI perpetual trading service not available');
      }

      const positions = await service.getPositions();
      
      if (positions.length === 0) {
        const response = '📊 **No open positions**\n\nYou currently have no active perpetual positions.';
        
        if (callback) {
          await callback({
            text: response,
            actions: ['GET_POSITIONS'],
            source: message.content.source,
          });
        }

        return {
          text: response,
          success: true,
          data: {
            actions: ['GET_POSITIONS'],
            source: message.content.source,
            positions: [],
          },
        };
      }

      const response = `📊 **Your Perpetual Positions:**\n\n${positions
        .map(pos => 
          `• **${pos.symbol}** (${pos.side})\n` +
          `  Size: ${pos.size}\n` +
          `  Entry: $${pos.entryPrice.toFixed(2)}\n` +
          `  Mark: $${pos.markPrice.toFixed(2)}\n` +
          `  PnL: ${pos.unrealizedPnl >= 0 ? '🟢' : '🔴'} $${pos.unrealizedPnl.toFixed(2)}\n` +
          `  Margin: $${pos.marginUsed.toFixed(2)}`
        )
        .join('\n\n')}`;

      if (callback) {
        await callback({
          text: response,
          actions: ['GET_POSITIONS'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['GET_POSITIONS'],
          source: message.content.source,
          positions,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get positions';
      logger.error({ error }, 'Get positions action failed');
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `❌ Sorry, I couldn't get your positions. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Show my positions',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '📊 **Your Perpetual Positions:**\n\n• **ETHPERP** (LONG)\n  Size: 1.0\n  Entry: $3000.00\n  Mark: $3050.00\n  PnL: 🟢 $50.00\n  Margin: $300.00',
          actions: ['GET_POSITIONS'],
        },
      },
    ],
  ],
};

const getAccountBalanceAction: Action = {
  name: 'GET_ACCOUNT_BALANCE',
  similes: ['TRADING_BALANCE', 'MARGIN_BALANCE', 'PERP_BALANCE', 'TRADING_ACCOUNT_BALANCE'],
  description: 'Gets trading account balance and margin information for perpetual trading',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return (text.includes('trading') && text.includes('balance')) ||
           (text.includes('trading') && text.includes('account')) ||
           (text.includes('perpetual') && text.includes('balance')) ||
           (text.includes('margin') && text.includes('balance')) ||
           text.includes('trading balance') ||
           text.includes('perp balance');
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
      const service = runtime.getService(SeiPerpetualTradingService.serviceType) as SeiPerpetualTradingService;
      if (!service) {
        throw new Error('SEI perpetual trading service not available');
      }

      const balance = await service.getAccountBalance();
      
      const response = `💰 **Trading Account Balance (Perpetual Trading):**\n\n` +
        `• Total Balance: $${balance.totalBalance.toFixed(2)} USDC\n` +
        `• Available: $${balance.availableBalance.toFixed(2)} USDC\n` +
        `• Margin Used: $${balance.marginUsed.toFixed(2)} USDC\n` +
        `• Unrealized PnL: ${balance.unrealizedPnl >= 0 ? '🟢' : '🔴'} $${balance.unrealizedPnl.toFixed(2)} USDC\n\n` +
        `📊 *This is your dedicated perpetual trading account balance*`;

      if (callback) {
        await callback({
          text: response,
          actions: ['GET_ACCOUNT_BALANCE'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['GET_ACCOUNT_BALANCE'],
          source: message.content.source,
          balance,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get account balance';
      logger.error({ error }, 'Get account balance action failed');
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `❌ Sorry, I couldn't get your account balance. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Check my trading account balance',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '💰 **Trading Account Balance (Perpetual Trading):**\n\n• Total Balance: $1000.00 USDC\n• Available: $700.00 USDC\n• Margin Used: $300.00 USDC\n• Unrealized PnL: 🟢 $50.00 USDC\n\n📊 *This is your dedicated perpetual trading account balance*',
          actions: ['GET_ACCOUNT_BALANCE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'What is my perpetual trading balance?',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '💰 **Trading Account Balance (Perpetual Trading):**\n\n• Total Balance: $2500.00 USDC\n• Available: $1800.00 USDC\n• Margin Used: $700.00 USDC\n• Unrealized PnL: 🔴 -$25.00 USDC\n\n📊 *This is your dedicated perpetual trading account balance*',
          actions: ['GET_ACCOUNT_BALANCE'],
        },
      },
    ],
  ],
};

const getOpenOrdersAction: Action = {
  name: 'GET_OPEN_ORDERS',
  similes: ['CHECK_ORDERS', 'LIST_ORDERS', 'PENDING_ORDERS', 'ORDER_STATUS'],
  description: 'Gets current open orders with details',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return text.includes('order') && (text.includes('open') || text.includes('pending') || text.includes('list'));
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
      const service = runtime.getService(SeiPerpetualTradingService.serviceType) as SeiPerpetualTradingService;
      if (!service) {
        throw new Error('SEI perpetual trading service not available');
      }

      const orders = await service.getOpenOrders();
      
      if (orders.length === 0) {
        const response = '📋 **No open orders**\n\nYou currently have no pending orders.';
        
        if (callback) {
          await callback({
            text: response,
            actions: ['GET_OPEN_ORDERS'],
            source: message.content.source,
          });
        }

        return {
          text: response,
          success: true,
          data: {
            actions: ['GET_OPEN_ORDERS'],
            source: message.content.source,
            orders: [],
          },
        };
      }

      const response = `📋 **Open Orders:**\n\n${orders
        .map(order => 
          `• **${order.symbol}** ${order.isBuy ? 'BUY' : 'SELL'}\n` +
          `  Quantity: ${order.quantity}\n` +
          `  Price: $${order.price}\n` +
          `  Type: ${order.orderType}\n` +
          `  ID: ${order.orderId.slice(0, 8)}...`
        )
        .join('\n\n')}`;

      if (callback) {
        await callback({
          text: response,
          actions: ['GET_OPEN_ORDERS'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['GET_OPEN_ORDERS'],
          source: message.content.source,
          orders,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get open orders';
      logger.error({ error }, 'Get open orders action failed');
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `❌ Sorry, I couldn't get your open orders. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Show my open orders',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '📋 **Open Orders:**\n\n• **ETHPERP** BUY\n  Quantity: 1.0\n  Price: $2950\n  Type: LIMIT\n  ID: 0x123456...',
          actions: ['GET_OPEN_ORDERS'],
        },
      },
    ],
  ],
};

const depositAction: Action = {
  name: 'DEPOSIT_TRADING_FUNDS',
  similes: ['DEPOSIT', 'ADD_FUNDS', 'FUND_ACCOUNT', 'DEPOSIT_USDC'],
  description: 'Deposits USDC to trading account for perpetual trading',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return text.includes('deposit') || (text.includes('add') && text.includes('fund'));
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
          text: 'I need a message with text to process your deposit request.',
        };
      }

      const service = runtime.getService(SeiPerpetualTradingService.serviceType) as SeiPerpetualTradingService;
      if (!service) {
        throw new Error('SEI perpetual trading service not available');
      }

      const text = message.content.text;
      
      // Parse amount from text
      const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
      const amount = amountMatch ? parseFloat(amountMatch[1]) : 100; // Default 100 USDC
      
      const result = await service.deposit(amount);
      
      const response = `✅ Successfully deposited $${amount} USDC to your trading account\n\n${result}`;

      if (callback) {
        await callback({
          text: response,
          actions: ['DEPOSIT_TRADING_FUNDS'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['DEPOSIT_TRADING_FUNDS'],
          source: message.content.source,
          amount,
          result,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to deposit funds';
      logger.error({ error }, 'Deposit action failed');
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `❌ Sorry, I couldn't deposit funds. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Deposit 500 USDC',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '✅ Successfully deposited $500 USDC to your trading account\n\nDeposit successful, transaction hash: 0x123...',
          actions: ['DEPOSIT_TRADING_FUNDS'],
        },
      },
    ],
  ],
};

export const seiPerpetualTradingPlugin: Plugin = {
  name: 'plugin-sei-perpetual-trading',
  description: 'Provides SEI perpetual trading functionality using Citrex protocol with position management, order placement, and account monitoring',
  config: {
    SEI_PRIVATE_KEY: process.env.SEI_PRIVATE_KEY,
    SEI_RPC_URL: process.env.SEI_RPC_URL,
    SEI_CITREX_ENVIRONMENT: process.env.SEI_CITREX_ENVIRONMENT,
    SEI_SUB_ACCOUNT_ID: process.env.SEI_SUB_ACCOUNT_ID,
  },
  async init(config: Record<string, string>) {
    logger.info('Initializing plugin-sei-perpetual-trading');
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value !== undefined) process.env[key] = String(value);
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
      return 'I can help you trade perpetual contracts on SEI using Citrex protocol with position management and order placement.';
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
      return 'I specialize in SEI perpetual trading using the Citrex protocol. I can place buy/sell orders, manage positions, check balances, monitor PnL, and handle deposits/withdrawals. I support trading pairs like ETHPERP, BTCPERP, and other perpetual contracts available on the platform. You can ask me to place orders, check positions, get account balance, or manage your trading account.';
    },
  },
  routes: [
    {
      name: 'api-place-order',
      path: '/api/perpetual/place-order',
      type: 'POST',
      handler: async (req: any, res: any) => {
        try {
          const { isBuy, price, productId, quantity, orderType, timeInForce } = req.body;
          
          if (isBuy === undefined || !price || !productId || !quantity) {
            return res.status(400).json({ 
              error: 'isBuy, price, productId, and quantity are required' 
            });
          }

          const service = req.runtime.getService(SeiPerpetualTradingService.serviceType) as SeiPerpetualTradingService;
          if (!service) {
            return res.status(500).json({ error: 'SEI perpetual trading service not available' });
          }

          const orderData: OrderData = {
            isBuy,
            price,
            productId,
            quantity,
            orderType: orderType || 'LIMIT',
            timeInForce: timeInForce || 'GTC',
          };

          const result = await service.placeOrder(orderData);
          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to place order',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      name: 'api-get-positions',
      path: '/api/perpetual/positions',
      type: 'GET',
      handler: async (req: any, res: any) => {
        try {
          const { productSymbol } = req.query;

          const service = req.runtime.getService(SeiPerpetualTradingService.serviceType) as SeiPerpetualTradingService;
          if (!service) {
            return res.status(500).json({ error: 'SEI perpetual trading service not available' });
          }

          const positions = await service.getPositions(productSymbol);
          res.json(positions);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get positions',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      name: 'api-get-balance',
      path: '/api/perpetual/balance',
      type: 'GET',
      handler: async (req: any, res: any) => {
        try {
          const service = req.runtime.getService(SeiPerpetualTradingService.serviceType) as SeiPerpetualTradingService;
          if (!service) {
            return res.status(500).json({ error: 'SEI perpetual trading service not available' });
          }

          const balance = await service.getAccountBalance();
          res.json(balance);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get account balance',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      name: 'api-get-products',
      path: '/api/perpetual/products',
      type: 'GET',
      handler: async (req: any, res: any) => {
        try {
          const service = req.runtime.getService(SeiPerpetualTradingService.serviceType) as SeiPerpetualTradingService;
          if (!service) {
            return res.status(500).json({ error: 'SEI perpetual trading service not available' });
          }

          const products = await service.getProducts();
          res.json(products);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get products',
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
  services: [SeiPerpetualTradingService],
  actions: [
    placeOrderAction,
    getPositionsAction,
    getAccountBalanceAction,
    getOpenOrdersAction,
    depositAction,
  ],
  providers: [],
};

export default seiPerpetualTradingPlugin;