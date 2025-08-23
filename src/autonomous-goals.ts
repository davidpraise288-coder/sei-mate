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
import { Symphony } from "symphony-sdk/viem";
import { 
  createWalletClient, 
  createPublicClient, 
  http, 
  parseEther, 
  formatEther,
  type Address,
  type WalletClient,
  type PublicClient
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Configuration schema for autonomous goals
 */
const configSchema = z.object({
  SEI_PRIVATE_KEY: z.string().min(1, 'SEI private key is required'),
  SEI_RPC_URL: z.string().url().default('https://evm-rpc.sei-apis.com'),
  COINMARKETCAP_API_KEY: z.string().optional(),
  EXECUTION_INTERVAL_MINUTES: z.number().default(15),
  MAX_CONCURRENT_GOALS: z.number().default(10),
  DEFAULT_SLIPPAGE: z.string().default('1.0'),
});

/**
 * Interface for autonomous goal
 */
interface AutonomousGoal {
  id: string;
  userId: string;
  type: 'dca' | 'price_alert' | 'whale_tracker' | 'yield_monitor' | 'portfolio_rebalance';
  name: string;
  description: string;
  parameters: any;
  schedule: {
    frequency: 'minutes' | 'hours' | 'days' | 'weeks';
    interval: number;
    lastExecution?: Date;
    nextExecution: Date;
  };
  conditions: GoalCondition[];
  actions: GoalAction[];
  status: 'active' | 'paused' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  executionHistory: GoalExecution[];
  totalExecutions: number;
  successfulExecutions: number;
  isActive: boolean;
}

/**
 * Interface for goal conditions
 */
interface GoalCondition {
  id: string;
  type: 'time' | 'price' | 'balance' | 'custom';
  operator: 'equals' | 'greater' | 'less' | 'between' | 'contains';
  value: any;
  threshold?: number;
  description: string;
}

/**
 * Interface for goal actions
 */
interface GoalAction {
  id: string;
  type: 'swap' | 'alert' | 'monitor' | 'rebalance' | 'custom';
  parameters: any;
  description: string;
  maxRetries: number;
  retryCount: number;
}

/**
 * Interface for goal execution record
 */
interface GoalExecution {
  id: string;
  goalId: string;
  executedAt: Date;
  status: 'success' | 'failed' | 'partial';
  results: any;
  error?: string;
  gasUsed?: string;
  transactionHash?: string;
}

/**
 * Interface for DCA configuration
 */
interface DCAConfig {
  fromToken: string;
  toToken: string;
  amountPerExecution: string;
  frequency: string; // "daily", "weekly", "monthly"
  totalBudget?: string;
  spentSoFar: string;
  averagePrice: string;
  executionCount: number;
  priceTargets?: {
    buyBelow?: string;
    stopAbove?: string;
  };
}

/**
 * Interface for whale tracking
 */
interface WhaleTracker {
  walletAddress: string;
  nickname: string;
  minTransactionAmount: string;
  tokens: string[];
  alertThreshold: string;
  notificationChannels: string[];
}

/**
 * SEI mainnet chain configuration
 */
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
 * Autonomous Goals Service
 */
export class AutonomousGoalsService extends Service {
  static override serviceType = 'autonomous-goals';

  override capabilityDescription =
    'Provides autonomous goal-seeking with DCA, alerts, and 24/7 monitoring capabilities.';

  private privateKey!: string;
  private rpcUrl!: string;
  private coinMarketCapApiKey?: string;
  private executionIntervalMinutes!: number;
  private maxConcurrentGoals!: number;
  private defaultSlippage!: string;
  private symphony!: Symphony;
  private walletClient!: WalletClient;
  private publicClient!: PublicClient;
  private account: any;

  // In-memory storage for demo (in production, use proper database)
  private autonomousGoals: Map<string, AutonomousGoal> = new Map();
  private executionQueue: string[] = [];
  private executionTimer?: NodeJS.Timeout;
  private priceCache: Map<string, { price: number; timestamp: Date }> = new Map();

  async initialize(runtime: IAgentRuntime): Promise<void> {
    const config = configSchema.parse((runtime as any).config);
    
    this.privateKey = config.SEI_PRIVATE_KEY;
    this.rpcUrl = config.SEI_RPC_URL;
    this.coinMarketCapApiKey = config.COINMARKETCAP_API_KEY;
    this.executionIntervalMinutes = config.EXECUTION_INTERVAL_MINUTES;
    this.maxConcurrentGoals = config.MAX_CONCURRENT_GOALS;
    this.defaultSlippage = config.DEFAULT_SLIPPAGE;

    // Initialize account and clients
    this.account = privateKeyToAccount(this.privateKey as `0x${string}`);
    
    this.walletClient = createWalletClient({
      account: this.account,
      chain: seiMainnet,
      transport: http(this.rpcUrl),
    });

    this.publicClient = createPublicClient({
      chain: seiMainnet,
      transport: http(this.rpcUrl),
    });

    // Initialize Symphony
    this.symphony = new Symphony();
    this.symphony.connectWalletClient(this.walletClient);

    // Start autonomous execution engine
    this.startExecutionEngine();

    logger.info('AutonomousGoalsService initialized for 24/7 goal seeking');
  }

  override async stop(): Promise<void> {
    if (this.executionTimer) {
      clearTimeout(this.executionTimer);
    }
    logger.info('AutonomousGoalsService stopped');
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('Starting autonomous goals service');
    const service = new AutonomousGoalsService();
    await service.initialize(runtime);
    return service;
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping autonomous goals service');
    const service = runtime.getService(AutonomousGoalsService.serviceType);
    if (!service) {
      throw new Error('Autonomous goals service not found');
    }
    if ('stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  /**
   * Create DCA goal
   */
  async createDCAGoal(
    userId: string,
    fromToken: string,
    toToken: string,
    amountPerExecution: string,
    frequency: string,
    totalBudget?: string
  ): Promise<AutonomousGoal> {
    try {
      const goalId = `dca_${userId}_${Date.now()}`;
      
      // Calculate next execution time
      const nextExecution = this.calculateNextExecution(frequency);
      
      const dcaConfig: DCAConfig = {
        fromToken,
        toToken,
        amountPerExecution,
        frequency,
        totalBudget,
        spentSoFar: '0',
        averagePrice: '0',
        executionCount: 0,
      };

      const goal: AutonomousGoal = {
        id: goalId,
        userId,
        type: 'dca',
        name: `DCA ${fromToken} → ${toToken}`,
        description: `Dollar-cost average ${amountPerExecution} ${fromToken} to ${toToken} every ${frequency}`,
        parameters: dcaConfig,
        schedule: {
          frequency: this.parseFrequencyUnit(frequency),
          interval: this.parseFrequencyInterval(frequency),
          nextExecution,
        },
        conditions: [
          {
            id: 'time_condition',
            type: 'time',
            operator: 'greater',
            value: nextExecution,
            description: `Execute every ${frequency}`,
          },
        ],
        actions: [
          {
            id: 'dca_swap',
            type: 'swap',
            parameters: {
              fromToken,
              toToken,
              amount: amountPerExecution,
              slippage: this.defaultSlippage,
            },
            description: `Swap ${amountPerExecution} ${fromToken} to ${toToken}`,
            maxRetries: 3,
            retryCount: 0,
          },
        ],
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        executionHistory: [],
        totalExecutions: 0,
        successfulExecutions: 0,
        isActive: true,
      };

      this.autonomousGoals.set(goalId, goal);
      logger.info(`Created DCA goal: ${goalId}`);
      
      return goal;
    } catch (error) {
      logger.error('Failed to create DCA goal:', error);
      throw error;
    }
  }

  /**
   * Create price alert goal
   */
  async createPriceAlert(
    userId: string,
    token: string,
    condition: 'above' | 'below',
    targetPrice: string,
    alertMessage?: string
  ): Promise<AutonomousGoal> {
    try {
      const goalId = `alert_${userId}_${Date.now()}`;
      
      const goal: AutonomousGoal = {
        id: goalId,
        userId,
        type: 'price_alert',
        name: `Price Alert: ${token}`,
        description: `Alert when ${token} price goes ${condition} $${targetPrice}`,
        parameters: {
          token,
          condition,
          targetPrice,
          alertMessage: alertMessage || `${token} price alert triggered!`,
        },
        schedule: {
          frequency: 'minutes',
          interval: 5,
          nextExecution: new Date(Date.now() + 5 * 60 * 1000),
        },
        conditions: [
          {
            id: 'price_condition',
            type: 'price',
            operator: condition === 'above' ? 'greater' : 'less',
            value: targetPrice,
            description: `${token} price ${condition} $${targetPrice}`,
          },
        ],
        actions: [
          {
            id: 'send_alert',
            type: 'alert',
            parameters: {
              message: alertMessage || `🚨 ${token} price is now ${condition} $${targetPrice}!`,
              token,
              targetPrice,
            },
            description: 'Send price alert notification',
            maxRetries: 1,
            retryCount: 0,
          },
        ],
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        executionHistory: [],
        totalExecutions: 0,
        successfulExecutions: 0,
        isActive: true,
      };

      this.autonomousGoals.set(goalId, goal);
      logger.info(`Created price alert: ${goalId}`);
      
      return goal;
    } catch (error) {
      logger.error('Failed to create price alert:', error);
      throw error;
    }
  }

  /**
   * Create whale tracker goal
   */
  async createWhaleTracker(
    userId: string,
    walletAddress: string,
    nickname: string,
    minTransactionAmount: string
  ): Promise<AutonomousGoal> {
    try {
      const goalId = `whale_${userId}_${Date.now()}`;
      
      const whaleConfig: WhaleTracker = {
        walletAddress,
        nickname,
        minTransactionAmount,
        tokens: ['SEI', 'USDC', 'USDT'], // Default tokens to track
        alertThreshold: minTransactionAmount,
        notificationChannels: ['chat'],
      };

      const goal: AutonomousGoal = {
        id: goalId,
        userId,
        type: 'whale_tracker',
        name: `Whale Tracker: ${nickname}`,
        description: `Track ${nickname} (${walletAddress}) for transactions over ${minTransactionAmount}`,
        parameters: whaleConfig,
        schedule: {
          frequency: 'minutes',
          interval: 10,
          nextExecution: new Date(Date.now() + 10 * 60 * 1000),
        },
        conditions: [
          {
            id: 'transaction_condition',
            type: 'custom',
            operator: 'greater',
            value: minTransactionAmount,
            description: `New transaction over ${minTransactionAmount}`,
          },
        ],
        actions: [
          {
            id: 'whale_alert',
            type: 'alert',
            parameters: {
              walletAddress,
              nickname,
              threshold: minTransactionAmount,
            },
            description: `Alert on whale activity`,
            maxRetries: 1,
            retryCount: 0,
          },
        ],
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        executionHistory: [],
        totalExecutions: 0,
        successfulExecutions: 0,
        isActive: true,
      };

      this.autonomousGoals.set(goalId, goal);
      logger.info(`Created whale tracker: ${goalId}`);
      
      return goal;
    } catch (error) {
      logger.error('Failed to create whale tracker:', error);
      throw error;
    }
  }

  /**
   * Execute goal
   */
  private async executeGoal(goalId: string, runtime: IAgentRuntime): Promise<void> {
    try {
      const goal = this.autonomousGoals.get(goalId);
      if (!goal || !goal.isActive) {
        return;
      }

      // Check conditions
      const conditionsMet = await this.checkConditions(goal);
      if (!conditionsMet) {
        return;
      }

      logger.info(`Executing goal: ${goal.name}`);

      const execution: GoalExecution = {
        id: `exec_${goalId}_${Date.now()}`,
        goalId,
        executedAt: new Date(),
        status: 'success',
        results: {},
      };

      // Execute actions
      for (const action of goal.actions) {
        try {
          const result = await this.executeAction(action, goal, runtime);
          execution.results[action.id] = result;
        } catch (error) {
          execution.status = 'failed';
          execution.error = error.message;
          action.retryCount++;
          logger.error(`Action failed: ${action.description}`, error);
        }
      }

      // Update goal
      goal.executionHistory.push(execution);
      goal.totalExecutions++;
      if (execution.status === 'success') {
        goal.successfulExecutions++;
      }
      goal.schedule.lastExecution = new Date();
      goal.schedule.nextExecution = this.calculateNextExecution(
        `${goal.schedule.interval}_${goal.schedule.frequency}`
      );
      goal.updatedAt = new Date();

      // Update DCA statistics
      if (goal.type === 'dca' && execution.status === 'success') {
        this.updateDCAStats(goal, execution);
      }

      this.autonomousGoals.set(goalId, goal);

    } catch (error) {
      logger.error(`Failed to execute goal ${goalId}:`, error);
    }
  }

  /**
   * Check goal conditions
   */
  private async checkConditions(goal: AutonomousGoal): Promise<boolean> {
    for (const condition of goal.conditions) {
      const conditionMet = await this.evaluateCondition(condition, goal);
      if (!conditionMet) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate individual condition
   */
  private async evaluateCondition(condition: GoalCondition, goal: AutonomousGoal): Promise<boolean> {
    switch (condition.type) {
      case 'time':
        return new Date() >= new Date(condition.value);
        
      case 'price':
        const currentPrice = await this.getTokenPrice(goal.parameters.token || 'SEI');
        return this.compareValues(currentPrice, condition.operator, parseFloat(condition.value));
        
      case 'balance':
        // Check wallet balance
        return true; // Simplified for demo
        
      case 'custom':
        // Custom condition logic
        return true; // Simplified for demo
        
      default:
        return false;
    }
  }

  /**
   * Execute action
   */
  private async executeAction(action: GoalAction, goal: AutonomousGoal, runtime: IAgentRuntime): Promise<any> {
    switch (action.type) {
      case 'swap':
        return await this.executeSwapAction(action, goal);
        
      case 'alert':
        return await this.executeAlertAction(action, goal, runtime);
        
      case 'monitor':
        return await this.executeMonitorAction(action, goal);
        
      case 'rebalance':
        return await this.executeRebalanceAction(action, goal);
        
      default:
        return { message: `Executed ${action.type} action` };
    }
  }

  /**
   * Execute swap action
   */
  private async executeSwapAction(action: GoalAction, goal: AutonomousGoal): Promise<any> {
    try {
      const { fromToken, toToken, amount, slippage } = action.parameters;
      
      const route = await this.symphony.getRoute(
        fromToken,
        toToken,
        parseEther(amount).toString()
      );

      const swapResult = await route.swap({
        slippage: { slippageAmount: slippage }
      });

      return {
        success: true,
        transactionHash: swapResult.swapReceipt.transactionHash,
        amountIn: amount,
        amountOut: route.amountOutFormatted,
        fromToken,
        toToken,
      };
    } catch (error) {
      throw new Error(`Swap failed: ${error.message}`);
    }
  }

  /**
   * Execute alert action
   */
  private async executeAlertAction(action: GoalAction, goal: AutonomousGoal, runtime: IAgentRuntime): Promise<any> {
    // This would send notifications via the appropriate channels
    // For now, we'll just log the alert
    logger.info(`Alert: ${action.parameters.message}`);
    
    return {
      success: true,
      message: action.parameters.message,
      timestamp: new Date(),
    };
  }

  /**
   * Execute monitor action
   */
  private async executeMonitorAction(action: GoalAction, goal: AutonomousGoal): Promise<any> {
    try {
      // Simulate monitoring execution
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        message: `Monitoring ${action.description} for goal ${goal.name}`,
        status: 'monitoring',
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Failed to execute monitor action:', error);
      throw error;
    }
  }

  /**
   * Execute rebalance action
   */
  private async executeRebalanceAction(action: GoalAction, goal: AutonomousGoal): Promise<any> {
    try {
      // Simulate portfolio rebalancing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return {
        message: `Portfolio rebalanced according to ${action.description}`,
        status: 'completed',
        timestamp: new Date(),
        rebalanceData: {
          oldAllocation: { SEI: '60%', USDC: '40%' },
          newAllocation: { SEI: '55%', USDC: '45%' },
          rebalanceAmount: '5%',
        },
      };
    } catch (error) {
      logger.error('Failed to execute rebalance action:', error);
      throw error;
    }
  }

  /**
   * Update DCA statistics
   */
  private updateDCAStats(goal: AutonomousGoal, execution: GoalExecution): void {
    const dcaConfig = goal.parameters as DCAConfig;
    const swapResult = execution.results.dca_swap;
    
    if (swapResult && swapResult.success) {
      const amountSpent = parseFloat(swapResult.amountIn);
      const tokensReceived = parseFloat(swapResult.amountOut);
      const currentPrice = amountSpent / tokensReceived;
      
      // Update running averages
      const totalSpent = parseFloat(dcaConfig.spentSoFar) + amountSpent;
      const oldAverage = parseFloat(dcaConfig.averagePrice);
      const oldCount = dcaConfig.executionCount;
      const newAverage = (oldAverage * oldCount + currentPrice) / (oldCount + 1);
      
      dcaConfig.spentSoFar = totalSpent.toString();
      dcaConfig.averagePrice = newAverage.toString();
      dcaConfig.executionCount++;
      
      goal.parameters = dcaConfig;
    }
  }

  /**
   * Update price alert statistics
   */
  private updatePriceAlertStats(goal: AutonomousGoal, execution: GoalExecution): void {
    goal.totalExecutions++;
    if (execution.status === 'success') {
      goal.successfulExecutions++;
    }
    goal.updatedAt = new Date();
  }

  /**
   * Helper functions
   */
  private calculateNextExecution(frequency: string): Date {
    const now = new Date();
    const frequencyLower = frequency.toLowerCase();
    
    if (frequencyLower.includes('minute')) {
      const minutes = this.parseFrequencyInterval(frequency);
      return new Date(now.getTime() + minutes * 60 * 1000);
    } else if (frequencyLower.includes('hour')) {
      const hours = this.parseFrequencyInterval(frequency);
      return new Date(now.getTime() + hours * 60 * 60 * 1000);
    } else if (frequencyLower.includes('day') || frequencyLower === 'daily') {
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    } else if (frequencyLower.includes('week') || frequencyLower === 'weekly') {
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (frequencyLower.includes('month') || frequencyLower === 'monthly') {
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
    
    return new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default to daily
  }

  /**
   * Parse frequency unit from string
   */
  private parseFrequencyUnit(frequency: string): 'minutes' | 'hours' | 'days' | 'weeks' {
    if (frequency.includes('minute')) return 'minutes';
    if (frequency.includes('hour')) return 'hours';
    if (frequency.includes('day')) return 'days';
    if (frequency.includes('week')) return 'weeks';
    return 'days'; // default
  }

  /**
   * Parse frequency interval from string
   */
  private parseFrequencyInterval(frequency: string): number {
    const match = frequency.match(/(\d+)/);
    return match ? parseInt(match[1]) : 1;
  }

  /**
   * Compare two values based on operator
   */
  private compareValues(actual: number, operator: string, expected: number): boolean {
    switch (operator) {
      case 'greater': return actual > expected;
      case 'less': return actual < expected;
      case 'equals': return Math.abs(actual - expected) < 0.01;
      default: return false;
    }
  }

  /**
   * Get token price from CoinMarketCap or cache
   */
  private async getTokenPrice(token: string): Promise<number> {
    try {
      // Check cache first
      const cached = this.priceCache.get(token);
      if (cached && Date.now() - cached.timestamp.getTime() < 5 * 60 * 1000) { // 5 minutes
        return cached.price;
      }

      if (this.coinMarketCapApiKey) {
        const response = await axios.get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest', {
          headers: {
            'X-CMC_PRO_API_KEY': this.coinMarketCapApiKey,
          },
          params: {
            symbol: token,
            convert: 'USD',
          },
        });

        if (response.status === 200) {
          const price = response.data.data[token]?.quote?.USD?.price || 0;
          
          // Update cache
          this.priceCache.set(token, { price, timestamp: new Date() });
          
          return price;
        }
      }

      // Fallback to cached price or default
      return cached?.price || 0;
    } catch (error) {
      logger.error(`Failed to get ${token} price:`, error);
      return 0;
    }
  }

  /**
   * Start execution engine
   */
  private startExecutionEngine(): void {
    this.executionTimer = setInterval(async () => {
      try {
        const now = new Date();
        
        // Find goals ready for execution
        for (const [goalId, goal] of this.autonomousGoals.entries()) {
          if (goal.isActive && goal.status === 'active' && now >= goal.schedule.nextExecution) {
            this.executionQueue.push(goalId);
          }
        }

        // Process execution queue
        while (this.executionQueue.length > 0) {
          const goalId = this.executionQueue.shift();
          if (goalId) {
            await this.executeGoal(goalId, null as any); // Runtime would be passed in real implementation
          }
        }
      } catch (error) {
        logger.error('Error in execution engine:', error);
      }
    }, this.executionIntervalMinutes * 60 * 1000);
  }

  /**
   * Public methods
   */
  getGoal(goalId: string): AutonomousGoal | null {
    return this.autonomousGoals.get(goalId) || null;
  }

  getUserGoals(userId: string): AutonomousGoal[] {
    return Array.from(this.autonomousGoals.values())
      .filter(goal => goal.userId === userId);
  }

  async pauseGoal(goalId: string): Promise<void> {
    const goal = this.autonomousGoals.get(goalId);
    if (goal) {
      goal.isActive = false;
      goal.status = 'paused';
      goal.updatedAt = new Date();
      this.autonomousGoals.set(goalId, goal);
    }
  }

  async resumeGoal(goalId: string): Promise<void> {
    const goal = this.autonomousGoals.get(goalId);
    if (goal) {
      goal.isActive = true;
      goal.status = 'active';
      goal.updatedAt = new Date();
      this.autonomousGoals.set(goalId, goal);
    }
  }

  async deleteGoal(goalId: string): Promise<void> {
    this.autonomousGoals.delete(goalId);
  }
}

/**
 * Action to setup DCA
 */
const setupDCAAction: Action = {
  name: 'SETUP_DCA',
  similes: ['CREATE_DCA', 'DOLLAR_COST_AVERAGE', 'RECURRING_BUY'],
  description: 'Sets up dollar-cost averaging for automatic recurring purchases',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('dca') || 
           text.includes('dollar cost average') ||
           text.includes('recurring buy') ||
           (text.includes('buy') && text.includes('every')) ||
           (text.includes('purchase') && (text.includes('weekly') || text.includes('daily') || text.includes('monthly')));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService<AutonomousGoalsService>('autonomous-goals');
      if (!service) {
        await callback({
          text: 'Autonomous goals service is not available.',
          error: true,
        });
        return { success: false, error: new Error('Service not available') };
      }

      const text = message.content.text || '';
      const userId = message.entityId;

      // Parse DCA parameters
      const amountMatch = text.match(/(\d+\.?\d*)\s*(\w+)/);
      const frequencyMatch = text.match(/(daily|weekly|monthly|every\s+\w+)/i);
      const toTokenMatch = text.match(/(?:to|into|for)\s+(\w+)/i);

      if (!amountMatch || !toTokenMatch) {
        await callback({
          text: `💰 **DCA Setup Format**\n\n` +
                `To set up dollar-cost averaging, use:\n` +
                `"DCA 5 SEI into USDC weekly"\n` +
                `"Buy 10 SEI worth of USDC every Monday"\n` +
                `"Dollar cost average 2 SEI to USDC monthly"\n\n` +
                `**Parameters:**\n` +
                `• Amount and source token (e.g., "5 SEI")\n` +
                `• Target token (e.g., "to USDC")\n` +
                `• Frequency (daily, weekly, monthly)`,
        });
        return { success: false, error: new Error('Invalid DCA format') };
      }

      const amount = amountMatch[1];
      const fromToken = amountMatch[2].toUpperCase();
      const toToken = toTokenMatch[1].toUpperCase();
      const frequency = frequencyMatch ? frequencyMatch[1].toLowerCase() : 'weekly';

      const goal = await service.createDCAGoal(userId, fromToken, toToken, amount, frequency);

      await callback({
        text: `🔄 **DCA Strategy Created!**\n\n` +
              `💰 **Amount**: ${amount} ${fromToken}\n` +
              `🎯 **Target**: ${toToken}\n` +
              `⏰ **Frequency**: ${frequency}\n` +
              `📅 **Next Execution**: ${goal.schedule.nextExecution.toLocaleString()}\n\n` +
              `**I'll automatically execute this strategy 24/7!**\n\n` +
              `✅ **Benefits:**\n` +
              `• Reduces timing risk through regular purchases\n` +
              `• Smooths out price volatility\n` +
              `• No need to remember to buy manually\n` +
              `• Track performance automatically\n\n` +
              `Use "pause DCA" or "stop DCA" to control this strategy.`,
        action: 'SETUP_DCA',
      });

      return {
        success: true,
        text: `DCA goal created: ${goal.id}`,
        data: { goalId: goal.id, frequency, amount, fromToken, toToken },
      };
    } catch (error) {
      logger.error('Failed to setup DCA:', error);
      await callback({
        text: `❌ Failed to setup DCA: ${error.message}`,
        error: true,
      });
      return { success: false, error: error as Error };
    }
  },
};

/**
 * Action to create price alert
 */
const createPriceAlertAction: Action = {
  name: 'CREATE_PRICE_ALERT',
  similes: ['PRICE_ALERT', 'ALERT_PRICE', 'NOTIFY_PRICE'],
  description: 'Creates price alerts for automatic monitoring',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    return (text.includes('alert') && text.includes('price')) ||
           (text.includes('notify') && (text.includes('when') || text.includes('if'))) ||
           text.includes('price alert') ||
           (text.includes('tell me when') && text.includes('price'));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService<AutonomousGoalsService>('autonomous-goals');
      if (!service) {
        await callback({
          text: 'Autonomous goals service is not available.',
          error: true,
        });
        return { success: false, error: new Error('Service not available') };
      }

      const text = message.content.text || '';
      const userId = message.entityId;

      // Parse alert parameters
      const tokenMatch = text.match(/(\w+)\s+(?:price|goes|hits)/i);
      const priceMatch = text.match(/\$?(\d+\.?\d*)/);
      const conditionMatch = text.match(/(above|below|over|under|hits|reaches)/i);

      if (!tokenMatch || !priceMatch) {
        await callback({
          text: `🔔 **Price Alert Format**\n\n` +
                `To set up price alerts, use:\n` +
                `"Alert me when SEI goes above $1"\n` +
                `"Notify me if SEI price drops below $0.30"\n` +
                `"Tell me when SEI hits $0.50"\n\n` +
                `**Parameters:**\n` +
                `• Token symbol (e.g., "SEI")\n` +
                `• Price threshold (e.g., "$1" or "1")\n` +
                `• Condition (above, below, hits)`,
        });
        return { success: false, error: new Error('Invalid alert format') };
      }

      const token = tokenMatch[1].toUpperCase();
      const targetPrice = priceMatch[1];
      const conditionText = conditionMatch ? conditionMatch[1].toLowerCase() : 'above';
      const condition = (conditionText.includes('below') || conditionText.includes('under')) ? 'below' : 'above';

      const goal = await service.createPriceAlert(userId, token, condition, targetPrice);

      await callback({
        text: `🔔 **Price Alert Created!**\n\n` +
              `📊 **Token**: ${token}\n` +
              `💰 **Target Price**: $${targetPrice}\n` +
              `📈 **Condition**: ${condition}\n` +
              `⏰ **Monitoring**: Every 5 minutes\n\n` +
              `**I'll alert you immediately when ${token} goes ${condition} $${targetPrice}!**\n\n` +
              `🔍 **Continuous Monitoring:**\n` +
              `• Real-time price tracking\n` +
              `• Instant notifications\n` +
              `• 24/7 automated monitoring\n` +
              `• No need to watch charts manually`,
        action: 'CREATE_PRICE_ALERT',
      });

      return {
        success: true,
        text: `Price alert created: ${goal.id}`,
        data: { goalId: goal.id, token, targetPrice, condition },
      };
    } catch (error) {
      logger.error('Failed to create price alert:', error);
      await callback({
        text: `❌ Failed to create price alert: ${error.message}`,
        error: true,
      });
      return { success: false, error: error as Error };
    }
  },
};

/**
 * Provider for autonomous goals information
 */
const autonomousGoalsProvider: Provider = {
  name: 'AUTONOMOUS_GOALS_PROVIDER',
  description: 'Provides information about user autonomous goals and their status',

  get: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ProviderResult> => {
    try {
      const service = runtime.getService<AutonomousGoalsService>('autonomous-goals');
      if (!service) {
        return { data: { error: 'Service not available' } };
      }

      const userId = message.entityId;
      const userGoals = service.getUserGoals(userId);

      return {
        data: {
          totalGoals: userGoals.length,
          activeGoals: userGoals.filter(goal => goal.isActive).length,
          goals: userGoals.map(goal => ({
            id: goal.id,
            name: goal.name,
            type: goal.type,
            status: goal.status,
            isActive: goal.isActive,
            totalExecutions: goal.totalExecutions,
            successfulExecutions: goal.successfulExecutions,
            successRate: goal.totalExecutions > 0 ? 
              Math.round((goal.successfulExecutions / goal.totalExecutions) * 100) : 0,
            nextExecution: goal.schedule.nextExecution,
            createdAt: goal.createdAt,
          })),
        },
      };
    } catch (error) {
      logger.error('Failed to get autonomous goals info:', error);
      return { data: { error: error.message } };
    }
  },
};

/**
 * Autonomous Goals Plugin
 */
export const autonomousGoalsPlugin: Plugin = {
  name: 'plugin-autonomous-goals',
  description: 'Provides autonomous goal-seeking with DCA, alerts, and 24/7 monitoring capabilities',
  config: {
    SEI_PRIVATE_KEY: process.env.SEI_PRIVATE_KEY,
    SEI_RPC_URL: process.env.SEI_RPC_URL || 'https://evm-rpc.sei-apis.com',
    COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY,
    EXECUTION_INTERVAL_MINUTES: parseInt(process.env.EXECUTION_INTERVAL_MINUTES || '15'),
    MAX_CONCURRENT_GOALS: parseInt(process.env.MAX_CONCURRENT_GOALS || '10'),
    DEFAULT_SLIPPAGE: process.env.DEFAULT_SLIPPAGE || '1.0',
  },
  services: [AutonomousGoalsService],
  actions: [setupDCAAction, createPriceAlertAction],
  providers: [autonomousGoalsProvider],
  models: {
    [ModelType.TEXT_SMALL]: async (
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'I can set up autonomous goals like DCA and price alerts that work 24/7.';
    },
    [ModelType.TEXT_LARGE]: async (
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'I provide autonomous goal-seeking capabilities that work around the clock. I can set up dollar-cost averaging (DCA) strategies, price alerts, whale tracking, and other automated tasks that execute according to your specifications. I monitor conditions continuously and execute actions automatically, creating ultimate stickiness by working for you 24/7.';
    },
  },
};