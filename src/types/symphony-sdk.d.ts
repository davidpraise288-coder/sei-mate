declare module 'symphony-sdk/viem' {
  export class Symphony {
    constructor();
    
    getConfig(): {
      nativeAddress: string;
      [key: string]: any;
    };
    
    connectWalletClient(walletClient: any): void;
    
    getRoute(
      fromToken: string,
      toToken: string,
      amountIn: string
    ): Promise<{
      tokenIn: string;
      tokenOut: string;
      amountInFormatted: string;
      amountOutFormatted: string;
      swap: (options: { slippage: { slippageAmount: string } }) => Promise<{
        swapReceipt: {
          transactionHash: string;
        };
      }>;
      [key: string]: any;
    }>;
  }
}

// Additional type definitions for better TypeScript support
declare global {
  interface Window {
    ethereum?: any;
  }
}