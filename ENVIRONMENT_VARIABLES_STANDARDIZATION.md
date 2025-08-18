# Environment Variables Standardization for Sei Mate

## Current Issues
The plugins use inconsistent environment variable names, which causes users to enter the same information multiple times.

## Standardization Plan

### 1. Swap Plugin (`src/swap.ts`)
**Current:**
- `PRIVATE_KEY` 
- `RPC_URL`
- `SLIPPAGE_TOLERANCE`

**Should be:**
- `SEI_PRIVATE_KEY`
- `SEI_RPC_URL` 
- `SEI_SLIPPAGE_TOLERANCE`

### 2. Trading Plugin (`src/trade.ts`)
**Current:**
- `PRIVATE_KEY`
- `RPC_URL`
- `CITREX_ENVIRONMENT`
- `SUB_ACCOUNT_ID`

**Should be:**
- `SEI_PRIVATE_KEY`
- `SEI_RPC_URL`
- `SEI_CITREX_ENVIRONMENT`
- `SEI_SUB_ACCOUNT_ID`

### 3. Governance Plugin (`src/gov.ts`)
**Already standardized:**
- `SEI_RPC_URL` ✅
- `SEI_REST_URL` ✅
- `SEI_MNEMONIC` ✅
- `SEI_PRIVATE_KEY` ✅
- `SEI_CHAIN_ID` ✅
- `SEI_ADDRESS_PREFIX` ✅

### 4. NFT Plugin (`src/nft.ts`)
**Already standardized:**
- `SEI_RPC_URL` ✅
- `SEI_REST_URL` ✅
- `SEI_CHAIN_ID` ✅

### 5. Notification Plugin (`src/notification.ts`)
**Current:**
- `COINMARKETCAP_API_KEY` (keep as is - external service)
- `SEI_REST_URL` ✅
- `TELEGRAM_BOT_TOKEN` (keep as is - external service)
- `TELEGRAM_CHAT_ID` (keep as is - external service)
- `PRICE_CHECK_INTERVAL` (keep as is - generic setting)
- `PROPOSAL_CHECK_INTERVAL` (keep as is - generic setting)

## Required Changes

1. Update `src/swap.ts` configSchema and all references
2. Update `src/trade.ts` configSchema and all references  
3. Update `src/index.ts` to import all plugins
4. Remove simulation code from NFT plugin
5. Update character.ts (already completed)

## Final Environment Variables List
After standardization, users will need:

**SEI Blockchain:**
- `SEI_PRIVATE_KEY` - Used by swap and trading plugins
- `SEI_MNEMONIC` - Alternative to private key for governance
- `SEI_RPC_URL` - SEI network RPC endpoint
- `SEI_REST_URL` - SEI network REST endpoint
- `SEI_CHAIN_ID` - SEI chain identifier
- `SEI_ADDRESS_PREFIX` - Address prefix for SEI
- `SEI_SLIPPAGE_TOLERANCE` - Swap slippage tolerance
- `SEI_CITREX_ENVIRONMENT` - Trading environment (mainnet/testnet)
- `SEI_SUB_ACCOUNT_ID` - Trading sub-account ID

**External Services:**
- `COINMARKETCAP_API_KEY` - For price data
- `TELEGRAM_BOT_TOKEN` - For notifications
- `TELEGRAM_CHAT_ID` - Default chat for notifications

**NFT Specific:**
- `NFT_CONTRACT_ADDRESS` - NFT contract address
- `MARKETPLACE_CONTRACT_ADDRESS` - NFT marketplace contract