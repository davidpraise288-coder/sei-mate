# Confirmation System for Sei Mate Agent

## Overview

The Sei Mate agent now includes a comprehensive confirmation system that requires user approval before executing major blockchain actions. This ensures user safety and prevents accidental transactions.

## Actions Requiring Confirmation

The following major actions require explicit user confirmation before execution:

### 1. Token Swaps (SWAP_SEI)
- **Trigger**: User requests to swap tokens
- **Confirmation Message**: "Are you sure you want to swap [amount] [from_token] to [to_token]?"
- **Example**: "Are you sure you want to swap 10 SEI to USDC? Please confirm with 'yes' to proceed."

### 2. Trading Orders (PLACE_PERPETUAL_ORDER)
- **Trigger**: User requests to place buy/sell orders
- **Confirmation Message**: "Are you sure you want to place a [BUY/SELL] order for [quantity] [symbol] at $[price]?"
- **Example**: "Are you sure you want to place a BUY order for 1 ETHPERP at $3000? Please confirm with 'yes' to proceed."

### 3. NFT Minting (MINT_NFT)
- **Trigger**: User requests to mint an NFT
- **Confirmation Message**: "Are you sure you want to mint an NFT called '[name]' with description '[description]'?"
- **Example**: "Are you sure you want to mint an NFT called 'My Artwork' with description 'A beautiful digital piece'? Please confirm with 'yes' to proceed."

### 4. NFT Selling (SELL_NFT)
- **Trigger**: User requests to sell an NFT
- **Confirmation Message**: "Are you sure you want to sell NFT #[token_id] for [price] SEI?"
- **Example**: "Are you sure you want to sell NFT #123 for 50 SEI? Please confirm with 'yes' to proceed."

### 5. NFT Buying (BUY_NFT)
- **Trigger**: User requests to buy an NFT
- **Confirmation Message**: "Are you sure you want to buy NFT #[token_id] for [price] SEI?"
- **Example**: "Are you sure you want to buy NFT #456 for 25 SEI? Please confirm with 'yes' to proceed."

### 6. Governance Voting (VOTE_ON_PROPOSAL)
- **Trigger**: User requests to vote on governance proposals
- **Confirmation Message**: "Are you sure you want to vote [YES/NO/ABSTAIN/VETO] on proposal #[proposal_id]?"
- **Example**: "Are you sure you want to vote YES on proposal #42? Please confirm with 'yes' to proceed."

### 7. Token Delegation (DELEGATE_TOKENS)
- **Trigger**: User requests to delegate tokens to validators
- **Confirmation Message**: "Are you sure you want to delegate [amount] SEI to validator [address]?"
- **Example**: "Are you sure you want to delegate 100 SEI to validator sei1abc...? Please confirm with 'yes' to proceed."

### 8. Deposits (DEPOSIT)
- **Trigger**: User requests to deposit funds to trading account
- **Confirmation Message**: "Are you sure you want to deposit [amount] SEI to your trading account?"
- **Example**: "Are you sure you want to deposit 50 SEI to your trading account? Please confirm with 'yes' to proceed."

## Confirmation Process

### Step 1: User Request
User makes a request for any of the major actions listed above.

### Step 2: Confirmation Prompt
The agent responds with a confirmation message that includes:
- The specific action being requested
- All relevant details (amounts, tokens, prices, addresses, etc.)
- Clear instruction to confirm with 'yes'

### Step 3: User Confirmation
User must respond with an affirmative response such as:
- "yes"
- "confirm"
- "proceed"
- "ok"
- "sure"

### Step 4: Action Execution
Only after receiving explicit confirmation, the agent executes the requested action.

## Implementation Details

### Character Configuration
The confirmation system is implemented in the character configuration (`src/character.ts`) through:

1. **System Prompt**: Contains detailed instructions for confirmation requirements
2. **Message Examples**: Includes examples of confirmation flows
3. **Style Guidelines**: Emphasizes the importance of confirmation
4. **Topics**: Includes confirmation-related topics

### Key Features

- **Specific Details**: All confirmation messages include exact amounts, tokens, prices, and other relevant details
- **Clear Instructions**: Users are explicitly told how to confirm (e.g., "Please confirm with 'yes' to proceed")
- **Safety First**: Actions are only executed after explicit confirmation
- **Cancellation Support**: Users can cancel by saying "no", "cancel", or not confirming

## Example Conversation Flow

```
User: "swap 10 SEI to USDC"
Agent: "Are you sure you want to swap 10 SEI to USDC? Please confirm with 'yes' to proceed."
User: "yes"
Agent: "✅ Successfully swapped 10.0 SEI to 9.5 USDC\n\n🔗 Transaction: 0x1234..."
```

## Benefits

1. **User Safety**: Prevents accidental transactions
2. **Transparency**: Users see exactly what will happen before confirmation
3. **Control**: Users maintain full control over their blockchain actions
4. **Education**: Helps users understand what they're about to do
5. **Trust**: Builds confidence in the agent's reliability

## Testing

The confirmation system is thoroughly tested through:
- Character configuration tests
- Message example validation
- Style guideline verification
- Topic coverage checks

All tests can be run with: `bun test src/__tests__/character.test.ts`