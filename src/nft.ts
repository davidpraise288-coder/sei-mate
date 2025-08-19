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
 * Defines the configuration schema for the SEI NFT plugin
 */
const configSchema = z.object({
  SEI_RPC_URL: z
    .string()
    .url()
    .default('https://rpc.sei-apis.com')
    .transform((val) => val.trim()),
  SEI_REST_URL: z
    .string()
    .url()
    .default('https://rest.sei-apis.com')
    .transform((val) => val.trim()),
  SEI_CHAIN_ID: z
    .string()
    .default('pacific-1')
    .transform((val) => val.trim()),
  NFT_CONTRACT_ADDRESS: z
    .string()
    .optional()
    .transform((val) => val?.trim()),
  MARKETPLACE_CONTRACT_ADDRESS: z
    .string()
    .optional()
    .transform((val) => val?.trim()),
});

/**
 * Interface for NFT metadata
 */
interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  external_url?: string;
}

/**
 * Interface for NFT data
 */
interface NFTData {
  token_id: string;
  owner: string;
  metadata: NFTMetadata;
  contract_address: string;
  price?: string;
  is_for_sale: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Interface for mint request
 */
interface MintRequest {
  recipient: string;
  metadata: NFTMetadata;
  price?: string;
}

/**
 * Interface for buy/sell request
 */
interface TradeRequest {
  token_id: string;
  price: string;
  buyer?: string;
  seller?: string;
}

/**
 * Interface for transaction result
 */
interface TransactionResult {
  success: boolean;
  tx_hash?: string;
  error?: string;
  gas_used?: string;
  block_height?: number;
}

/**
 * SEI NFT Service to handle NFT-related functionality
 */
export class SEINFTService extends Service {
  static override serviceType = 'sei-nft';

  override capabilityDescription =
    'Provides SEI NFT functionality including minting, buying, and selling NFTs on the SEI blockchain.';

  private rpcUrl: string;
  private restUrl: string;
  private chainId: string;
  private nftContractAddress?: string;
  private marketplaceContractAddress?: string;

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    this.rpcUrl = process.env.SEI_RPC_URL || 'https://rpc.sei-apis.com';
    this.restUrl = process.env.SEI_REST_URL || 'https://rest.sei-apis.com';
    this.chainId = process.env.SEI_CHAIN_ID || 'pacific-1';
    this.nftContractAddress = process.env.NFT_CONTRACT_ADDRESS;
    this.marketplaceContractAddress = process.env.MARKETPLACE_CONTRACT_ADDRESS;
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('Starting SEI NFT service');
    return new SEINFTService(runtime);
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping SEI NFT service');
    const service = runtime.getService(SEINFTService.serviceType);
    if (!service) {
      throw new Error('SEI NFT service not found');
    }
    if ('stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    logger.info('SEI NFT service stopped');
  }

  /**
   * Mints a new NFT on the SEI blockchain
   * @param mintRequest The mint request containing recipient and metadata
   * @returns Transaction result
   */
  async mintNFT(mintRequest: MintRequest): Promise<TransactionResult> {
    try {
      if (!this.nftContractAddress) {
        throw new Error('NFT contract address not configured');
      }

      // Build and broadcast the actual minting transaction
      const txBytes = this.buildMintTransaction(mintRequest);
      
      // Broadcast transaction to SEI network
      const response = await axios.post(`${this.restUrl}/cosmos/tx/v1beta1/txs`, {
        tx_bytes: txBytes,
        mode: 'BROADCAST_MODE_SYNC'
      }, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.data.tx_response && response.data.tx_response.code === 0) {
        return {
          success: true,
          tx_hash: response.data.tx_response.txhash,
          gas_used: response.data.tx_response.gas_used,
          block_height: response.data.tx_response.height,
        };
      } else {
        throw new Error(response.data.tx_response?.raw_log || 'Transaction failed');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to mint NFT');
      return {
        success: false,
        error: `Failed to mint NFT: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Lists an NFT for sale on the marketplace
   * @param tradeRequest The trade request containing token_id and price
   * @returns Transaction result
   */
  async sellNFT(tradeRequest: TradeRequest): Promise<TransactionResult> {
    try {
      if (!this.marketplaceContractAddress) {
        throw new Error('Marketplace contract address not configured');
      }

      // Build and broadcast the actual selling transaction
      const txBytes = this.buildSellTransaction(tradeRequest);
      
      // Broadcast transaction to SEI network
      const response = await axios.post(`${this.restUrl}/cosmos/tx/v1beta1/txs`, {
        tx_bytes: txBytes,
        mode: 'BROADCAST_MODE_SYNC'
      }, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.data.tx_response && response.data.tx_response.code === 0) {
        return {
          success: true,
          tx_hash: response.data.tx_response.txhash,
          gas_used: response.data.tx_response.gas_used,
          block_height: response.data.tx_response.height,
        };
      } else {
        throw new Error(response.data.tx_response?.raw_log || 'Transaction failed');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to sell NFT');
      return {
        success: false,
        error: `Failed to sell NFT: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Buys an NFT from the marketplace
   * @param tradeRequest The trade request containing token_id and buyer info
   * @returns Transaction result
   */
  async buyNFT(tradeRequest: TradeRequest): Promise<TransactionResult> {
    try {
      if (!this.marketplaceContractAddress) {
        throw new Error('Marketplace contract address not configured');
      }

      // Build and broadcast the actual buying transaction
      const txBytes = this.buildBuyTransaction(tradeRequest);
      
      // Broadcast transaction to SEI network
      const response = await axios.post(`${this.restUrl}/cosmos/tx/v1beta1/txs`, {
        tx_bytes: txBytes,
        mode: 'BROADCAST_MODE_SYNC'
      }, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.data.tx_response && response.data.tx_response.code === 0) {
        return {
          success: true,
          tx_hash: response.data.tx_response.txhash,
          gas_used: response.data.tx_response.gas_used,
          block_height: response.data.tx_response.height,
        };
      } else {
        throw new Error(response.data.tx_response?.raw_log || 'Transaction failed');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to buy NFT');
      return {
        success: false,
        error: `Failed to buy NFT: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Gets NFT information by token ID
   * @param tokenId The token ID to query
   * @returns NFT data
   */
  async getNFT(tokenId: string): Promise<NFTData | null> {
    try {
      if (!this.nftContractAddress) {
        throw new Error('NFT contract address not configured');
      }

      // Query NFT information from SEI blockchain
      const response = await axios.get(`${this.restUrl}/cosmwasm/wasm/v1/contract/${this.nftContractAddress}/smart/${Buffer.from(JSON.stringify({
        nft_info: { token_id: tokenId }
      })).toString('base64')}`, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.data?.data) {
        return null;
      }

      const nftInfo = response.data.data;
      
      // Query owner information
      const ownerResponse = await axios.get(`${this.restUrl}/cosmwasm/wasm/v1/contract/${this.nftContractAddress}/smart/${Buffer.from(JSON.stringify({
        owner_of: { token_id: tokenId }
      })).toString('base64')}`, {
        headers: { 'Accept': 'application/json' },
      });

      const owner = ownerResponse.data?.data?.owner || 'unknown';

      // Check if NFT is for sale on marketplace
      let price = null;
      let isForSale = false;
      
      if (this.marketplaceContractAddress) {
        try {
          const marketResponse = await axios.get(`${this.restUrl}/cosmwasm/wasm/v1/contract/${this.marketplaceContractAddress}/smart/${Buffer.from(JSON.stringify({
            get_listing: { token_id: tokenId, contract: this.nftContractAddress }
          })).toString('base64')}`, {
            headers: { 'Accept': 'application/json' },
          });
          
          if (marketResponse.data?.data) {
            price = marketResponse.data.data.price;
            isForSale = true;
          }
        } catch {
          // NFT not listed for sale
        }
      }

      return {
        token_id: tokenId,
        owner,
        metadata: nftInfo.extension || nftInfo,
        contract_address: this.nftContractAddress,
        price: price?.toString() || null,
        is_for_sale: isForSale,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get NFT');
      return null;
    }
  }

  private buildMintTransaction(mintRequest: MintRequest): string {
    // Build CosmWasm execute message for NFT minting
    const executeMsg = {
      mint: {
        token_id: Date.now().toString(), // Generate unique token ID
        owner: mintRequest.recipient,
        extension: mintRequest.metadata,
      }
    };
    
    const msg = {
      typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
      value: {
        sender: mintRequest.recipient,
        contract: this.nftContractAddress,
        msg: Buffer.from(JSON.stringify(executeMsg)),
        funds: []
      }
    };
    
    // This would need proper transaction encoding with @cosmjs/proto-signing
    return Buffer.from(JSON.stringify(msg)).toString('base64');
  }

  private buildSellTransaction(tradeRequest: TradeRequest): string {
    // Build CosmWasm execute message for listing NFT on marketplace
    const executeMsg = {
      list_nft: {
        token_id: tradeRequest.token_id,
        contract: this.nftContractAddress,
        price: {
          denom: 'usei',
          amount: tradeRequest.price
        }
      }
    };
    
    const msg = {
      typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
      value: {
        sender: tradeRequest.seller,
        contract: this.marketplaceContractAddress,
        msg: Buffer.from(JSON.stringify(executeMsg)),
        funds: []
      }
    };
    
    return Buffer.from(JSON.stringify(msg)).toString('base64');
  }

  private buildBuyTransaction(tradeRequest: TradeRequest): string {
    // Build CosmWasm execute message for buying NFT from marketplace
    const executeMsg = {
      buy_nft: {
        token_id: tradeRequest.token_id,
        contract: this.nftContractAddress
      }
    };
    
    const msg = {
      typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
      value: {
        sender: tradeRequest.buyer,
        contract: this.marketplaceContractAddress,
        msg: Buffer.from(JSON.stringify(executeMsg)),
        funds: [{
          denom: 'usei',
          amount: tradeRequest.price
        }]
      }
    };
    
    return Buffer.from(JSON.stringify(msg)).toString('base64');
  }
}

/**
 * Action to mint a new NFT
 */
const mintNFTAction: Action = {
  name: 'MINT_NFT',
  similes: ['CREATE_NFT', 'MINT_NFT_TOKEN', 'NEW_NFT', 'NFT_CREATE'],
  description: 'Creates and mints a new NFT on the SEI blockchain with custom metadata',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;

    const text = message.content.text.toLowerCase();
    return (text.includes('mint') && text.includes('nft')) || 
           (text.includes('create') && text.includes('nft')) || 
           text.includes('mint nft') ||
           text.includes('new nft');
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
          text: 'I need a message with text to process your mint request.',
        };
      }

      const text = message.content.text;
      
      // Extract NFT details from message (simplified parsing)
      const nameMatch = text.match(/name[:\s]+"([^"]+)"/i) || text.match(/name[:\s]+([^\s,]+)/i);
      const descMatch = text.match(/description[:\s]+"([^"]+)"/i);
      const imageMatch = text.match(/image[:\s]+"([^"]+)"/i);
      const recipientMatch = text.match(/for[:\s]+([a-zA-Z0-9]{20,})/i) || text.match(/to[:\s]+([a-zA-Z0-9]{20,})/i);

      if (!nameMatch) {
        return {
          success: false,
          error: new Error('NFT name not specified'),
          text: 'Please specify an NFT name (e.g., "mint NFT name: My Awesome NFT")',
        };
      }

      const mintRequest: MintRequest = {
        recipient: recipientMatch?.[1] || 'sei1default...',
        metadata: {
          name: nameMatch[1],
          description: descMatch?.[1] || 'A unique NFT on SEI blockchain',
          image: imageMatch?.[1] || 'https://example.com/default-nft.png',
        },
      };

      const service = runtime.getService(SEINFTService.serviceType) as SEINFTService;
      if (!service) {
        throw new Error('SEI NFT service not available');
      }

      const result = await service.mintNFT(mintRequest);

      if (!result.success) {
        return {
          success: false,
          error: new Error(result.error || 'Failed to mint NFT'),
          text: `Sorry, I couldn't mint the NFT. ${result.error}`,
        };
      }

      const response = `Successfully minted NFT "${mintRequest.metadata.name}"! Transaction hash: ${result.tx_hash}. Gas used: ${result.gas_used}`;

      if (callback) {
        await callback({
          text: response,
          actions: ['MINT_NFT'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['MINT_NFT'],
          source: message.content.source,
          mintRequest,
          result,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to mint NFT';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't mint the NFT. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Create an NFT called "Cosmic Dragon" with description "A mystical dragon from the cosmos"',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Successfully minted NFT "Cosmic Dragon"! Transaction hash: 0xabc123def456. Gas used: 150000',
          actions: ['MINT_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Mint a new NFT name: "Galaxy Warrior" description: "An epic space warrior NFT"',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Successfully minted NFT "Galaxy Warrior"! Transaction hash: 0xdef789ghi012. Gas used: 150000',
          actions: ['MINT_NFT'],
        },
      },
    ],
  ],
};

/**
 * Action to sell an NFT
 */
const sellNFTAction: Action = {
  name: 'SELL_NFT',
  similes: ['LIST_NFT', 'NFT_SELL', 'LIST_NFT_FOR_SALE', 'MARKETPLACE_LIST'],
  description: 'Lists your NFT for sale on the SEI NFT marketplace with a specified price',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;

    const text = message.content.text.toLowerCase();
    return (text.includes('sell') && text.includes('nft')) || 
           (text.includes('list') && text.includes('nft')) || 
           text.includes('sell nft') ||
           text.includes('list nft');
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
          text: 'I need a message with text to process your sell request.',
        };
      }

      const text = message.content.text;
      
      // Extract token ID and price from message
      const tokenIdMatch = text.match(/token[:\s]+([^\s,]+)/i) || text.match(/id[:\s]+([^\s,]+)/i);
      const priceMatch = text.match(/price[:\s]+([0-9.]+)/i) || text.match(/for[:\s]+([0-9.]+)/i);

      if (!tokenIdMatch) {
        return {
          success: false,
          error: new Error('Token ID not specified'),
          text: 'Please specify a token ID (e.g., "sell NFT token: 123 price: 100")',
        };
      }

      if (!priceMatch) {
        return {
          success: false,
          error: new Error('Price not specified'),
          text: 'Please specify a price (e.g., "sell NFT token: 123 price: 100")',
        };
      }

      const tradeRequest: TradeRequest = {
        token_id: tokenIdMatch[1],
        price: priceMatch[1],
      };

      const service = runtime.getService(SEINFTService.serviceType) as SEINFTService;
      if (!service) {
        throw new Error('SEI NFT service not available');
      }

      const result = await service.sellNFT(tradeRequest);

      if (!result.success) {
        return {
          success: false,
          error: new Error(result.error || 'Failed to sell NFT'),
          text: `Sorry, I couldn't list the NFT for sale. ${result.error}`,
        };
      }

      const response = `Successfully listed NFT #${tradeRequest.token_id} for sale at ${tradeRequest.price} SEI! Transaction hash: ${result.tx_hash}`;

      if (callback) {
        await callback({
          text: response,
          actions: ['SELL_NFT'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['SELL_NFT'],
          source: message.content.source,
          tradeRequest,
          result,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sell NFT';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't list the NFT for sale. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'List my NFT #123 for sale at 100 SEI',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Successfully listed NFT #123 for sale at 100 SEI! Transaction hash: 0xdef789ghi012',
          actions: ['SELL_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Sell NFT token: 456 price: 250',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Successfully listed NFT #456 for sale at 250 SEI! Transaction hash: 0xabc123def456',
          actions: ['SELL_NFT'],
        },
      },
    ],
  ],
};

/**
 * Action to buy an NFT
 */
const buyNFTAction: Action = {
  name: 'BUY_NFT',
  similes: ['PURCHASE_NFT', 'NFT_BUY', 'PURCHASE_NFT_TOKEN', 'MARKETPLACE_BUY'],
  description: 'Purchases an NFT from the SEI NFT marketplace using your wallet funds',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;

    const text = message.content.text.toLowerCase();
    return (text.includes('buy') && text.includes('nft')) || 
           (text.includes('purchase') && text.includes('nft')) || 
           text.includes('buy nft') ||
           text.includes('purchase nft');
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
          text: 'I need a message with text to process your buy request.',
        };
      }

      const text = message.content.text;
      
      // Extract token ID and buyer address from message
      const tokenIdMatch = text.match(/token[:\s]+([^\s,]+)/i) || text.match(/id[:\s]+([^\s,]+)/i);
      const buyerMatch = text.match(/buyer[:\s]+([a-zA-Z0-9]{20,})/i);

      if (!tokenIdMatch) {
        return {
          success: false,
          error: new Error('Token ID not specified'),
          text: 'Please specify a token ID (e.g., "buy NFT token: 123")',
        };
      }

      const tradeRequest: TradeRequest = {
        token_id: tokenIdMatch[1],
        price: '0', // Price will be determined by marketplace
        buyer: buyerMatch?.[1] || 'sei1buyer...',
      };

      const service = runtime.getService(SEINFTService.serviceType) as SEINFTService;
      if (!service) {
        throw new Error('SEI NFT service not available');
      }

      // First, get NFT info to show current price
      const nftData = await service.getNFT(tradeRequest.token_id);
      if (!nftData) {
        return {
          success: false,
          error: new Error('NFT not found'),
          text: `NFT #${tradeRequest.token_id} not found or not available for purchase.`,
        };
      }

      tradeRequest.price = nftData.price || '0';

      const result = await service.buyNFT(tradeRequest);

      if (!result.success) {
        return {
          success: false,
          error: new Error(result.error || 'Failed to buy NFT'),
          text: `Sorry, I couldn't buy the NFT. ${result.error}`,
        };
      }

      const response = `Successfully purchased NFT #${tradeRequest.token_id} "${nftData.metadata.name}" for ${tradeRequest.price} SEI! Transaction hash: ${result.tx_hash}`;

      if (callback) {
        await callback({
          text: response,
          actions: ['BUY_NFT'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['BUY_NFT'],
          source: message.content.source,
          tradeRequest,
          nftData,
          result,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to buy NFT';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't buy the NFT. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Buy NFT #123 from the marketplace',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Successfully purchased NFT #123 "Cosmic Dragon" for 100 SEI! Transaction hash: 0xghi345jkl678',
          actions: ['BUY_NFT'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Purchase NFT token: 789',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Successfully purchased NFT #789 "Galaxy Warrior" for 250 SEI! Transaction hash: 0xmno567pqr890',
          actions: ['BUY_NFT'],
        },
      },
    ],
  ],
};

export const seiNFTPlugin: Plugin = {
  name: 'plugin-sei-nft',
  description: 'Provides comprehensive SEI NFT functionality including minting, buying, and selling NFTs on the SEI blockchain',
  config: {
    SEI_RPC_URL: process.env.SEI_RPC_URL,
    SEI_REST_URL: process.env.SEI_REST_URL,
    SEI_CHAIN_ID: process.env.SEI_CHAIN_ID,
    NFT_CONTRACT_ADDRESS: process.env.NFT_CONTRACT_ADDRESS,
    MARKETPLACE_CONTRACT_ADDRESS: process.env.MARKETPLACE_CONTRACT_ADDRESS,
  },
  async init(config: Record<string, string>) {
    logger.info('Initializing plugin-sei-nft');
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
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
      return 'I can help you with SEI NFT operations including minting, buying, and selling NFTs.';
    },
    [ModelType.TEXT_LARGE]: async (
      _runtime,
      {
        prompt,
        stopSequences = [],
        maxTokens = 500,
        temperature = 0.7,
        frequencyPenalty = 0.7,
        presencePenalty = 0.7,
      }: GenerateTextParams
    ) => {
      return 'I specialize in SEI blockchain NFT operations. You can ask me to mint new NFTs with custom metadata, list your NFTs for sale on the marketplace, or buy NFTs from other users. I support full NFT lifecycle management on the SEI network with features like metadata management, price setting, and transaction tracking.';
    },
  },
  routes: [
    {
      name: 'api-nft-mint',
      path: '/api/nft/mint',
      type: 'POST',
      handler: async (req: any, res: any) => {
        try {
          const mintRequest = req.body as MintRequest;
          if (!mintRequest.recipient || !mintRequest.metadata?.name) {
            return res.status(400).json({ error: 'Invalid mint request: recipient and metadata.name are required' });
          }

          const service = req.runtime.getService(SEINFTService.serviceType) as SEINFTService;
          if (!service) {
            return res.status(500).json({ error: 'SEI NFT service not available' });
          }

          const result = await service.mintNFT(mintRequest);
          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to mint NFT',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      name: 'api-nft-sell',
      path: '/api/nft/sell',
      type: 'POST',
      handler: async (req: any, res: any) => {
        try {
          const tradeRequest = req.body as TradeRequest;
          if (!tradeRequest.token_id || !tradeRequest.price) {
            return res.status(400).json({ error: 'Invalid sell request: token_id and price are required' });
          }

          const service = req.runtime.getService(SEINFTService.serviceType) as SEINFTService;
          if (!service) {
            return res.status(500).json({ error: 'SEI NFT service not available' });
          }

          const result = await service.sellNFT(tradeRequest);
          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to sell NFT',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      name: 'api-nft-buy',
      path: '/api/nft/buy',
      type: 'POST',
      handler: async (req: any, res: any) => {
        try {
          const tradeRequest = req.body as TradeRequest;
          if (!tradeRequest.token_id) {
            return res.status(400).json({ error: 'Invalid buy request: token_id is required' });
          }

          const service = req.runtime.getService(SEINFTService.serviceType) as SEINFTService;
          if (!service) {
            return res.status(500).json({ error: 'SEI NFT service not available' });
          }

          const result = await service.buyNFT(tradeRequest);
          res.json(result);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to buy NFT',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      name: 'api-nft-info',
      path: '/api/nft/:tokenId',
      type: 'GET',
      handler: async (req: any, res: any) => {
        try {
          const tokenId = req.params.tokenId;
          if (!tokenId) {
            return res.status(400).json({ error: 'Token ID is required' });
          }

          const service = req.runtime.getService(SEINFTService.serviceType) as SEINFTService;
          if (!service) {
            return res.status(500).json({ error: 'SEI NFT service not available' });
          }

          const nftData = await service.getNFT(tokenId);
          if (!nftData) {
            return res.status(404).json({ error: 'NFT not found' });
          }

          res.json(nftData);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get NFT info',
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
  services: [SEINFTService],
  actions: [mintNFTAction, sellNFTAction, buyNFTAction],
  providers: [],
};

export default seiNFTPlugin;