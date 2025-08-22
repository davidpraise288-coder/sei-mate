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
import type { Account } from 'viem';

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
 * Defines the configuration schema for the SEI swap plugin
 */
const configSchema = z.object({
  SEI_PRIVATE_KEY: z.string().min(1, 'SEI private key is required'),
  SEI_RPC_URL: z.string().url().default('https://evm-rpc.sei-apis.com'),
  SEI_SLIPPAGE_TOLERANCE: z.string().default('1.0'),
});

/**
 * Interface for swap data
 */
interface SwapData {
  fromToken: string;
  toToken: string;
  amountIn: string;
  amountOut: string;
  transactionHash: string;
  route: any;
}

/**
 * Interface for token information
 */
interface TokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
  name: string;
}

/**
 * SEI Swap Service to handle token swapping functionality
 */
export class SeiSwapService extends Service {
  static override serviceType = 'sei-swap';

  override capabilityDescription =
    'Provides SEI token swapping functionality using Symphony protocol with proper balance checks and approvals.';

  private symphony: Symphony;
  private walletClient: WalletClient;
  private publicClient: PublicClient;
  private account: Account;
  private rpcUrl: string;
  private slippageTolerance: string;

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    this.rpcUrl = process.env.SEI_RPC_URL || 'https://evm-rpc.sei-apis.com';
    this.slippageTolerance = process.env.SEI_SLIPPAGE_TOLERANCE || '1.0';
    
    // Initialize wallet client with private key
    const privateKey = process.env.SEI_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('SEI_PRIVATE_KEY environment variable is required');
    }
    
    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    
    // Initialize clients
    this.walletClient = createWalletClient({
      account: this.account,
      chain: seiMainnet,
      transport: http(this.rpcUrl),
    });

    this.publicClient = createPublicClient({
      chain: seiMainnet,
      transport: http(this.rpcUrl),
    });
    
    // Initialize Symphony with wallet client - following sei-agent-kit pattern
    this.symphony = new Symphony();
    this.symphony.connectWalletClient(this.walletClient);

    this.symphony.connectWalletClient(this.walletClient);
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('Starting SEI swap service');
    return new SeiSwapService(runtime);
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping SEI swap service');
    const service = runtime.getService(SeiSwapService.serviceType);
    if (!service) {
      throw new Error('SEI swap service not found');
    }
    if ('stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    logger.info('SEI swap service stopped');
  }

  /**
   * Gets available tokens for swapping
   */
  getAvailableTokens(): Record<string, TokenInfo> {
    // Get native address from Symphony config
    const config = this.symphony.getConfig();
    
    return {
      sei: {
        address: config.nativeAddress as Address, // Native SEI
        symbol: 'SEI',
        decimals: 18,
        name: 'SEI'
      },
      // Add other mainnet tokens - these are examples, replace with actual addresses
      usdc: {
        address: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392' as Address, // Example USDC address
        symbol: 'USDC',
        decimals: 6,
        name: 'USD Coin'
      },
      usdt: {
        address: '0x9151434b16b9763660705744891fA906F660EcC5' as Address, // Example USDT address
        symbol: 'USDT', 
        decimals: 6,
        name: 'Tether USD'
      },
      seiyan: {
        address: '0x5f0E07dFeE5832Faa00c63F2D33A0D79150E8598' as Address, // Example USDT address
        symbol: 'SEIYAN', 
        decimals: 6,
        name: 'SEIYAN'
      },
      
      // Add more tokens as needed
    };
  }

  /**
   * Gets token balance following sei-agent-kit pattern
   */
  async getTokenBalance(tokenAddress: Address): Promise<string> {
    try {
      logger.info(`Querying balance of ${tokenAddress} for ${this.account.address}...`);
      
      const config = this.symphony.getConfig();
      
      // For native SEI, use getBalance
      if (tokenAddress === config.nativeAddress || tokenAddress === '0x0') {
        const balance = await this.publicClient.getBalance({ 
          address: this.account.address 
        });
        return formatEther(balance);
      }
      
      // For ERC20 tokens, read contract
      const balance = await this.publicClient.readContract({
        address: tokenAddress,
        abi: [
          {
            name: 'balanceOf',
            type: 'function',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'balanceOf',
        args: [this.account.address],
      });
      
      // Get token decimals
      const decimals = await this.publicClient.readContract({
        address: tokenAddress,
        abi: [
          {
            name: 'decimals',
            type: 'function',
            inputs: [],
            outputs: [{ name: '', type: 'uint8' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'decimals',
      });
      
      // Format balance with proper decimals
      const divisor = BigInt(10 ** Number(decimals));
      const formattedBalance = Number(balance as bigint) / Number(divisor);
      
      return formattedBalance.toString();
    } catch (error) {
      logger.error({ error, tokenAddress }, 'Failed to get token balance');
      throw new Error(`Failed to get token balance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Checks if user has sufficient balance - following sei-agent-kit pattern
   */
  async checkSufficientBalance(tokenAddress: Address, amount: string): Promise<boolean> {
    try {
      const balance = await this.getTokenBalance(tokenAddress);
      const hasBalance = Number(balance) >= Number(amount);
      
      if (!hasBalance) {
        logger.warn(`Insufficient balance. Required: ${amount}, Available: ${balance}`);
      }
      
      return hasBalance;
    } catch (error) {
      logger.error({ error }, 'Failed to check balance');
      return false;
    }
  }

  /**
   * Gets a swap route
   */
  async getSwapRoute(fromToken: Address, toToken: Address, amountIn: string): Promise<any> {
    try {
      logger.info(`Getting swap route: ${amountIn} ${fromToken} -> ${toToken}`);
      
      // Check sufficient balance first
      const hasSufficientBalance = await this.checkSufficientBalance(fromToken, amountIn);
      if (!hasSufficientBalance) {
        throw new Error("Insufficient balance");
      }
      
      const route = await this.symphony.getRoute(
        fromToken,
        toToken,
        amountIn
      );
      
      return route;
    } catch (error) {
      logger.error({ error }, 'Failed to get swap route');
      throw new Error(`Failed to get swap route: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Executes a swap following sei-agent-kit pattern with proper approvals
   */
  async executeSwap(fromToken: Address, toToken: Address, amountIn: string, slippageAmount?: string): Promise<SwapData> {
    try {
      logger.info(`Executing swap: ${amountIn} ${fromToken} -> ${toToken}`);
      
      // Get the route for the swap
      const route = await this.getSwapRoute(fromToken, toToken, amountIn);
      
      // Check if approval is needed (following sei-agent-kit pattern)
      const isApproved = await route.checkApproval();
      if (!isApproved) {
        logger.info('Approval required, giving approval...');
        await route.giveApproval();
      }

      // Execute the swap
      const { swapReceipt } = await route.swap({
        slippage: {
          slippageAmount: slippageAmount || this.slippageTolerance,
        }
      });

      const swapData: SwapData = {
        fromToken: route.tokenIn,
        toToken: route.tokenOut,
        amountIn: route.amountInFormatted || amountIn,
        amountOut: route.amountOutFormatted || '0',
        transactionHash: swapReceipt.transactionHash,
        route: route
      };

      logger.info(`Swap successful: ${swapData.transactionHash}`);
      return swapData;
    } catch (error) {
      logger.error({ error }, 'Failed to execute swap');
      
      // Return error in same format as sei-agent-kit
      if (error instanceof Error && error.message.includes("Insufficient balance")) {
        throw new Error("Insufficient balance");
      }
      
      throw new Error(`Failed to execute swap: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse token from text input
   */
  parseTokenFromText(text: string, availableTokens: Record<string, TokenInfo>): { token: TokenInfo | null, symbol: string } {
    const lowerText = text.toLowerCase();
    
    for (const [key, tokenInfo] of Object.entries(availableTokens)) {
      if (lowerText.includes(tokenInfo.symbol.toLowerCase()) || 
          lowerText.includes(tokenInfo.name.toLowerCase()) ||
          lowerText.includes(key.toLowerCase())) {
        return { token: tokenInfo, symbol: tokenInfo.symbol };
      }
    }
    
    return { token: null, symbol: '' };
  }

  /**
   * Parse amount from text input
   */
  parseAmountFromText(text: string): string {
    const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
    return amountMatch ? amountMatch[1] : '1.0';
  }
}

const swapSeiAction: Action = {
  name: 'SWAP_SEI',
  similes: ['SWAP_TOKENS', 'EXCHANGE_TOKENS', 'TRADE_TOKENS', 'CONVERT_TOKENS'],
  description: 'Swaps SEI tokens using Symphony protocol with proper balance checks and approvals',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return text.includes('swap') || 
           text.includes('exchange') || 
           text.includes('trade') ||
           text.includes('convert');
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
          text: 'I need a message with text to process your swap request.',
        };
      }

      const service = runtime.getService(SeiSwapService.serviceType) as SeiSwapService;
      if (!service) {
        throw new Error('SEI swap service not available');
      }

      const text = message.content.text.toLowerCase();
      const availableTokens = service.getAvailableTokens();
      
      // Parse amount
      const amount = service.parseAmountFromText(text);
      
      // Parse tokens - try to detect "from" and "to" tokens
      let fromToken = availableTokens.sei; // Default to SEI
      let toToken = availableTokens.usdc; // Default to USDC
      
      // Look for patterns like "swap X SEI to USDC" or "trade SEI for USDT"
      const swapPattern = /swap\s+[\d.]+\s+(\w+)\s+(?:to|for)\s+(\w+)/i;
      const tradePattern = /trade\s+[\d.]+\s+(\w+)\s+(?:to|for)\s+(\w+)/i;
      const convertPattern = /convert\s+[\d.]+\s+(\w+)\s+(?:to|for)\s+(\w+)/i;
      
      const match = text.match(swapPattern) || text.match(tradePattern) || text.match(convertPattern);
      
      if (match) {
        const fromSymbol = match[1].toLowerCase();
        const toSymbol = match[2].toLowerCase();
        
        // Find tokens by symbol
        const fromTokenFound = Object.values(availableTokens).find(t => 
          t.symbol.toLowerCase() === fromSymbol
        );
        const toTokenFound = Object.values(availableTokens).find(t => 
          t.symbol.toLowerCase() === toSymbol
        );
        
        if (fromTokenFound) fromToken = fromTokenFound;
        if (toTokenFound) toToken = toTokenFound;
      }

      // Execute swap
      const swapResult = await service.executeSwap(
        fromToken.address,
        toToken.address,
        amount,
        process.env.SEI_SLIPPAGE_TOLERANCE || '1'
      );

      const response = `✅ Successfully swapped ${swapResult.amountIn} ${fromToken.symbol} to ${swapResult.amountOut} ${toToken.symbol}\n\n🔗 Transaction: ${swapResult.transactionHash}`;

      if (callback) {
        await callback({
          text: response,
          actions: ['SWAP_SEI'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['SWAP_SEI'],
          source: message.content.source,
          swapResult,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute swap';
      logger.error({ error }, 'Swap action failed');
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `❌ Sorry, I couldn't execute the swap. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Swap 1 SEI to USDC',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '✅ Successfully swapped 1.0 SEI to 0.95 USDC\n\n🔗 Transaction: 0x1234...',
          actions: ['SWAP_SEI'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Trade 5 SEI for USDT',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '✅ Successfully swapped 5.0 SEI to 4.75 USDT\n\n🔗 Transaction: 0x5678...',
          actions: ['SWAP_SEI'],
        },
      },
    ],
  ],
};

/**
 * Demo action to check wallet balance
 */
const checkBalanceAction: Action = {
  name: 'CHECK_BALANCE',
  similes: ['WALLET_BALANCE', 'BALANCE_CHECK', 'MY_BALANCE', 'CHECK_WALLET'],
  description: 'Checks the SEI wallet balance and displays portfolio information',
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return text.includes('balance') || 
           text.includes('wallet') || 
           text.includes('check my') ||
           text.includes('portfolio');
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      logger.info('🔍 Checking wallet balance...');

      const service = runtime.getService(SeiSwapService.serviceType) as SeiSwapService;
      if (!service) {
        throw new Error('SEI Swap service not available');
      }

      // Get wallet address from private key
      const account = service['account'];
      const walletAddress = account.address;

      // Demo balance data (in a real implementation, this would fetch from blockchain)
      const demoBalance = {
        sei: '125.50',
        usdc: '2,450.75',
        weth: '0.0125',
        totalUsd: '3,125.80'
      };

      const response = `💰 **Wallet Balance Summary**

🔗 **Address:** \`${walletAddress}\`

💎 **Token Balances:**
• **SEI:** ${demoBalance.sei} SEI (~$${(parseFloat(demoBalance.sei) * 0.42).toFixed(2)})
• **USDC:** ${demoBalance.usdc} USDC
• **WETH:** ${demoBalance.weth} WETH (~$${(parseFloat(demoBalance.weth) * 2500).toFixed(2)})

📊 **Portfolio Value:** $${demoBalance.totalUsd} USD

🎯 **Quick Actions:**
• Say "swap 10 SEI to USDC" to trade tokens
• Say "send 5 SEI to [address]" to transfer tokens
• Say "show trading history" for recent transactions`;

      if (callback) {
        callback({
          text: response,
          content: { 
            success: true, 
            balance: demoBalance,
            address: walletAddress 
          },
          action: 'CHECK_BALANCE'
        });
      }

      return {
        text: response,
        content: { 
          success: true, 
          balance: demoBalance,
          address: walletAddress,
          actions: ['CHECK_BALANCE']
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to check balance';
      logger.error({ error }, 'Balance check failed');

      return {
        text: `❌ Sorry, I couldn't check your wallet balance. ${errorMessage}`,
        content: { 
          error: new Error(errorMessage),
          success: false 
        }
      };
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'What is my wallet balance?' }
      },
      {
        user: 'Sei Mate',
        content: { 
          text: '💰 **Wallet Balance Summary**\n\n🔗 **Address:** `sei1abc123def456...`\n\n💎 **Token Balances:**\n• **SEI:** 125.50 SEI (~$52.71)\n• **USDC:** 2,450.75 USDC\n• **WETH:** 0.0125 WETH (~$31.25)\n\n📊 **Portfolio Value:** $3,125.80 USD',
          actions: ['CHECK_BALANCE']
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Check my portfolio' }
      },
      {
        user: 'Sei Mate',
        content: { 
          text: '💰 **Wallet Balance Summary**\n\n🔗 **Address:** `sei1xyz789abc123...`\n\n💎 **Token Balances:**\n• **SEI:** 89.25 SEI (~$37.49)\n• **USDC:** 1,250.00 USDC\n\n📊 **Portfolio Value:** $1,875.45 USD',
          actions: ['CHECK_BALANCE']
        }
      }
    ]
  ]
};

/**
 * Demo action to transfer SEI tokens
 */
const transferTokensAction: Action = {
  name: 'TRANSFER_TOKENS',
  similes: ['SEND_SEI', 'TRANSFER_SEI', 'SEND_TOKENS', 'TRANSFER_FUNDS'],
  description: 'Transfers SEI tokens to another wallet address',
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return (text.includes('send') || text.includes('transfer')) && 
           (text.includes('sei') || text.includes('token')) &&
           (text.includes('to ') || text.includes('0x') || text.includes('sei1'));
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      logger.info('💸 Processing token transfer...');

      const text = message.content.text;

      // Extract amount and recipient address
      const amountMatch = text.match(/send\s+(\d+(?:\.\d+)?)\s+sei/i) || 
                         text.match(/transfer\s+(\d+(?:\.\d+)?)\s+sei/i);
      const addressMatch = text.match(/(0x[a-fA-F0-9]{40}|sei1[a-z0-9]{38,58})/);

      if (!amountMatch) {
        return {
          text: '❌ Please specify an amount to send (e.g., "send 5 SEI to sei1abc123...")',
          content: { error: new Error('Amount not specified') }
        };
      }

      if (!addressMatch) {
        return {
          text: '❌ Please specify a valid recipient address (e.g., "send 5 SEI to sei1abc123...")',
          content: { error: new Error('Recipient address not specified') }
        };
      }

      const amount = parseFloat(amountMatch[1]);
      const recipientAddress = addressMatch[1];

      // Demo confirmation prompt
      const confirmationMessage = `🔄 **Transfer Confirmation Required**

💸 **Transfer Details:**
• **Amount:** ${amount} SEI (~$${(amount * 0.42).toFixed(2)} USD)
• **To:** \`${recipientAddress}\`
• **Network:** SEI Mainnet
• **Estimated Gas:** ~0.001 SEI

⚠️ **Please confirm:** Are you sure you want to send ${amount} SEI to this address?

**Reply with "yes" or "confirm" to proceed, or "cancel" to abort.**`;

      // In demo mode, we'll simulate the transfer after confirmation
      if (callback) {
        callback({
          text: confirmationMessage,
          content: { 
            pendingTransfer: {
              amount,
              recipient: recipientAddress,
              status: 'pending_confirmation'
            }
          },
          action: 'TRANSFER_TOKENS'
        });
      }

      return {
        text: confirmationMessage,
        content: { 
          pendingTransfer: {
            amount,
            recipient: recipientAddress,
            status: 'pending_confirmation'
          },
          actions: ['TRANSFER_TOKENS']
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process transfer';
      logger.error({ error }, 'Token transfer failed');

      return {
        text: `❌ Sorry, I couldn't process the transfer. ${errorMessage}`,
        content: { 
          error: new Error(errorMessage),
          success: false 
        }
      };
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'Send 10 SEI to sei1abc123def456ghi789' }
      },
      {
        user: 'Sei Mate',
        content: { 
          text: '🔄 **Transfer Confirmation Required**\n\n💸 **Transfer Details:**\n• **Amount:** 10 SEI (~$4.20 USD)\n• **To:** `sei1abc123def456ghi789`\n• **Network:** SEI Mainnet\n• **Estimated Gas:** ~0.001 SEI\n\n⚠️ **Please confirm:** Are you sure you want to send 10 SEI to this address?\n\n**Reply with "yes" or "confirm" to proceed, or "cancel" to abort.**',
          actions: ['TRANSFER_TOKENS']
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: { text: 'Transfer 25.5 SEI to 0xD5ca6eA5e33606554F746606157a7512FA738A12' }
      },
      {
        user: 'Sei Mate',
        content: { 
          text: '🔄 **Transfer Confirmation Required**\n\n💸 **Transfer Details:**\n• **Amount:** 25.5 SEI (~$10.71 USD)\n• **To:** `0xD5ca6eA5e33606554F746606157a7512FA738A12`\n• **Network:** SEI Mainnet\n• **Estimated Gas:** ~0.001 SEI\n\n⚠️ **Please confirm:** Are you sure you want to send 25.5 SEI to this address?',
          actions: ['TRANSFER_TOKENS']
        }
      }
    ]
  ]
};

// const getBalanceAction: Action = {
//   name: 'GET_TOKEN_BALANCE',
//   similes: ['CHECK_TOKEN_BALANCE', 'TOKEN_BALANCE', 'WALLET_TOKEN_BALANCE', 'TOKEN_HOLDINGS'],
//   description: 'Gets the balance of SEI and other tokens in your wallet for swapping',

//   validate: async (
//     runtime: IAgentRuntime,
//     message: Memory,
//     _state: State | undefined
//   ): Promise<boolean> => {
//     if (!message.content.text) return false;
    
//     const text = message.content.text.toLowerCase();
//     return (text.includes('token') && text.includes('balance')) || 
//            (text.includes('token') && text.includes('holdings')) ||
//            (text.includes('swap') && text.includes('balance')) ||
//            text.includes('token balance') ||
//            text.includes('wallet tokens');
//   },

//   handler: async (
//     runtime: IAgentRuntime,
//     message: Memory,
//     _state: State | undefined,
//     _options: Record<string, unknown> = {},
//     callback?: HandlerCallback,
//     _responses?: Memory[]
//   ): Promise<ActionResult> => {
//     try {
//       const service = runtime.getService(SeiSwapService.serviceType) as SeiSwapService;
//       if (!service) {
//         throw new Error('SEI swap service not available');
//       }

//       const tokens = service.getAvailableTokens();
//       const balances: Record<string, string> = {};
      
//       // Get balances for all available tokens
//       for (const [key, tokenInfo] of Object.entries(tokens)) {
//         try {
//           balances[tokenInfo.symbol] = await service.getTokenBalance(tokenInfo.address);
//         } catch (error) {
//           logger.warn(`Failed to get balance for ${tokenInfo.symbol}: ${error}`);
//           balances[tokenInfo.symbol] = '0';
//         }
//       }

//       const response = `💰 **Your Wallet Token Balances (Available for Swapping):**\n${Object.entries(balances)
//         .map(([symbol, balance]) => `• ${symbol}: ${Number(balance).toFixed(4)}`)
//         .join('\n')}\n\n💡 *These are your wallet token holdings available for swapping*`;

//       if (callback) {
//         await callback({
//           text: response,
//           actions: ['GET_TOKEN_BALANCE'],
//           source: message.content.source,
//         });
//       }

//       return {
//         text: response,
//         success: true,
//         data: {
//           actions: ['GET_TOKEN_BALANCE'],
//           source: message.content.source,
//           balances,
//         },
//       };
//     } catch (error) {
//       const errorMessage = error instanceof Error ? error.message : 'Failed to get balances';
//       logger.error({ error }, 'Balance check failed');
      
//       return {
//         success: false,
//         error: error instanceof Error ? error : new Error(String(error)),
//         text: `❌ Sorry, I couldn't get your balances. ${errorMessage}`,
//       };
//     }
//   },

//   examples: [
//     [
//       {
//         name: '{{name1}}',
//         content: {
//           text: 'Check my token balances for swapping',
//         },
//       },
//       {
//         name: '{{name2}}',
//         content: {
//           text: '💰 **Your Wallet Token Balances (Available for Swapping):**\n• SEI: 10.5000\n• USDC: 25.0000\n• USDT: 15.2500\n\n💡 *These are your wallet token holdings available for swapping*',
//           actions: ['GET_TOKEN_BALANCE'],
//         },
//       },
//     ],
//     [
//       {
//         name: '{{name1}}',
//         content: {
//           text: 'What tokens do I have in my wallet?',
//         },
//       },
//       {
//         name: '{{name2}}',
//         content: {
//           text: '💰 **Your Wallet Token Balances (Available for Swapping):**\n• SEI: 5.2500\n• USDC: 100.0000\n• SEIYAN: 1000.0000\n\n💡 *These are your wallet token holdings available for swapping*',
//           actions: ['GET_TOKEN_BALANCE'],
//         },
//       },
//     ],
//   ],
// };

export const seiSwapPlugin: Plugin = {
  name: 'sei-swap',
  description: 'SEI token swapping plugin with Symphony protocol integration',
  actions: [swapTokensAction, checkBalanceAction, transferTokensAction], // Added new demo actions
  providers: [swapProvider],
  evaluators: [],
  services: [SeiSwapService],
  config: {
    SEI_PRIVATE_KEY: process.env.SEI_PRIVATE_KEY,
    SEI_RPC_URL: process.env.SEI_RPC_URL,
    SEI_SLIPPAGE_TOLERANCE: process.env.SEI_SLIPPAGE_TOLERANCE,
  },
  models: {
    [ModelType.TEXT_SMALL]: async (
      runtime: IAgentRuntime,
      params: GenerateTextParams
    ): Promise<string> => {
      return `SEI Swap Plugin Response: ${params.prompt}`;
    },
    [ModelType.TEXT_LARGE]: async (
      runtime: IAgentRuntime,
      params: GenerateTextParams
    ): Promise<string> => {
      return `SEI Swap Plugin Detailed Response: ${params.prompt}`;
    },
  },
  routes: [
    {
      name: 'api-swap-route',
      path: '/api/swap/route',
      type: 'GET',
      handler: async (req: any, res: any) => {
        try {
          const { fromToken, toToken, amountIn } = req.query;
          
          if (!fromToken || !toToken || !amountIn) {
            return res.status(400).json({ 
              error: 'fromToken, toToken, and amountIn parameters are required' 
            });
          }

          const service = req.runtime.getService(SeiSwapService.serviceType) as SeiSwapService;
          if (!service) {
            return res.status(500).json({ error: 'SEI swap service not available' });
          }

          const route = await service.getSwapRoute(fromToken, toToken, amountIn);
          res.json(route);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get swap route',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      name: 'api-swap-execute',
      path: '/api/swap/execute',
      type: 'POST',
      handler: async (req: any, res: any) => {
        try {
          const { fromToken, toToken, amountIn, slippageAmount } = req.body;
          
          if (!fromToken || !toToken || !amountIn) {
            return res.status(400).json({ error: 'fromToken, toToken, and amountIn are required' });
          }

          const service = req.runtime.getService(SeiSwapService.serviceType) as SeiSwapService;
          if (!service) {
            return res.status(500).json({ error: 'SEI swap service not available' });
          }

          const swapResult = await service.executeSwap(fromToken, toToken, amountIn, slippageAmount);
          res.json(swapResult);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to execute swap',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      name: 'api-balance',
      path: '/api/balance',
      type: 'GET',
      handler: async (req: any, res: any) => {
        try {
          const service = req.runtime.getService(SeiSwapService.serviceType) as SeiSwapService;
          if (!service) {
            return res.status(500).json({ error: 'SEI swap service not available' });
          }

          const tokens = service.getAvailableTokens();
          const balances: Record<string, string> = {};
          
          for (const [key, tokenInfo] of Object.entries(tokens)) {
            try {
              balances[tokenInfo.symbol] = await service.getTokenBalance(tokenInfo.address);
            } catch (error) {
              balances[tokenInfo.symbol] = '0';
            }
          }

          res.json(balances);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get balances',
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
};

export default seiSwapPlugin;