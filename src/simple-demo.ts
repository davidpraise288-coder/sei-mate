import { 
  Action, 
  ActionResult, 
  IAgentRuntime, 
  Memory, 
  HandlerCallback, 
  State,
  logger,
  Plugin,
  ModelType,
  GenerateTextParams
} from '@elizaos/core';

// Simple transfer action
const transferAction: Action = {
  name: 'TRANSFER',
  similes: ['SEND', 'TRANSFER', 'SEND_TOKENS'],
  description: 'Transfer SEI tokens to another address',
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return text.includes('transfer') || text.includes('send');
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const text = message.content.text;
      
      // Simple parsing for demo
      const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
      const addressMatch = text.match(/to\s+([a-zA-Z0-9]+)/i);
      
      if (!amountMatch || !addressMatch) {
        return {
          text: "Please use format: 'transfer 10 SEI to sei1abc123...'",
          content: { error: 'Invalid format' }
        };
      }

      const amount = amountMatch[1];
      const address = addressMatch[1];

      const response = `🔄 **Transfer Confirmation**

💸 **Details:**
• Amount: ${amount} SEI (~$${(parseFloat(amount) * 0.42).toFixed(2)})
• To: ${address}
• Network: SEI Mainnet
• Gas: ~0.001 SEI

⚠️ Confirm with "yes" to proceed.`;

      return {
        text: response,
        content: { 
          success: true,
          amount,
          address,
          status: 'pending_confirmation'
        }
      };
    } catch (error) {
      return {
        text: `❌ Transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        content: { error: error instanceof Error ? error : new Error('Unknown error') }
      };
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'transfer 10 SEI to sei1abc123' }
      },
      {
        user: 'SEI Mate',
        content: { 
          text: '🔄 **Transfer Confirmation**\n\n💸 **Details:**\n• Amount: 10 SEI (~$4.20)\n• To: sei1abc123\n• Network: SEI Mainnet\n• Gas: ~0.001 SEI\n\n⚠️ Confirm with "yes" to proceed.'
        }
      }
    ]
  ]
};

// Simple balance action
const balanceAction: Action = {
  name: 'BALANCE',
  similes: ['CHECK_BALANCE', 'WALLET', 'BALANCE'],
  description: 'Check wallet balance',
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return text.includes('balance') || text.includes('wallet');
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      // Demo balance data
      const response = `💰 **Wallet Balance**

🔗 **Address:** sei1demo123...

💎 **Tokens:**
• SEI: 125.50 (~$52.71)
• USDC: 2,450.75
• WETH: 0.0125 (~$31.25)

📊 **Total:** $3,125.80

🎯 **Actions:**
• "transfer 10 SEI to [address]"
• "swap 5 SEI to USDC"`;

      return {
        text: response,
        content: { 
          success: true,
          balances: {
            SEI: '125.50',
            USDC: '2,450.75',
            WETH: '0.0125'
          }
        }
      };
    } catch (error) {
      return {
        text: `❌ Balance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        content: { error: error instanceof Error ? error : new Error('Unknown error') }
      };
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'check balance' }
      },
      {
        user: 'SEI Mate',
        content: { 
          text: '💰 **Wallet Balance**\n\n🔗 **Address:** sei1demo123...\n\n💎 **Tokens:**\n• SEI: 125.50 (~$52.71)\n• USDC: 2,450.75\n• WETH: 0.0125 (~$31.25)\n\n📊 **Total:** $3,125.80'
        }
      }
    ]
  ]
};

// Simple confirmation action
const confirmAction: Action = {
  name: 'CONFIRM',
  similes: ['YES', 'CONFIRM', 'PROCEED'],
  description: 'Confirm pending actions',
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text.toLowerCase();
    return text === 'yes' || text === 'confirm' || text === 'proceed';
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: { [key: string]: unknown },
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      // Simulate successful transaction
      const txHash = '0x' + Math.random().toString(16).substr(2, 40);
      
      const response = `✅ **Transfer Completed!**

🎉 **Success:**
• Transaction Hash: ${txHash}
• Status: Confirmed
• Block: #12,345,678
• Gas Used: 21,000

💡 Your transfer has been processed successfully!`;

      return {
        text: response,
        content: { 
          success: true,
          txHash,
          status: 'completed'
        }
      };
    } catch (error) {
      return {
        text: `❌ Confirmation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        content: { error: error instanceof Error ? error : new Error('Unknown error') }
      };
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: { text: 'yes' }
      },
      {
        user: 'SEI Mate',
        content: { 
          text: '✅ **Transfer Completed!**\n\n🎉 **Success:**\n• Transaction Hash: 0xabc123...\n• Status: Confirmed\n• Block: #12,345,678\n• Gas Used: 21,000\n\n💡 Your transfer has been processed successfully!'
        }
      }
    ]
  ]
};

// Simple plugin
export const simpleDemoPlugin: Plugin = {
  name: 'simple-demo',
  description: 'Simple demo plugin for SEI transfers and balance checking',
  actions: [transferAction, balanceAction, confirmAction],
  providers: [],
  evaluators: [],
  services: [],
  models: {
    [ModelType.TEXT_SMALL]: async (
      runtime: IAgentRuntime,
      params: GenerateTextParams
    ): Promise<string> => {
      return `SEI Mate: I can help you transfer SEI tokens and check balances. Try "transfer 10 SEI to sei1abc123" or "check balance".`;
    },
    [ModelType.TEXT_LARGE]: async (
      runtime: IAgentRuntime,
      params: GenerateTextParams
    ): Promise<string> => {
      return `Hello! I'm SEI Mate, your SEI blockchain assistant. I can help you:
• Transfer SEI tokens: "transfer 10 SEI to sei1abc123"
• Check wallet balance: "check balance"
• Confirm transactions: "yes" or "confirm"

What would you like to do?`;
    },
  },
};

export default simpleDemoPlugin;