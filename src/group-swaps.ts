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
 * Configuration schema for group swaps
 */
const configSchema = z.object({
  SEI_PRIVATE_KEY: z.string().min(1, 'SEI private key is required'),
  SEI_RPC_URL: z.string().url().default('https://evm-rpc.sei-apis.com'),
  GROUP_SWAP_MIN_PARTICIPANTS: z.number().default(3),
  GROUP_SWAP_MAX_PARTICIPANTS: z.number().default(50),
  GROUP_SWAP_TIMEOUT_MINUTES: z.number().default(30),
});

/**
 * Interface for group swap data
 */
interface GroupSwap {
  id: string;
  communityId: string;
  fromToken: string;
  toToken: string;
  amountPerParticipant: string;
  targetParticipants: number;
  currentParticipants: string[]; // user IDs
  participantAmounts: Map<string, string>;
  createdAt: Date;
  expiresAt: Date;
  status: 'active' | 'ready' | 'executed' | 'cancelled' | 'expired';
  creatorId: string;
  totalPooled: string;
  estimatedPrice?: string;
  actualPrice?: string;
  transactionHash?: string;
}

/**
 * Interface for group swap participant
 */
interface GroupSwapParticipant {
  userId: string;
  amount: string;
  joinedAt: Date;
  status: 'active' | 'withdrawn';
}

/**
 * Interface for swap result
 */
interface SwapResult {
  id: string;
  groupSwapId: string;
  participants: string[];
  totalAmount: string;
  fromToken: string;
  toToken: string;
  actualPrice: string;
  estimatedPrice: string;
  transactionHash: string;
  executedAt: Date;
  gasUsed: string;
  status: 'success' | 'failed' | 'partial';
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
 * Group Swaps Service for community crowdbuys
 */
export class GroupSwapsService extends Service {
  static override serviceType = 'group-swaps';

  override capabilityDescription =
    'Provides group swap functionality for coordinated token exchanges with community participation.';

  private privateKey!: string;
  private rpcUrl!: string;
  private minParticipants!: number;
  private maxParticipants!: number;
  private timeoutMinutes!: number;
  private symphony!: Symphony;
  private walletClient!: WalletClient;
  private publicClient!: PublicClient;

  // In-memory storage for demo (in production, use proper database)
  private activeSwaps: Map<string, GroupSwap> = new Map();
  private swapHistory: Map<string, SwapResult> = new Map();
  private userSwaps: Map<string, string[]> = new Map(); // userId -> swapIds

  async initialize(runtime: IAgentRuntime): Promise<void> {
    const config = configSchema.parse((runtime as any).config);
    
    this.privateKey = config.SEI_PRIVATE_KEY;
    this.rpcUrl = config.SEI_RPC_URL;
    this.minParticipants = config.GROUP_SWAP_MIN_PARTICIPANTS;
    this.maxParticipants = config.GROUP_SWAP_MAX_PARTICIPANTS;
    this.timeoutMinutes = config.GROUP_SWAP_TIMEOUT_MINUTES;

    // Initialize account and clients
    const account = privateKeyToAccount(this.privateKey as `0x${string}`);
    
    this.walletClient = createWalletClient({
      account,
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

    logger.info('GroupSwapsService initialized');
  }

  override async stop(): Promise<void> {
    logger.info('GroupSwapsService stopped');
  }

  /**
   * Create a new group swap
   */
  async createGroupSwap(
    communityId: string,
    creatorId: string,
    fromToken: string,
    toToken: string,
    amountPerParticipant: string,
    targetParticipants: number
  ): Promise<GroupSwap> {
    try {
      // Validate parameters
      if (targetParticipants < this.minParticipants || targetParticipants > this.maxParticipants) {
        throw new Error(`Target participants must be between ${this.minParticipants} and ${this.maxParticipants}`);
      }

      const groupSwapId = `group_${communityId}_${Date.now()}`;
      const expiresAt = new Date(Date.now() + this.timeoutMinutes * 60 * 1000);

      // Get estimated price for the group buy
      const totalAmount = (parseFloat(amountPerParticipant) * targetParticipants).toString();
      const estimatedPrice = await this.getEstimatedPrice(fromToken, toToken, totalAmount);

      const groupSwap: GroupSwap = {
        id: groupSwapId,
        communityId,
        fromToken,
        toToken,
        amountPerParticipant,
        targetParticipants,
        currentParticipants: [creatorId],
        participantAmounts: new Map([[creatorId, amountPerParticipant]]),
        createdAt: new Date(),
        expiresAt,
        status: 'active',
        creatorId,
        totalPooled: amountPerParticipant,
        estimatedPrice,
      };

      this.activeSwaps.set(groupSwapId, groupSwap);
      
      // Add to user participations
      const userParticipations = this.userSwaps.get(creatorId) || [];
      userParticipations.push(groupSwapId);
      this.userSwaps.set(creatorId, userParticipations);

      logger.info(`Created group swap ${groupSwapId} for ${communityId}`);
      return groupSwap;
    } catch (error) {
      logger.error('Failed to create group swap:', error);
      throw error;
    }
  }

  /**
   * Join an existing group swap
   */
  async joinGroupSwap(
    groupSwapId: string,
    userId: string,
    customAmount?: string
  ): Promise<GroupSwap> {
    try {
      const groupSwap = this.activeSwaps.get(groupSwapId);
      if (!groupSwap) {
        throw new Error('Group swap not found');
      }

      if (groupSwap.status !== 'active') {
        throw new Error(`Group swap is ${groupSwap.status} and cannot accept new participants`);
      }

      if (groupSwap.currentParticipants.includes(userId)) {
        throw new Error('User is already participating in this group swap');
      }

      if (groupSwap.currentParticipants.length >= groupSwap.targetParticipants) {
        throw new Error('Group swap is already full');
      }

      if (new Date() > groupSwap.expiresAt) {
        groupSwap.status = 'expired';
        throw new Error('Group swap has expired');
      }

      const amount = customAmount || groupSwap.amountPerParticipant;
      
      // Add participant
      groupSwap.currentParticipants.push(userId);
      groupSwap.participantAmounts.set(userId, amount);
      
      // Update total pooled
      const currentTotal = parseFloat(groupSwap.totalPooled);
      const newAmount = parseFloat(amount);
      groupSwap.totalPooled = (currentTotal + newAmount).toString();

      // Add to user participations
      const userParticipations = this.userSwaps.get(userId) || [];
      userParticipations.push(groupSwapId);
      this.userSwaps.set(userId, userParticipations);

      // Check if we've reached target participants
      if (groupSwap.currentParticipants.length >= groupSwap.targetParticipants) {
        groupSwap.status = 'ready';
      }

      this.activeSwaps.set(groupSwapId, groupSwap);

      logger.info(`User ${userId} joined group swap ${groupSwapId}`);
      return groupSwap;
    } catch (error) {
      logger.error('Failed to join group swap:', error);
      throw error;
    }
  }

  /**
   * Execute a ready group swap
   */
  async executeGroupSwap(groupSwapId: string): Promise<GroupSwap> {
    try {
      const groupSwap = this.activeSwaps.get(groupSwapId);
      if (!groupSwap) {
        throw new Error('Group swap not found');
      }

      if (groupSwap.status !== 'ready') {
        throw new Error(`Group swap status is ${groupSwap.status}, cannot execute`);
      }

      // Execute the swap using Symphony
      const route = await this.symphony.getRoute(
        groupSwap.fromToken,
        groupSwap.toToken,
        parseEther(groupSwap.totalPooled).toString()
      );

      const swapResult = await route.swap({
        slippage: { slippageAmount: '1.0' }
      });

      groupSwap.status = 'executed';
      groupSwap.transactionHash = swapResult.swapReceipt.transactionHash;
      groupSwap.actualPrice = route.amountOutFormatted;

      this.activeSwaps.set(groupSwapId, groupSwap);

      logger.info(`Executed group swap ${groupSwapId} with tx: ${groupSwap.transactionHash}`);
      return groupSwap;
    } catch (error) {
      logger.error('Failed to execute group swap:', error);
      
      // Mark as cancelled on failure
      const groupSwap = this.activeSwaps.get(groupSwapId);
      if (groupSwap) {
        groupSwap.status = 'cancelled';
        this.activeSwaps.set(groupSwapId, groupSwap);
      }
      
      throw error;
    }
  }

  /**
   * Get estimated price for group swap
   */
  private async getEstimatedPrice(
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<string> {
    try {
      const route = await this.symphony.getRoute(
        fromToken,
        toToken,
        parseEther(amount).toString()
      );
      return route.amountOutFormatted;
    } catch (error) {
      logger.error('Failed to get estimated price:', error);
      return '0';
    }
  }

  /**
   * Get active group swaps for a community
   */
  getActiveGroupSwaps(communityId: string): GroupSwap[] {
    return Array.from(this.activeSwaps.values())
      .filter(swap => swap.communityId === communityId && swap.status === 'active');
  }

  /**
   * Get group swap by ID
   */
  getGroupSwap(groupSwapId: string): GroupSwap | null {
    return this.activeSwaps.get(groupSwapId) || null;
  }

  /**
   * Cancel a group swap (only creator can cancel)
   */
  async cancelGroupSwap(groupSwapId: string, userId: string): Promise<GroupSwap> {
    const groupSwap = this.activeSwaps.get(groupSwapId);
    if (!groupSwap) {
      throw new Error('Group swap not found');
    }

    if (groupSwap.creatorId !== userId) {
      throw new Error('Only the creator can cancel the group swap');
    }

    if (groupSwap.status === 'executed') {
      throw new Error('Cannot cancel an executed group swap');
    }

    groupSwap.status = 'cancelled';
    this.activeSwaps.set(groupSwapId, groupSwap);

    return groupSwap;
  }

  /**
   * Start cleanup timer for expired swaps
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      const now = new Date();
      for (const [id, swap] of this.activeSwaps.entries()) {
        if (swap.status === 'active' && now > swap.expiresAt) {
          swap.status = 'expired';
          this.activeSwaps.set(id, swap);
          logger.info(`Group swap ${id} expired`);
        }
      }
    }, 60000); // Check every minute
  }
}

/**
 * Action to create group swap
 */
const createGroupSwapAction: Action = {
  name: 'CREATE_GROUP_SWAP',
  similes: ['START_CROWDBUY', 'CREATE_GROUP_BUY', 'POOL_SWAP'],
  description: 'Creates a group swap for community crowdbuys',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('group swap') || 
           text.includes('crowdbuy') || 
           text.includes('group buy') ||
           text.includes('pool swap') ||
           (text.includes('let\'s') && (text.includes('buy') || text.includes('swap')));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService<GroupSwapsService>('group-swaps');
      if (!service) {
        await callback({
          text: 'Group swaps service is not available.',
          error: true,
        });
        return { success: false, error: new Error('Service not available') };
      }

      // Parse message for swap details
      const text = message.content.text || '';
      const match = text.match(/(?:group|crowd)\s*(?:swap|buy)\s+(\d+\.?\d*)\s+(\w+)\s+(?:to|for)\s+(\w+)/i);
      
      if (!match) {
        await callback({
          text: `🤝 **Group Swap Format**\n\n` +
                `To create a group swap, use this format:\n` +
                `"Group swap 2 SEI to USDC for 10 people"\n\n` +
                `This will:\n` +
                `• Pool 2 SEI from each participant\n` +
                `• Wait for 10 people to join\n` +
                `• Execute one large swap for better pricing\n` +
                `• Save on fees through collective action`,
        });
        return { success: false, error: new Error('Invalid format') };
      }

      const [, amount, fromToken, toToken] = match;
      const participantsMatch = text.match(/(?:for|with)\s+(\d+)\s+(?:people|participants|users)/i);
      const targetParticipants = participantsMatch ? parseInt(participantsMatch[1]) : 5;

      const communityId = message.roomId;
      const creatorId = message.entityId;

      const groupSwap = await service.createGroupSwap(
        communityId,
        creatorId,
        fromToken.toUpperCase(),
        toToken.toUpperCase(),
        amount,
        targetParticipants
      );

      await callback({
        text: `🚀 **Group Swap Created!**\n\n` +
              `💰 **Target**: ${amount} ${fromToken.toUpperCase()} → ${toToken.toUpperCase()}\n` +
              `👥 **Participants**: 1/${targetParticipants}\n` +
              `💎 **Estimated Output**: ~${groupSwap.estimatedPrice || 'Calculating...'} ${toToken.toUpperCase()}\n` +
              `⏰ **Expires**: ${groupSwap.expiresAt.toLocaleTimeString()}\n\n` +
              `**React with 👍 to join this group swap!**\n` +
              `Each participant contributes ${amount} ${fromToken.toUpperCase()}\n\n` +
              `**Benefits of group swapping:**\n` +
              `• Better price through larger volume\n` +
              `• Reduced gas fees per person\n` +
              `• Community financial collaboration`,
        action: 'CREATE_GROUP_SWAP',
      });

      return {
        success: true,
        text: `Group swap created: ${groupSwap.id}`,
        data: { groupSwapId: groupSwap.id, targetParticipants },
      };
    } catch (error) {
      logger.error('Failed to create group swap:', error);
      await callback({
        text: `❌ Failed to create group swap: ${error.message}`,
        error: true,
      });
      return { success: false, error: error as Error };
    }
  },
};

/**
 * Action to join group swap
 */
const joinGroupSwapAction: Action = {
  name: 'JOIN_GROUP_SWAP',
  similes: ['PARTICIPATE_CROWDBUY', 'JOIN_GROUP_BUY'],
  description: 'Joins an active group swap',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('join swap') || 
           text.includes('count me in') ||
           text.includes('add me') ||
           text === '👍' ||
           text === '+1';
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService<GroupSwapsService>('group-swaps');
      if (!service) {
        return { success: false, error: new Error('Service not available') };
      }

      const communityId = message.roomId;
      const userId = message.entityId;
      
      // Find active group swaps in this community
      const activeSwaps = service.getActiveGroupSwaps(communityId);
      
      if (activeSwaps.length === 0) {
        await callback({
          text: 'No active group swaps found in this community. Create one with "group swap [amount] [token] to [token]"',
        });
        return { success: false, error: new Error('No active swaps') };
      }

      // Join the most recent active swap
      const latestSwap = activeSwaps[activeSwaps.length - 1];
      const updatedSwap = await service.joinGroupSwap(latestSwap.id, userId);

      const progress = `${updatedSwap.currentParticipants.length}/${updatedSwap.targetParticipants}`;
      
      if (updatedSwap.status === 'ready') {
        await callback({
          text: `🎉 **Group Swap Ready!**\n\n` +
                `👥 **Participants**: ${progress} ✅\n` +
                `💰 **Total Pool**: ${updatedSwap.totalPooled} ${updatedSwap.fromToken}\n` +
                `🎯 **Target**: ${updatedSwap.toToken}\n\n` +
                `**Executing swap now for better pricing...**`,
          action: 'JOIN_GROUP_SWAP',
        });

        // Auto-execute when ready
        setTimeout(async () => {
          try {
            const executedSwap = await service.executeGroupSwap(updatedSwap.id);
            await callback({
              text: `✅ **Group Swap Executed!**\n\n` +
                    `🔗 **Transaction**: \`${executedSwap.transactionHash}\`\n` +
                    `💎 **Received**: ${executedSwap.actualPrice} ${executedSwap.toToken}\n` +
                    `💪 **Community Power**: Better price through collective action!`,
            });
          } catch (error) {
            await callback({
              text: `❌ Group swap execution failed: ${error.message}`,
              error: true,
            });
          }
        }, 2000);
      } else {
        await callback({
          text: `👍 **Joined Group Swap!**\n\n` +
                `👥 **Progress**: ${progress}\n` +
                `💰 **Your Contribution**: ${updatedSwap.participantAmounts.get(userId)} ${updatedSwap.fromToken}\n` +
                `⏰ **Waiting for ${updatedSwap.targetParticipants - updatedSwap.currentParticipants.length} more participants...**\n\n` +
                `Share with friends to reach our target faster! 🚀`,
          action: 'JOIN_GROUP_SWAP',
        });
      }

      return {
        success: true,
        text: `User joined group swap ${updatedSwap.id}`,
        data: { groupSwapId: updatedSwap.id, progress },
      };
    } catch (error) {
      logger.error('Failed to join group swap:', error);
      await callback({
        text: `❌ Failed to join group swap: ${error.message}`,
        error: true,
      });
      return { success: false, error: error as Error };
    }
  },
};

/**
 * Provider for group swap information
 */
const groupSwapsProvider: Provider = {
  name: 'GROUP_SWAPS_PROVIDER',
  description: 'Provides information about active group swaps',

  get: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ProviderResult> => {
    try {
      const service = runtime.getService<GroupSwapsService>('group-swaps');
      if (!service) {
        return { error: 'Service not available' };
      }

      const communityId = message.roomId;
      const activeSwaps = service.getActiveGroupSwaps(communityId);

      return {
        data: {
          activeSwaps: activeSwaps.length,
          swaps: activeSwaps.map(swap => ({
            id: swap.id,
            fromToken: swap.fromToken,
            toToken: swap.toToken,
            participants: `${swap.currentParticipants.length}/${swap.targetParticipants}`,
            totalPooled: swap.totalPooled,
            status: swap.status,
            expiresAt: swap.expiresAt,
          })),
        },
      };
    } catch (error) {
      logger.error('Failed to get group swaps info:', error);
      return { error: error.message };
    }
  },
};

/**
 * Group Swaps Plugin
 */
export const groupSwapsPlugin: Plugin = {
  name: 'plugin-group-swaps',
  description: 'Provides group swap functionality for community crowdbuys with better pricing and reduced fees',
  config: {
    SEI_PRIVATE_KEY: process.env.SEI_PRIVATE_KEY,
    SEI_RPC_URL: process.env.SEI_RPC_URL || 'https://evm-rpc.sei-apis.com',
    GROUP_SWAP_MIN_PARTICIPANTS: parseInt(process.env.GROUP_SWAP_MIN_PARTICIPANTS || '3'),
    GROUP_SWAP_MAX_PARTICIPANTS: parseInt(process.env.GROUP_SWAP_MAX_PARTICIPANTS || '50'),
    GROUP_SWAP_TIMEOUT_MINUTES: parseInt(process.env.GROUP_SWAP_TIMEOUT_MINUTES || '30'),
  },
  services: [GroupSwapsService],
  actions: [createGroupSwapAction, joinGroupSwapAction],
  providers: [groupSwapsProvider],
  models: {
    [ModelType.TEXT_SMALL]: async (
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'I can organize group swaps for better pricing through community collaboration.';
    },
    [ModelType.TEXT_LARGE]: async (
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'I provide group swap functionality that enables community crowdbuys. Users can pool their funds for larger transactions, getting better prices and reduced gas fees through collective action. I handle the coordination, execution, and fair distribution of group swaps automatically.';
    },
  },
};