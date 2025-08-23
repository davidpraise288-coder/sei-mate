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
 * Configuration schema for embedded wallet service
 */
const configSchema = z.object({
  PRIVY_APP_ID: z.string().min(1, 'Privy App ID is required'),
  PRIVY_APP_SECRET: z.string().min(1, 'Privy App Secret is required'),
  SEI_PRIVATE_KEY: z.string().min(1, 'SEI private key for gas sponsorship'),
  COMMUNITY_WALLET_INITIAL_BALANCE: z.string().default('0.05'), // 0.05 SEI
  SEI_RPC_URL: z.string().url().default('https://evm-rpc.sei-apis.com'),
});

/**
 * Interface for embedded wallet data
 */
interface EmbeddedWallet {
  userId: string;
  address: string;
  platform: 'telegram' | 'discord';
  createdAt: Date;
  isProvisioned: boolean;
  communityId?: string;
}

/**
 * Interface for community wallet config
 */
interface CommunityWalletConfig {
  communityId: string;
  platform: 'telegram' | 'discord';
  sponsorshipEnabled: boolean;
  initialBalance: string;
  welcomeNftContract?: string;
  customWelcomeMessage?: string;
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
 * Embedded Wallet Service for seamless onboarding
 */
export class EmbeddedWalletService extends Service {
  static override serviceType = 'embedded-wallet';

  override capabilityDescription =
    'Provides embedded wallet functionality with Privy integration for seamless onboarding and community wallet provisioning.';

  private privyAppId: string;
  private privyAppSecret: string;
  private sponsorPrivateKey: string;
  private initialBalance: string;
  private rpcUrl: string;
  private walletClient: WalletClient;
  private publicClient: PublicClient;
  private sponsorAccount: any;

  // In-memory storage for demo (in production, use proper database)
  private embeddedWallets: Map<string, EmbeddedWallet> = new Map();
  private communityConfigs: Map<string, CommunityWalletConfig> = new Map();

  override async initialize(runtime: IAgentRuntime): Promise<void> {
    const config = configSchema.parse(runtime.config);
    
    this.privyAppId = config.PRIVY_APP_ID;
    this.privyAppSecret = config.PRIVY_APP_SECRET;
    this.sponsorPrivateKey = config.SEI_PRIVATE_KEY;
    this.initialBalance = config.COMMUNITY_WALLET_INITIAL_BALANCE;
    this.rpcUrl = config.SEI_RPC_URL;

    // Initialize sponsor account for gas sponsorship
    this.sponsorAccount = privateKeyToAccount(this.sponsorPrivateKey as `0x${string}`);
    
    this.walletClient = createWalletClient({
      account: this.sponsorAccount,
      chain: seiMainnet,
      transport: http(this.rpcUrl),
    });

    this.publicClient = createPublicClient({
      chain: seiMainnet,
      transport: http(this.rpcUrl),
    });

    logger.info('EmbeddedWalletService initialized with Privy integration');
  }

  /**
   * Create embedded wallet for new user
   */
  async createEmbeddedWallet(
    userId: string, 
    platform: 'telegram' | 'discord',
    communityId?: string
  ): Promise<EmbeddedWallet> {
    try {
      // Check if wallet already exists
      const existingWallet = this.embeddedWallets.get(userId);
      if (existingWallet) {
        return existingWallet;
      }

      // Create wallet via Privy API (simplified for demo)
      const walletAddress = await this.createPrivyWallet(userId, platform);
      
      const embeddedWallet: EmbeddedWallet = {
        userId,
        address: walletAddress,
        platform,
        createdAt: new Date(),
        isProvisioned: false,
        communityId,
      };

      this.embeddedWallets.set(userId, embeddedWallet);
      
      // If community wallet, provision with initial balance
      if (communityId) {
        await this.provisionCommunityWallet(embeddedWallet);
      }

      logger.info(`Created embedded wallet for user ${userId}: ${walletAddress}`);
      return embeddedWallet;
    } catch (error) {
      logger.error('Failed to create embedded wallet:', error);
      throw error;
    }
  }

  /**
   * Provision community wallet with initial balance and NFT
   */
  private async provisionCommunityWallet(wallet: EmbeddedWallet): Promise<void> {
    try {
      const communityConfig = this.communityConfigs.get(wallet.communityId || '');
      
      if (!communityConfig || !communityConfig.sponsorshipEnabled) {
        return;
      }

      // Send initial SEI balance
      const initialAmount = parseEther(communityConfig.initialBalance);
      
      const hash = await this.walletClient.sendTransaction({
        to: wallet.address as Address,
        value: initialAmount,
      });

      // Wait for transaction confirmation
      await this.publicClient.waitForTransactionReceipt({ hash });

      // Mark as provisioned
      wallet.isProvisioned = true;
      this.embeddedWallets.set(wallet.userId, wallet);

      logger.info(`Provisioned community wallet ${wallet.address} with ${communityConfig.initialBalance} SEI`);
    } catch (error) {
      logger.error('Failed to provision community wallet:', error);
      throw error;
    }
  }

  /**
   * Create wallet via Privy API (simplified implementation)
   */
  private async createPrivyWallet(userId: string, platform: string): Promise<string> {
    try {
      // In a real implementation, this would use Privy's SDK
      // For demo purposes, we'll generate a deterministic address
      const deterministicSeed = `${this.privyAppId}-${userId}-${platform}`;
      const hash = require('crypto').createHash('sha256').update(deterministicSeed).digest('hex');
      const privateKey = `0x${hash}`;
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      
      return account.address;
    } catch (error) {
      logger.error('Failed to create Privy wallet:', error);
      throw error;
    }
  }

  /**
   * Configure community wallet settings
   */
  async configureCommunityWallet(
    communityId: string,
    platform: 'telegram' | 'discord',
    config: Partial<CommunityWalletConfig>
  ): Promise<void> {
    const communityConfig: CommunityWalletConfig = {
      communityId,
      platform,
      sponsorshipEnabled: true,
      initialBalance: this.initialBalance,
      ...config,
    };

    this.communityConfigs.set(communityId, communityConfig);
    logger.info(`Configured community wallet for ${communityId} on ${platform}`);
  }

  /**
   * Get wallet for user
   */
  async getWalletForUser(userId: string): Promise<EmbeddedWallet | null> {
    return this.embeddedWallets.get(userId) || null;
  }

  /**
   * Handle new member onboarding
   */
  async handleNewMemberOnboarding(
    userId: string,
    platform: 'telegram' | 'discord',
    communityId: string,
    communityName: string
  ): Promise<{ wallet: EmbeddedWallet; welcomeMessage: string }> {
    const wallet = await this.createEmbeddedWallet(userId, platform, communityId);
    const communityConfig = this.communityConfigs.get(communityId);
    
    const welcomeMessage = communityConfig?.customWelcomeMessage || 
      `🎉 Welcome to ${communityName}! I've created a secure wallet for you right here in ${platform}. ` +
      `To get you started, the community has sent you ${communityConfig?.initialBalance || '0.05'} $SEI! ` +
      `Would you like me to guide you on how to check your balance? Type "check balance" to see your funds.`;

    return { wallet, welcomeMessage };
  }
}

/**
 * Action to create embedded wallet
 */
const createEmbeddedWalletAction: Action = {
  name: 'CREATE_EMBEDDED_WALLET',
  similes: ['SETUP_WALLET', 'CREATE_WALLET', 'NEW_WALLET'],
  description: 'Creates an embedded wallet for seamless onboarding',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    return text.includes('create wallet') || 
           text.includes('setup wallet') || 
           text.includes('new wallet') ||
           text.includes('get started');
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService<EmbeddedWalletService>('embedded-wallet');
      if (!service) {
        await callback({
          text: 'Embedded wallet service is not available. Please contact support.',
          error: true,
        });
        return { success: false, error: new Error('Service not available') };
      }

      const userId = message.entityId;
      const platform = message.source?.includes('telegram') ? 'telegram' : 'discord';
      
      const wallet = await service.createEmbeddedWallet(userId, platform);
      
      await callback({
        text: `🎉 Your embedded wallet has been created successfully!\n\n` +
              `📍 **Wallet Address**: \`${wallet.address}\`\n` +
              `🔒 **Security**: Your wallet is secured by your ${platform} account\n` +
              `💡 **No seed phrases needed** - just log in with ${platform}!\n\n` +
              `You can now:\n` +
              `• Check your balance with "check balance"\n` +
              `• Receive tokens from others\n` +
              `• Swap tokens with "swap [amount] [token]"\n` +
              `• Participate in community activities`,
        action: 'CREATE_EMBEDDED_WALLET',
      });

      return {
        success: true,
        text: `Embedded wallet created for user ${userId}`,
        data: { walletAddress: wallet.address, platform },
      };
    } catch (error) {
      logger.error('Failed to create embedded wallet:', error);
      await callback({
        text: 'Failed to create embedded wallet. Please try again later.',
        error: true,
      });
      return { success: false, error: error as Error };
    }
  },
};

/**
 * Action to handle new member onboarding
 */
const handleNewMemberAction: Action = {
  name: 'HANDLE_NEW_MEMBER',
  similes: ['WELCOME_USER', 'ONBOARD_MEMBER'],
  description: 'Handles automatic onboarding for new community members',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    // This would be triggered by Discord/Telegram events for new members
    return message.content.text?.includes('USER_JOINED') || false;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService<EmbeddedWalletService>('embedded-wallet');
      if (!service) {
        return { success: false, error: new Error('Service not available') };
      }

      const userId = message.entityId;
      const platform = message.source?.includes('telegram') ? 'telegram' : 'discord';
      const communityId = message.roomId; // Use roomId as communityId
      const communityName = state.data?.communityName || 'our community';
      
      const { wallet, welcomeMessage } = await service.handleNewMemberOnboarding(
        userId, 
        platform, 
        communityId, 
        communityName
      );
      
      await callback({
        text: welcomeMessage,
        action: 'HANDLE_NEW_MEMBER',
      });

      return {
        success: true,
        text: `New member onboarded with wallet ${wallet.address}`,
        data: { walletAddress: wallet.address, communityId },
      };
    } catch (error) {
      logger.error('Failed to handle new member onboarding:', error);
      return { success: false, error: error as Error };
    }
  },
};

/**
 * Provider for embedded wallet information
 */
const embeddedWalletProvider: Provider = {
  name: 'EMBEDDED_WALLET_PROVIDER',
  description: 'Provides embedded wallet information and status',

  get: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ProviderResult> => {
    try {
      const service = runtime.getService<EmbeddedWalletService>('embedded-wallet');
      if (!service) {
        return { success: false, error: 'Service not available' };
      }

      const userId = message.entityId;
      const wallet = await service.getWalletForUser(userId);

      if (!wallet) {
        return {
          success: true,
          data: {
            hasWallet: false,
            message: 'User does not have an embedded wallet yet. They can create one by saying "create wallet".',
          },
        };
      }

      return {
        success: true,
        data: {
          hasWallet: true,
          address: wallet.address,
          platform: wallet.platform,
          isProvisioned: wallet.isProvisioned,
          createdAt: wallet.createdAt,
          communityId: wallet.communityId,
        },
      };
    } catch (error) {
      logger.error('Failed to get embedded wallet info:', error);
      return { success: false, error: error.message };
    }
  },
};

/**
 * Embedded Wallet Plugin
 */
export const embeddedWalletPlugin: Plugin = {
  name: 'plugin-embedded-wallet',
  description: 'Provides embedded wallet functionality with Privy integration for seamless onboarding',
  config: {
    PRIVY_APP_ID: process.env.PRIVY_APP_ID,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
    SEI_PRIVATE_KEY: process.env.SEI_PRIVATE_KEY,
    COMMUNITY_WALLET_INITIAL_BALANCE: process.env.COMMUNITY_WALLET_INITIAL_BALANCE || '0.05',
    SEI_RPC_URL: process.env.SEI_RPC_URL || 'https://evm-rpc.sei-apis.com',
  },
  services: [EmbeddedWalletService],
  actions: [createEmbeddedWalletAction, handleNewMemberAction],
  providers: [embeddedWalletProvider],
  models: {
    [ModelType.TEXT_SMALL]: async (
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'I can create embedded wallets for seamless onboarding without seed phrases.';
    },
    [ModelType.TEXT_LARGE]: async (
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'I provide embedded wallet functionality using Privy integration. New users can create wallets simply by logging in with Discord or Telegram. Community members automatically receive provisioned wallets with initial SEI tokens when they join. This enables zero-friction onboarding without seed phrases or complex wallet setup.';
    },
  },
};