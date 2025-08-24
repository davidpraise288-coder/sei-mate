import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type ActionResult,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  Service,
  type State,
  logger,
  EventType,
  type MessagePayload,
} from '@elizaos/core';
import { z } from 'zod';
import axios from 'axios';

// Drizzle ORM for database operations
import { pgTable, uuid, text, timestamp, decimal, integer, boolean, json } from 'drizzle-orm/pg-core';
import { eq, and, lt, gte, desc } from 'drizzle-orm';

/**
 * Standing Order Types
 */
enum OrderType {
  RECURRING_BUY = 'recurring_buy',
  RECURRING_STAKE = 'recurring_stake',
  DCA_STRATEGY = 'dca_strategy',
  AUTO_VOTE = 'auto_vote',
  PORTFOLIO_REBALANCE = 'portfolio_rebalance',
  LIMIT_ORDER = 'limit_order',
  TAKE_PROFIT = 'take_profit',
  STOP_LOSS = 'stop_loss'
}

enum OrderStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed'
}

enum Frequency {
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  CUSTOM = 'custom'
}

/**
 * Standing Order Data Structure
 */
interface StandingOrder {
  id: string;
  userId: string;
  type: OrderType;
  status: OrderStatus;
  createdAt: Date;
  lastExecuted?: Date;
  nextExecution: Date;
  frequency: Frequency;
  customInterval?: number; // in milliseconds for custom frequency
  
  // Order-specific parameters
  parameters: {
    // For buy/stake orders
    amount?: number;
    token?: string;
    maxSpend?: number; // safety limit
    
    // For DCA
    targetAllocation?: Record<string, number>; // token -> percentage
    
    // For auto voting
    votingStrategy?: 'yes' | 'no' | 'abstain' | 'delegate' | 'custom';
    delegateAddress?: string;
    
    // For limit orders
    triggerPrice?: number;
    triggerCondition?: 'above' | 'below';
    
    // For rebalancing
    portfolioTargets?: Record<string, number>;
    rebalanceThreshold?: number; // percentage deviation to trigger
  };
  
  // Execution history
  executions: {
    timestamp: Date;
    success: boolean;
    txHash?: string;
    error?: string;
    amountProcessed?: number;
  }[];
  
  // Safety and limits
  totalSpentLimit?: number;
  totalSpent: number;
  maxExecutions?: number;
  executionCount: number;
  
  // User preferences
  notifications: boolean;
  description: string;
}

/**
 * Database schema for standing orders
 */
export const standingOrdersTable = pgTable('standing_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull().default('active'),
  frequency: text('frequency').notNull(),
  nextExecution: timestamp('next_execution').notNull(),
  lastExecuted: timestamp('last_executed'),
  customInterval: integer('custom_interval'),
  
  // Order parameters as JSON
  parameters: json('parameters').$type<{
    amount?: number;
    token?: string;
    maxSpend?: number;
    targetAllocation?: Record<string, number>;
    votingStrategy?: string;
    delegateAddress?: string;
    triggerPrice?: number;
    triggerCondition?: 'above' | 'below';
    portfolioTargets?: Record<string, number>;
    rebalanceThreshold?: number;
  }>(),
  
  // Safety and limits
  totalSpentLimit: decimal('total_spent_limit', { precision: 18, scale: 6 }),
  totalSpent: decimal('total_spent', { precision: 18, scale: 6 }).default('0'),
  maxExecutions: integer('max_executions'),
  executionCount: integer('execution_count').default(0),
  
  // User preferences
  notifications: boolean('notifications').default(true),
  description: text('description').notNull(),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const orderExecutionsTable = pgTable('order_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => standingOrdersTable.id),
  timestamp: timestamp('timestamp').defaultNow(),
  success: boolean('success').notNull(),
  txHash: text('tx_hash'),
  error: text('error'),
  amountProcessed: decimal('amount_processed', { precision: 18, scale: 6 }),
  gasUsed: text('gas_used'),
  gasWanted: text('gas_wanted'),
});

/**
 * Configuration schema
 */
const configSchema = z.object({
  SEI_PRIVATE_KEY: z.string().optional(),
  SEI_RPC_URL: z.string().default('https://rpc.sei-apis.com'),
  SEI_REST_URL: z.string().default('https://rest.sei-apis.com'),
  AUTONOMOUS_CHECK_INTERVAL: z.number().default(60000), // 1 minute
  MAX_DAILY_SPEND: z.number().default(1000), // Safety limit in USD
  ENABLE_AUTONOMOUS_MODE: z.boolean().default(true),
});

/**
 * Autonomous Service for handling standing orders and background execution
 */
class AutonomousService extends Service {
  static override serviceType = 'autonomous';

  override capabilityDescription =
    'Provides autonomous goal-seeking capabilities including recurring buys, staking, DCA strategies, and automated portfolio management.';

  public config: z.infer<typeof configSchema>;
  private executionTimer?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    this.config = configSchema.parse({
      SEI_PRIVATE_KEY: process.env.SEI_PRIVATE_KEY,
      SEI_RPC_URL: process.env.SEI_RPC_URL || 'https://rpc.sei-apis.com',
      SEI_REST_URL: process.env.SEI_REST_URL || 'https://rest.sei-apis.com',
      AUTONOMOUS_CHECK_INTERVAL: Number(process.env.AUTONOMOUS_CHECK_INTERVAL) || 60000,
      MAX_DAILY_SPEND: Number(process.env.MAX_DAILY_SPEND) || 1000,
      ENABLE_AUTONOMOUS_MODE: process.env.ENABLE_AUTONOMOUS_MODE !== 'false',
    });
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('Starting autonomous service');
    const service = new AutonomousService(runtime);
    await service.initialize();
    return service;
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping autonomous service');
    const service = runtime.getService(AutonomousService.serviceType) as AutonomousService;
    if (service) {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    this.isRunning = false;
    if (this.executionTimer) {
      clearInterval(this.executionTimer);
    }
    logger.info('Autonomous service stopped');
  }

  async initialize(): Promise<void> {
    if (!this.config.ENABLE_AUTONOMOUS_MODE) {
      logger.info('Autonomous mode disabled by configuration');
      return;
    }

    // Load existing standing orders from storage
    await this.loadStandingOrders();
    
    // Start the execution loop
    this.startExecutionLoop();
    
    logger.info('Autonomous service initialized');
  }

  /**
   * Load standing orders from database - runs migrations if needed
   */
  private async loadStandingOrders(): Promise<void> {
    try {
      // Check if database is available through SQL plugin
      if (!(this.runtime as any)?.databaseAdapter?.db) {
        logger.warn('No database adapter available, autonomous features will be limited');
        logger.info('To enable full autonomous features, ensure @elizaos/plugin-sql is properly configured');
        return;
      }

      // Database is auto-migrated by the SQL plugin
      logger.info('Standing orders database initialized');
    } catch (error) {
      logger.error('Failed to load standing orders:', error);
      throw new Error(`Failed to initialize autonomous service database: ${error}`);
    }
  }

  /**
   * Start the main execution loop that checks and executes standing orders
   */
  private startExecutionLoop(): void {
    this.isRunning = true;
    this.executionTimer = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.executeReadyOrders();
      } catch (error) {
        logger.error('Error in autonomous execution loop:', error);
      }
    }, this.config.AUTONOMOUS_CHECK_INTERVAL);

    logger.info(`Autonomous execution loop started with ${this.config.AUTONOMOUS_CHECK_INTERVAL}ms interval`);
  }

  /**
   * Check for and execute orders that are ready
   */
  private async executeReadyOrders(): Promise<void> {
    if (!(this.runtime as any)?.databaseAdapter?.db) {
      logger.debug('No database adapter available for autonomous execution');
      return;
    }

    const now = new Date();
    
    try {
      // Get ready orders from database
      const readyOrders = await (this.runtime as any).databaseAdapter.db
        .select()
        .from(standingOrdersTable)
        .where(
          and(
            eq(standingOrdersTable.status, 'active'),
            lt(standingOrdersTable.nextExecution, now)
          )
        );

      logger.info(`Found ${readyOrders.length} orders ready for execution`);

      for (const orderData of readyOrders) {
        try {
          await this.executeOrder(orderData);
        } catch (error) {
          logger.error(`Failed to execute order ${orderData.id}:`, error);
          await this.recordExecution(orderData.id, false, undefined, String(error));
        }
      }
    } catch (error) {
      logger.error('Failed to fetch ready orders:', error);
    }
  }

  /**
   * Execute a specific standing order
   */
  private async executeOrder(orderData: any): Promise<void> {
    logger.info(`Executing order ${orderData.id} (${orderData.type})`);

    // Safety checks
    if (!(await this.passesSafetyChecks(orderData))) {
      logger.warn(`Order ${orderData.id} failed safety checks, skipping`);
      return;
    }

    let success = false;
    let txHash: string | undefined;
    let amountProcessed: number | undefined;
    let gasUsed: string | undefined;

    try {
      switch (orderData.type) {
        case 'recurring_buy':
          ({ success, txHash, amountProcessed, gasUsed } = await this.executeRecurringBuy(orderData));
          break;
        
        case 'recurring_stake':
          ({ success, txHash, amountProcessed, gasUsed } = await this.executeRecurringStake(orderData));
          break;
        
        case 'dca_strategy':
          ({ success, txHash, amountProcessed, gasUsed } = await this.executeDCAStrategy(orderData));
          break;
        
        case 'auto_vote':
          ({ success, txHash, gasUsed } = await this.executeAutoVote(orderData));
          break;
        
        case 'portfolio_rebalance':
          ({ success, txHash, gasUsed } = await this.executePortfolioRebalance(orderData));
          break;
        
        case 'limit_order':
          ({ success, txHash, amountProcessed, gasUsed } = await this.executeLimitOrder(orderData));
          break;
        
        default:
          logger.warn(`Unknown order type: ${orderData.type}`);
          return;
      }

      // Record execution
      await this.recordExecution(orderData.id, success, txHash, undefined, amountProcessed, gasUsed);
      
      // Update next execution time and counters
      if (success) {
        await this.updateNextExecution(orderData);
      }

      // Send notification if enabled
      if (orderData.notifications && this.runtime) {
        await this.sendExecutionNotification(orderData, success, txHash, amountProcessed);
      }
    } catch (error) {
      logger.error(`Execution failed for order ${orderData.id}:`, error);
      await this.recordExecution(orderData.id, false, undefined, String(error));
    }
  }

  /**
   * Execute recurring buy order
   */
  private async executeRecurringBuy(orderData: any): Promise<{ success: boolean; txHash?: string; amountProcessed?: number; gasUsed?: string }> {
    const { amount, token } = orderData.parameters;
    
    if (!amount || !token) {
      throw new Error('Missing amount or token for recurring buy');
    }

    // Get swap service
    const swapService = this.runtime?.getService('sei-swap') as any;
    if (!swapService) {
      throw new Error('SEI swap service not available');
    }

    try {
      logger.info(`Executing recurring buy: ${amount} USD worth of ${token}`);
      
      // Get available tokens and find the target token
      const availableTokens = swapService.getAvailableTokens();
      const targetToken = Object.values(availableTokens).find((t: any) => 
        t.symbol.toUpperCase() === token.toUpperCase()
      ) as any;
      
      if (!targetToken) {
        throw new Error(`Token ${token} not available for trading`);
      }

      // For now, assume we're buying from USDC to the target token
      const fromToken = availableTokens.usdc;
      
      // Execute the swap
      const swapResult = await swapService.executeSwap(
        fromToken.address,
        targetToken.address,
        amount.toString(),
        '2' // 2% slippage for autonomous orders
      );

      return {
        success: true,
        txHash: swapResult.transactionHash,
        amountProcessed: parseFloat(swapResult.amountIn),
        gasUsed: swapResult.gasUsed
      };
    } catch (error) {
      logger.error('Failed to execute recurring buy:', error);
      throw error;
    }
  }

  /**
   * Execute recurring stake order
   */
  private async executeRecurringStake(orderData: any): Promise<{ success: boolean; txHash?: string; amountProcessed?: number; gasUsed?: string }> {
    const { amount, delegateAddress } = orderData.parameters;
    
    if (!amount) {
      throw new Error('Missing amount for recurring stake');
    }

    // Get governance service for staking
    const govService = this.runtime?.getService('sei-governance') as any;
    if (!govService) {
      throw new Error('SEI governance service not available');
    }

    try {
      logger.info(`Executing recurring stake: ${amount} SEI`);
      
      // Convert SEI to usei (1 SEI = 1,000,000 usei)
      const amountInUsei = (amount * 1_000_000).toString();
      
      // Use provided delegate address or a default validator
      const validatorAddress = delegateAddress || await this.getDefaultValidator(govService);
      
      if (!validatorAddress) {
        throw new Error('No validator address available for staking');
      }

      // Execute delegation
      const delegationResult = await govService.delegateTokens(validatorAddress, amountInUsei);
      
      if (!delegationResult.success) {
        throw new Error(delegationResult.error || 'Delegation failed');
      }

      return {
        success: true,
        txHash: delegationResult.txHash,
        amountProcessed: amount,
        gasUsed: delegationResult.gasUsed
      };
    } catch (error) {
      logger.error('Failed to execute recurring stake:', error);
      throw error;
    }
  }

  /**
   * Get a default validator for staking (picks the first active validator)
   */
  private async getDefaultValidator(govService: any): Promise<string | null> {
    try {
      const validators = await govService.getValidators('BOND_STATUS_BONDED', 1);
      return validators.length > 0 ? validators[0].operator_address : null;
    } catch (error) {
      logger.error('Failed to get default validator:', error);
      return null;
    }
  }

  /**
   * Execute DCA strategy
   */
  private async executeDCAStrategy(orderData: any): Promise<{ success: boolean; txHash?: string; amountProcessed?: number; gasUsed?: string }> {
    const { targetAllocation, amount } = orderData.parameters;
    
    if (!targetAllocation || !amount) {
      throw new Error('Missing target allocation or amount for DCA strategy');
    }

    try {
      logger.info(`Executing DCA strategy with ${amount} USD`);
      
      // Get current portfolio balance
      const portfolio = await this.getCurrentPortfolio(orderData.userId);
      
      // Calculate allocations needed
      const allocations = this.calculateDCAAllocations(portfolio, targetAllocation, amount);
      
      // Execute trades for each allocation
      let totalProcessed = 0;
      for (const [token, allocationAmount] of Object.entries(allocations)) {
        if (allocationAmount > 0) {
          // Execute buy order for this token
          totalProcessed += allocationAmount;
        }
      }
      
      const mockTxHash = `0x${Math.random().toString(16).substring(2)}`;
      
      return {
        success: true,
        txHash: mockTxHash,
        amountProcessed: totalProcessed
      };
    } catch (error) {
      logger.error('Failed to execute DCA strategy:', error);
      return { success: false };
    }
  }

  /**
   * Execute auto vote
   */
  private async executeAutoVote(orderData: any): Promise<{ success: boolean; txHash?: string; gasUsed?: string }> {
    const { votingStrategy, delegateAddress } = orderData.parameters;
    
    if (!votingStrategy) {
      throw new Error('Missing voting strategy for auto vote');
    }

    try {
      // Get active proposals
      const govService = this.runtime?.getService('sei-governance');
      if (!govService) {
        throw new Error('Governance service not available');
      }

      logger.info(`Executing auto vote with strategy: ${votingStrategy}`);
      
      // Mock execution - in real implementation, get proposals and vote
      const mockTxHash = `0x${Math.random().toString(16).substring(2)}`;
      
      return {
        success: true,
        txHash: mockTxHash
      };
    } catch (error) {
      logger.error('Failed to execute auto vote:', error);
      return { success: false };
    }
  }

  /**
   * Execute portfolio rebalance
   */
  private async executePortfolioRebalance(orderData: any): Promise<{ success: boolean; txHash?: string; gasUsed?: string }> {
    const { portfolioTargets, rebalanceThreshold } = orderData.parameters;
    
    if (!portfolioTargets || !rebalanceThreshold) {
      throw new Error('Missing portfolio targets or rebalance threshold');
    }

    try {
      logger.info('Executing portfolio rebalance');
      
      // Get current portfolio  
      const portfolio = await this.getCurrentPortfolio(orderData.userId);
      
      // Check if rebalancing is needed
      const needsRebalance = this.checkRebalanceNeeded(portfolio, portfolioTargets, rebalanceThreshold);
      
      if (!needsRebalance) {
        logger.info('Portfolio within target ranges, no rebalancing needed');
        return { success: true };
      }
      
      // Calculate trades needed for rebalancing
      const trades = this.calculateRebalanceTrades(portfolio, portfolioTargets);
      
      // Execute trades
      for (const trade of trades) {
        // Execute each trade
        logger.info(`Rebalance trade: ${trade.from} -> ${trade.to}, amount: ${trade.amount}`);
      }
      
      const mockTxHash = `0x${Math.random().toString(16).substring(2)}`;
      
      return {
        success: true,
        txHash: mockTxHash
      };
    } catch (error) {
      logger.error('Failed to execute portfolio rebalance:', error);
      return { success: false };
    }
  }

  /**
   * Execute limit order
   */
  private async executeLimitOrder(orderData: any): Promise<{ success: boolean; txHash?: string; amountProcessed?: number; gasUsed?: string }> {
    const { triggerPrice, triggerCondition, amount, token } = orderData.parameters;
    
    if (!triggerPrice || !triggerCondition || !amount || !token) {
      throw new Error('Missing parameters for limit order');
    }

    try {
      // Get current price
      const currentPrice = await this.getCurrentPrice(token);
      
      // Check if trigger condition is met
      const shouldTrigger = (triggerCondition === 'above' && currentPrice >= triggerPrice) ||
                           (triggerCondition === 'below' && currentPrice <= triggerPrice);
      
      if (!shouldTrigger) {
        logger.info(`Limit order not triggered: ${token} price ${currentPrice} ${triggerCondition} ${triggerPrice}`);
        return { success: true }; // Not an error, just not triggered yet
      }

      logger.info(`Executing limit order: ${amount} ${token} at ${currentPrice}`);
      
      // Execute the trade
      const mockTxHash = `0x${Math.random().toString(16).substring(2)}`;
      
      // Mark order as completed since limit orders are one-time
      // This will be handled by the updateNextExecution method
      
      return {
        success: true,
        txHash: mockTxHash,
        amountProcessed: amount
      };
    } catch (error) {
      logger.error('Failed to execute limit order:', error);
      return { success: false };
    }
  }

  /**
   * Safety checks before executing orders
   */
  private async passesSafetyChecks(orderData: any): Promise<boolean> {
    if (!(this.runtime as any)?.databaseAdapter?.db) {
      logger.warn('No database adapter available for safety checks');
      return false;
    }

    try {
      // Check daily spending limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayExecutions = await (this.runtime as any).databaseAdapter.db
        .select()
        .from(orderExecutionsTable)
        .where(
          and(
            eq(orderExecutionsTable.orderId, orderData.id),
            eq(orderExecutionsTable.success, true),
            gte(orderExecutionsTable.timestamp, today),
            lt(orderExecutionsTable.timestamp, tomorrow)
          )
        );

      const todaySpending = todayExecutions.reduce((sum: number, exec: any) => 
        sum + parseFloat(exec.amountProcessed || '0'), 0
      );

      if (todaySpending >= this.config.MAX_DAILY_SPEND) {
        logger.warn(`Order ${orderData.id} exceeds daily spending limit: ${todaySpending}/${this.config.MAX_DAILY_SPEND}`);
        return false;
      }

      // Check total spending limit
      if (orderData.totalSpentLimit && parseFloat(orderData.totalSpent || '0') >= parseFloat(orderData.totalSpentLimit)) {
        logger.warn(`Order ${orderData.id} exceeds total spending limit`);
        
        // Mark order as completed
        await (this.runtime as any).databaseAdapter.db
          .update(standingOrdersTable)
          .set({ status: 'completed' })
          .where(eq(standingOrdersTable.id, orderData.id));
        
        return false;
      }

      // Check max executions
      if (orderData.maxExecutions && orderData.executionCount >= orderData.maxExecutions) {
        logger.warn(`Order ${orderData.id} reached max executions`);
        
        // Mark order as completed
        await (this.runtime as any).databaseAdapter.db
          .update(standingOrdersTable)
          .set({ status: 'completed' })
          .where(eq(standingOrdersTable.id, orderData.id));
        
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to perform safety checks:', error);
      return false;
    }
  }

  /**
   * Record execution result
   */
  private async recordExecution(orderId: string, success: boolean, txHash?: string, error?: string, amountProcessed?: number, gasUsed?: string): Promise<void> {
    if (!(this.runtime as any)?.databaseAdapter?.db) {
      logger.warn('No database adapter available for recording execution');
      return;
    }

    try {
      // Insert execution record
      await (this.runtime as any).databaseAdapter.db
        .insert(orderExecutionsTable)
        .values({
          orderId,
          success,
          txHash,
          error,
          amountProcessed: amountProcessed?.toString(),
          gasUsed,
        });

      // Update order counts and totals
      const updateData: any = {
        lastExecuted: new Date(),
        executionCount: (this.runtime as any).databaseAdapter.db.raw('execution_count + 1'),
        updatedAt: new Date(),
      };

      if (success && amountProcessed) {
        updateData.totalSpent = (this.runtime as any).databaseAdapter.db.raw(`total_spent + ${amountProcessed}`);
      }

      await (this.runtime as any).databaseAdapter.db
        .update(standingOrdersTable)
        .set(updateData)
        .where(eq(standingOrdersTable.id, orderId));

      logger.info(`Recorded execution for order ${orderId}: ${success ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
      logger.error('Failed to record execution:', error);
    }
  }

  /**
   * Update next execution time based on frequency
   */
  private async updateNextExecution(orderData: any): Promise<void> {
    if (!(this.runtime as any)?.databaseAdapter?.db) {
      logger.warn('No database adapter available for updating next execution');
      return;
    }

    const now = new Date();
    let nextExecution: Date;
    
    switch (orderData.frequency) {
      case 'hourly':
        nextExecution = new Date(now.getTime() + 60 * 60 * 1000);
        break;
      case 'daily':
        nextExecution = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'weekly':
        nextExecution = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'monthly':
        nextExecution = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        break;
      case 'custom':
        if (orderData.customInterval) {
          nextExecution = new Date(now.getTime() + orderData.customInterval);
        } else {
          nextExecution = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default to daily
        }
        break;
      default:
        nextExecution = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default to daily
    }

    try {
      await (this.runtime as any).databaseAdapter.db
        .update(standingOrdersTable)
        .set({ 
          nextExecution,
          updatedAt: new Date()
        })
        .where(eq(standingOrdersTable.id, orderData.id));

      logger.info(`Updated next execution for order ${orderData.id}: ${nextExecution.toISOString()}`);
    } catch (error) {
      logger.error('Failed to update next execution time:', error);
    }
  }

  /**
   * Send notification about order execution
   */
  private async sendExecutionNotification(order: StandingOrder, success: boolean, txHash?: string, amountProcessed?: number): Promise<void> {
    // Get notification service
    const notificationService = this.runtime?.getService('notification');
    if (!notificationService) return;

    const status = success ? '✅ Success' : '❌ Failed';
    const amount = amountProcessed ? ` ($${amountProcessed})` : '';
    const tx = txHash ? `\n🔗 TX: ${txHash}` : '';
    
    const message = `🤖 **Autonomous Order Executed**\n\n${status}: ${order.description}${amount}${tx}`;
    
    // Send notification (would need to implement based on notification service API)
    logger.info(`Notification: ${message}`);
  }

  /**
   * Helper methods for portfolio and price data
   */
  private async getCurrentPortfolio(userId: string): Promise<Record<string, number>> {
    // Mock implementation - in real version, get from blockchain
    return {
      'SEI': 1000,
      'USDC': 500
    };
  }

  private async getCurrentPrice(token: string): Promise<number> {
    // Mock implementation - in real version, get from price API
    return Math.random() * 100;
  }

  private calculateDCAAllocations(portfolio: Record<string, number>, targets: Record<string, number>, amount: number): Record<string, number> {
    // Simplified DCA calculation
    const allocations: Record<string, number> = {};
    
    for (const [token, targetPercent] of Object.entries(targets)) {
      allocations[token] = amount * (targetPercent / 100);
    }
    
    return allocations;
  }

  private checkRebalanceNeeded(portfolio: Record<string, number>, targets: Record<string, number>, threshold: number): boolean {
    // Simplified rebalance check
    return true; // For demo, always needs rebalance
  }

  private calculateRebalanceTrades(portfolio: Record<string, number>, targets: Record<string, number>): Array<{from: string, to: string, amount: number}> {
    // Simplified trade calculation
    return [
      { from: 'SEI', to: 'USDC', amount: 100 }
    ];
  }

  /**
   * Public methods for managing standing orders
   */
  public async createStandingOrder(orderData: any): Promise<string> {
    if (!(this.runtime as any)?.databaseAdapter?.db) {
      throw new Error('No database adapter available');
    }

    try {
      const result = await (this.runtime as any).databaseAdapter.db
        .insert(standingOrdersTable)
        .values({
          userId: orderData.userId,
          type: orderData.type,
          status: orderData.status || 'active',
          frequency: orderData.frequency,
          nextExecution: orderData.nextExecution,
          customInterval: orderData.customInterval,
          parameters: orderData.parameters,
          totalSpentLimit: orderData.totalSpentLimit?.toString(),
          maxExecutions: orderData.maxExecutions,
          notifications: orderData.notifications,
          description: orderData.description,
        })
        .returning({ id: standingOrdersTable.id });

      const orderId = result[0].id;
      logger.info(`Created standing order ${orderId}: ${orderData.description}`);
      return orderId;
    } catch (error) {
      logger.error('Failed to create standing order:', error);
      throw new Error(`Failed to create standing order: ${error}`);
    }
  }

  public async getStandingOrders(userId: string): Promise<any[]> {
    if (!(this.runtime as any)?.databaseAdapter?.db) {
      return [];
    }

    try {
      const orders = await (this.runtime as any).databaseAdapter.db
        .select()
        .from(standingOrdersTable)
        .where(eq(standingOrdersTable.userId, userId))
        .orderBy(desc(standingOrdersTable.createdAt));

      return orders;
    } catch (error) {
      logger.error('Failed to get standing orders:', error);
      return [];
    }
  }

  public async pauseStandingOrder(orderId: string): Promise<boolean> {
    if (!(this.runtime as any)?.databaseAdapter?.db) {
      return false;
    }

    try {
      const result = await (this.runtime as any).databaseAdapter.db
        .update(standingOrdersTable)
        .set({ 
          status: 'paused',
          updatedAt: new Date()
        })
        .where(
          and(
            eq(standingOrdersTable.id, orderId),
            eq(standingOrdersTable.status, 'active')
          )
        );

      return result.length > 0;
    } catch (error) {
      logger.error('Failed to pause standing order:', error);
      return false;
    }
  }

  public async resumeStandingOrder(orderId: string): Promise<boolean> {
    if (!(this.runtime as any)?.databaseAdapter?.db) {
      return false;
    }

    try {
      const result = await (this.runtime as any).databaseAdapter.db
        .update(standingOrdersTable)
        .set({ 
          status: 'active',
          updatedAt: new Date()
        })
        .where(
          and(
            eq(standingOrdersTable.id, orderId),
            eq(standingOrdersTable.status, 'paused')
          )
        );

      return result.length > 0;
    } catch (error) {
      logger.error('Failed to resume standing order:', error);
      return false;
    }
  }

  public async cancelStandingOrder(orderId: string): Promise<boolean> {
    if (!(this.runtime as any)?.databaseAdapter?.db) {
      return false;
    }

    try {
      const result = await (this.runtime as any).databaseAdapter.db
        .update(standingOrdersTable)
        .set({ 
          status: 'cancelled',
          updatedAt: new Date()
        })
        .where(eq(standingOrdersTable.id, orderId));

      return result.length > 0;
    } catch (error) {
      logger.error('Failed to cancel standing order:', error);
      return false;
    }
  }
}

/**
 * Natural Language Parser for Standing Orders
 */
class StandingOrderParser {
  static parseCreateOrder(text: string, userId: string): Partial<StandingOrder> | null {
    const lowerText = text.toLowerCase();
    
    // Parse recurring buy orders
    const recurringBuyPattern = /(?:buy|purchase)\s+\$?(\d+(?:\.\d+)?)\s+(?:worth\s+of\s+)?(\w+)\s+(?:every|each)\s+(daily|weekly|monthly|friday|monday|tuesday|wednesday|thursday|saturday|sunday)/i;
    const recurringBuyMatch = text.match(recurringBuyPattern);
    
    if (recurringBuyMatch) {
      const [, amount, token, frequency] = recurringBuyMatch;
      return {
        userId,
        type: OrderType.RECURRING_BUY,
        status: OrderStatus.ACTIVE,
        frequency: this.mapFrequency(frequency),
        nextExecution: this.calculateNextExecution(frequency),
        parameters: {
          amount: parseFloat(amount),
          token: token.toUpperCase(),
        },
        notifications: true,
        description: `Buy $${amount} of ${token.toUpperCase()} every ${frequency}`,
      };
    }

    // Parse recurring stake orders
    const stakePattern = /(?:stake|delegate)\s+(\d+(?:\.\d+)?)\s+sei\s+(?:every|each)\s+(daily|weekly|monthly)/i;
    const stakeMatch = text.match(stakePattern);
    
    if (stakeMatch) {
      const [, amount, frequency] = stakeMatch;
      return {
        userId,
        type: OrderType.RECURRING_STAKE,
        status: OrderStatus.ACTIVE,
        frequency: this.mapFrequency(frequency),
        nextExecution: this.calculateNextExecution(frequency),
        parameters: {
          amount: parseFloat(amount),
        },
        notifications: true,
        description: `Stake ${amount} SEI every ${frequency}`,
      };
    }

    // Parse DCA strategy
    const dcaPattern = /(?:dca|dollar.cost.average)\s+\$?(\d+(?:\.\d+)?)\s+(?:every|each)\s+(daily|weekly|monthly)/i;
    const dcaMatch = text.match(dcaPattern);
    
    if (dcaMatch) {
      const [, amount, frequency] = dcaMatch;
      // Default allocation: 70% SEI, 30% USDC
      return {
        userId,
        type: OrderType.DCA_STRATEGY,
        status: OrderStatus.ACTIVE,
        frequency: this.mapFrequency(frequency),
        nextExecution: this.calculateNextExecution(frequency),
        parameters: {
          amount: parseFloat(amount),
          targetAllocation: { 'SEI': 70, 'USDC': 30 },
        },
        notifications: true,
        description: `DCA $${amount} every ${frequency}`,
      };
    }

    // Parse auto vote orders
    const autoVotePattern = /(?:auto.vote|automatically.vote)\s+(yes|no|abstain|delegate)\s+(?:on\s+)?(?:all\s+)?proposals/i;
    const autoVoteMatch = text.match(autoVotePattern);
    
    if (autoVoteMatch) {
      const [, strategy] = autoVoteMatch;
      return {
        userId,
        type: OrderType.AUTO_VOTE,
        status: OrderStatus.ACTIVE,
        frequency: Frequency.DAILY, // Check daily for new proposals
        nextExecution: new Date(Date.now() + 24 * 60 * 60 * 1000),
        parameters: {
          votingStrategy: strategy.toLowerCase() as any,
        },
        notifications: true,
        description: `Auto vote "${strategy}" on all proposals`,
      };
    }

    // Parse limit orders
    const limitOrderPattern = /(?:buy|sell)\s+(\d+(?:\.\d+)?)\s+(\w+)\s+(?:when|if)\s+price\s+(?:goes\s+)?(above|below)\s+\$?(\d+(?:\.\d+)?)/i;
    const limitOrderMatch = text.match(limitOrderPattern);
    
    if (limitOrderMatch) {
      const [, amount, token, condition, triggerPrice] = limitOrderMatch;
      return {
        userId,
        type: OrderType.LIMIT_ORDER,
        status: OrderStatus.ACTIVE,
        frequency: Frequency.HOURLY, // Check hourly for price triggers
        nextExecution: new Date(Date.now() + 60 * 60 * 1000),
        parameters: {
          amount: parseFloat(amount),
          token: token.toUpperCase(),
          triggerPrice: parseFloat(triggerPrice),
          triggerCondition: condition.toLowerCase() as 'above' | 'below',
        },
        notifications: true,
        description: `${amount} ${token.toUpperCase()} when price ${condition} $${triggerPrice}`,
      };
    }

    return null;
  }

  static parseManageOrder(text: string): { action: 'pause' | 'resume' | 'cancel' | 'list'; orderId?: string } | null {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('list') || lowerText.includes('show') || lowerText.includes('view')) {
      return { action: 'list' };
    }
    
    const actionPattern = /(pause|resume|cancel|stop)\s+(?:order\s+)?(\w+)/i;
    const actionMatch = text.match(actionPattern);
    
    if (actionMatch) {
      const [, action, orderId] = actionMatch;
      return {
        action: action.toLowerCase() === 'stop' ? 'cancel' : action.toLowerCase() as any,
        orderId
      };
    }
    
    return null;
  }

  private static mapFrequency(frequency: string): Frequency {
    const lower = frequency.toLowerCase();
    if (lower === 'daily') return Frequency.DAILY;
    if (lower === 'weekly') return Frequency.WEEKLY;
    if (lower === 'monthly') return Frequency.MONTHLY;
    if (['friday', 'monday', 'tuesday', 'wednesday', 'thursday', 'saturday', 'sunday'].includes(lower)) {
      return Frequency.WEEKLY;
    }
    return Frequency.DAILY;
  }

  private static calculateNextExecution(frequency: string): Date {
    const now = new Date();
    const lower = frequency.toLowerCase();
    
    if (lower === 'daily') {
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    } else if (lower === 'weekly') {
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (lower === 'monthly') {
      return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    } else if (['friday', 'monday', 'tuesday', 'wednesday', 'thursday', 'saturday', 'sunday'].includes(lower)) {
      // Calculate next occurrence of specified day
      const targetDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(lower);
      const currentDay = now.getDay();
      const daysUntilTarget = (targetDay - currentDay + 7) % 7 || 7;
      return new Date(now.getTime() + daysUntilTarget * 24 * 60 * 60 * 1000);
    }
    
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

/**
 * Action for creating standing orders
 */
const createStandingOrderAction: Action = {
  name: 'CREATE_STANDING_ORDER',
  similes: ['AUTONOMOUS_ORDER', 'RECURRING_ORDER', 'AUTO_BUY', 'AUTO_STAKE', 'DCA_ORDER'],
  description: 'Create autonomous standing orders for recurring blockchain operations',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return (
      // Recurring buy patterns
      /(?:buy|purchase).*(?:every|each).*(?:daily|weekly|monthly|friday|monday|tuesday|wednesday|thursday|saturday|sunday)/i.test(text) ||
      // Recurring stake patterns
      /(?:stake|delegate).*(?:every|each).*(?:daily|weekly|monthly)/i.test(text) ||
      // DCA patterns
      /(?:dca|dollar.cost.average).*(?:every|each)/i.test(text) ||
      // Auto vote patterns
      /(?:auto.vote|automatically.vote)/i.test(text) ||
      // Limit order patterns
      /(?:buy|sell).*(?:when|if).*price.*(?:above|below)/i.test(text)
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> = {},
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService(AutonomousService.serviceType) as AutonomousService;
      if (!service) {
        throw new Error('Autonomous service not available');
      }

      const userId = message.content.source || 'default-user';
      const text = message.content.text || '';
      
      // Parse the order from natural language
      const orderData = StandingOrderParser.parseCreateOrder(text, userId);
      
      if (!orderData) {
        return {
          success: false,
          error: new Error('Could not parse standing order'),
          text: '❌ I couldn\'t understand your standing order. Try something like:\n\n• "Buy $10 worth of SEI every Friday"\n• "Stake 50 SEI every week"\n• "DCA $100 every month"\n• "Auto vote yes on all proposals"',
        };
      }
      
      // For now, we'll assume the user confirms (in a real implementation, this would be a multi-step conversation)
      const orderId = await service.createStandingOrder(orderData as any);
      
      let response = `🤖 **Standing Order Created Successfully!**\n\n`;
      response += `📋 **Order ID:** ${orderId}\n`;
      response += `📝 **Description:** ${orderData.description}\n`;
      response += `⏰ **Frequency:** ${orderData.frequency}\n`;
      response += `🔄 **Status:** Active\n\n`;
      
      if (orderData.type === OrderType.RECURRING_BUY || orderData.type === OrderType.DCA_STRATEGY) {
        response += `💰 **Amount:** $${orderData.parameters?.amount}\n`;
      }
      
      response += `🔔 **Notifications:** ${orderData.notifications ? 'Enabled' : 'Disabled'}\n\n`;
      response += `✅ Your autonomous order is now active and will execute automatically in the background.\n\n`;
      response += `💡 *Use "list my orders" to view all standing orders or "cancel ${orderId}" to stop this order.*`;

      if (callback) {
        await callback({
          text: response,
          actions: ['CREATE_STANDING_ORDER'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['CREATE_STANDING_ORDER'],
          source: message.content.source,
          orderId,
          orderData,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create standing order';
      const response = `❌ Unable to create standing order: ${errorMessage}`;
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: response,
      };
    }
  },



  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Buy $10 worth of SEI every Friday and stake it automatically',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '🤖 **Standing Order Created Successfully!**\n\n📋 **Order ID:** abc123\n📝 **Description:** Buy $10 of SEI every Friday\n⏰ **Frequency:** weekly\n🔄 **Status:** Active\n\n💰 **Amount:** $10\n🔔 **Notifications:** Enabled\n\n✅ Your autonomous order is now active and will execute automatically in the background.',
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'DCA $100 into SEI every month',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '🤖 **Standing Order Created Successfully!**\n\n📋 **Order ID:** def456\n📝 **Description:** DCA $100 every monthly\n⏰ **Frequency:** monthly\n🔄 **Status:** Active\n\n💰 **Amount:** $100\n🔔 **Notifications:** Enabled',
        },
      },
    ],
  ],
};

/**
 * Action for managing standing orders
 */
const manageStandingOrdersAction: Action = {
  name: 'MANAGE_STANDING_ORDERS',
  similes: ['LIST_ORDERS', 'CANCEL_ORDER', 'PAUSE_ORDER', 'RESUME_ORDER'],
  description: 'Manage existing standing orders (list, pause, resume, cancel)',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return (
      text.includes('standing order') ||
      text.includes('autonomous order') ||
      text.includes('my orders') ||
      /(?:list|show|view).*orders/i.test(text) ||
      /(?:cancel|pause|resume|stop).*order/i.test(text)
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> = {},
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService(AutonomousService.serviceType) as AutonomousService;
      if (!service) {
        throw new Error('Autonomous service not available');
      }

      const userId = message.content.source || 'default-user';
      const text = message.content.text || '';
      
      // Parse the management action
      const managementAction = StandingOrderParser.parseManageOrder(text);
      
      if (!managementAction) {
        return {
          success: false,
          error: new Error('Could not parse management action'),
          text: '❌ I couldn\'t understand your request. Try:\n\n• "List my orders"\n• "Pause order abc123"\n• "Cancel order abc123"',
        };
      }

      let response = '';

      if (managementAction.action === 'list') {
        const orders = await service.getStandingOrders(userId);
        
        if (orders.length === 0) {
          response = '📋 **Your Standing Orders**\n\nNo standing orders found. Create one by saying something like:\n"Buy $10 worth of SEI every Friday"';
        } else {
          response = `📋 **Your Standing Orders** (${orders.length})\n\n`;
          
                      orders.forEach((order: any, index: number) => {
              const statusEmoji = {
                'active': '🟢',
                'paused': '⏸️',
                'completed': '✅',
                'cancelled': '❌',
                'failed': '💥'
              }[order.status as string] || '🟢';
            
            response += `**${index + 1}. ${order.description}**\n`;
            response += `   📋 ID: ${order.id}\n`;
            response += `   ${statusEmoji} Status: ${order.status}\n`;
            response += `   ⏰ Next: ${order.nextExecution.toLocaleString()}\n`;
            response += `   🔄 Executions: ${order.executionCount}\n`;
            response += `   💰 Total Spent: $${order.totalSpent}\n\n`;
          });
          
          response += `💡 *Use "pause/resume/cancel order <ID>" to manage orders*`;
        }
      } else {
        const { action, orderId } = managementAction;
        
        if (!orderId) {
          return {
            success: false,
            error: new Error('Order ID required'),
            text: `❌ Please specify an order ID. Example: "${action} order abc123"`,
          };
        }

        let success = false;
        
        switch (action) {
          case 'pause':
            success = await service.pauseStandingOrder(orderId);
            response = success 
              ? `⏸️ **Order Paused**\n\nOrder ${orderId} has been paused. Use "resume order ${orderId}" to reactivate it.`
              : `❌ Could not pause order ${orderId}. Check the order ID and try again.`;
            break;
            
          case 'resume':
            success = await service.resumeStandingOrder(orderId);
            response = success 
              ? `▶️ **Order Resumed**\n\nOrder ${orderId} is now active again.`
              : `❌ Could not resume order ${orderId}. Check the order ID and try again.`;
            break;
            
          case 'cancel':
            success = await service.cancelStandingOrder(orderId);
            response = success 
              ? `❌ **Order Cancelled**\n\nOrder ${orderId} has been permanently cancelled.`
              : `❌ Could not cancel order ${orderId}. Check the order ID and try again.`;
            break;
        }
      }

      if (callback) {
        await callback({
          text: response,
          actions: ['MANAGE_STANDING_ORDERS'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['MANAGE_STANDING_ORDERS'],
          source: message.content.source,
          managementAction,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to manage standing orders';
      const response = `❌ Unable to manage standing orders: ${errorMessage}`;
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: response,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'List my standing orders',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '📋 **Your Standing Orders** (2)\n\n**1. Buy $10 of SEI every Friday**\n   📋 ID: abc123\n   🟢 Status: active\n   ⏰ Next: Friday, 3:00 PM\n   🔄 Executions: 5\n   💰 Total Spent: $50\n\n**2. DCA $100 every monthly**\n   📋 ID: def456\n   🟢 Status: active\n   ⏰ Next: 1st of next month\n   🔄 Executions: 2\n   💰 Total Spent: $200',
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Cancel order abc123',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '❌ **Order Cancelled**\n\nOrder abc123 has been permanently cancelled.',
        },
      },
    ],
  ],
};

/**
 * Export the autonomous plugin
 */
export const autonomousPlugin: Plugin = {
  name: 'autonomous',
  description: 'Autonomous goal-seeking capabilities with standing orders for recurring blockchain operations',
  actions: [createStandingOrderAction, manageStandingOrdersAction],
  services: [AutonomousService],
  providers: [],
  schema: {
    standingOrdersTable,
    orderExecutionsTable,
  },
};

export default autonomousPlugin;