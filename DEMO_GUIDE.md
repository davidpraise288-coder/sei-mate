# 🎬 SEI Mate Demo Guide

This guide will help you create impressive demo videos for **SEI Mate** on Telegram and Discord, showcasing all the enhanced features with sample data.

## 🚀 Quick Start for Demo

### Prerequisites
- Node.js 18+ or Bun
- Demo environment variables (see below)
- Telegram Bot Token (for Telegram demo)
- Discord Webhook URL (for Discord demo)

### Demo Environment Setup

Create a `.env` file with demo configuration:

```env
# Demo Configuration
DEMO_MODE=true

# Database (Demo)
PGLITE_DATA_DIR=/tmp/demo-eliza/.elizadb

# AI Model (Choose one for demo)
OPENAI_API_KEY=your_openai_key_for_demo
# OPENROUTER_API_KEY=your_openrouter_key
# OLLAMA_API_ENDPOINT=http://localhost:11434

# SEI Demo Wallet (Use a testnet wallet for safety)
SEI_NETWORK=testnet
SEI_PRIVATE_KEY=your_demo_wallet_private_key_here

# Platform Integration
TELEGRAM_BOT_TOKEN=your_demo_telegram_bot_token
TELEGRAM_CHAT_ID=your_demo_chat_id
DISCORD_WEBHOOK_URL=your_demo_discord_webhook_url

# Demo Services (Optional - demo data will be used if not provided)
COINMARKETCAP_API_KEY=demo_cmc_key
```

### Launch Demo

```bash
# Clone and setup
git clone <your-repo>
cd sei-agent
git checkout demo

# Install dependencies
bun install

# Start demo
bun start
```

## 🎯 Demo Script Scenarios

### 1. 💰 Wallet Management Demo

**Commands to showcase:**

```
"What is my wallet balance?"
```
**Expected Response:**
```
💰 Wallet Balance Summary

🔗 Address: sei1abc123def456...

💎 Token Balances:
• SEI: 125.50 SEI (~$52.71)
• USDC: 2,450.75 USDC
• WETH: 0.0125 WETH (~$31.25)

📊 Portfolio Value: $3,125.80 USD

🎯 Quick Actions:
• Say "swap 10 SEI to USDC" to trade tokens
• Say "send 5 SEI to [address]" to transfer tokens
```

**Follow-up:**
```
"Send 10 SEI to sei1abc123def456ghi789"
```

### 2. 🔄 Token Swapping Demo

**Commands to showcase:**

```
"Swap 25 SEI to USDC"
```

**Expected Response:**
```
🔄 Swap Confirmation Required

💱 Swap Details:
• From: 25 SEI (~$10.50)
• To: ~23.75 USDC
• Rate: 1 SEI = 0.95 USDC
• Slippage: 1.0%
• Network: SEI Mainnet

⚠️ Please confirm: Are you sure you want to swap 25 SEI to USDC?

Reply with "yes" or "confirm" to proceed.
```

**Follow-up:**
```
"yes"
```

### 3. 📈 Trading Portfolio Demo

**Commands to showcase:**

```
"Show my trading portfolio"
```

**Expected Response:**
```
📈 Trading Portfolio Summary

💰 Account Balance:
• Total Balance: $5,420.75
• Available Margin: $3,250.50
• Total P&L: +285.50 USD
• Daily P&L: +45.25 USD

🎯 Open Positions:
• SEI-PERP LONG
  📊 Size: 1,250 | P&L: +212.50 USD
• BTC-PERP SHORT
  📊 Size: 0.05 | P&L: +62.50 USD

💡 Demo Note: Sample trading data for demonstration
```

**Follow-up:**
```
"Show market data"
```

### 4. 🏛️ Governance Demo

**Commands to showcase:**

```
"Show current governance proposals"
```

**Expected Response:**
```
🏛️ SEI Governance Proposals

🗳️ Proposal #42 - VOTING
📋 Title: SEI Network Upgrade v2.0
📊 Votes: 83.2% Yes (15,420,000 SEI)
⏰ End Time: 2/15/2025, 6:00:00 PM

🎯 Quick Actions:
• Say "vote yes on proposal 42" to cast your vote
• Say "delegate tokens to validator" to increase voting power

💡 Demo Note: Sample proposals for demonstration
```

**Follow-up:**
```
"Show my staking information"
```

### 5. 🔔 Notifications Demo

**Commands to showcase:**

```
"Show my active alerts"
```

**Expected Response:**
```
🔔 Active Alerts & Notifications

💰 Price Alerts:
🟢 ⬆️ SEI above $0.50
📊 Current: $0.4420
⏰ Created: 2 days ago

📬 Recent Notifications:
💰 SEI price increased 5.2% in the last hour
⏰ 1 hour ago

🎯 Quick Actions:
• Say "set price alert SEI above 0.50" to create new alert
• Say "notification settings" to manage preferences
```

**Follow-up:**
```
"Show notification settings"
```

## 🎥 Video Recording Tips

### For Telegram Demo:

1. **Setup:**
   - Use a clean Telegram account
   - Start a chat with your demo bot
   - Have good lighting and clear screen recording

2. **Demo Flow:**
   - Start with "What can you help me with?" to show overview
   - Demonstrate each feature category (wallet, swap, trading, governance, notifications)
   - Show confirmation flows and security features
   - Highlight demo notes to explain sample data

3. **Key Points to Emphasize:**
   - Security-first approach with confirmation prompts
   - Rich, formatted responses with emojis
   - Comprehensive feature set
   - Professional presentation

### For Discord Demo:

1. **Setup:**
   - Create a demo Discord server
   - Set up webhook integration
   - Test webhook delivery

2. **Demo Flow:**
   - Show webhook notifications
   - Demonstrate alert delivery
   - Show rich embed formatting

## 📊 Demo Data Overview

### Sample Wallet Data:
- **SEI Balance:** 125.50 SEI (~$52.71)
- **USDC Balance:** 2,450.75 USDC
- **WETH Balance:** 0.0125 WETH (~$31.25)
- **Total Portfolio:** $3,125.80 USD

### Sample Trading Data:
- **Total Balance:** $5,420.75
- **Open Positions:** SEI-PERP LONG, BTC-PERP SHORT, ETH-PERP LONG
- **Total P&L:** +$285.50
- **Daily P&L:** +$45.25

### Sample Governance Data:
- **Active Proposals:** 2 voting, 1 passed
- **Staking:** 1,250 SEI delegated across 3 validators
- **Rewards:** 15.75 SEI available

### Sample Alert Data:
- **Price Alerts:** SEI above $0.50, SEI below $0.35, BTC above $100k
- **Governance Alerts:** New proposals, voting reminders
- **Recent Notifications:** Price movements, proposal updates, staking rewards

## 🔧 Troubleshooting

### Common Issues:

1. **Bot Not Responding:**
   - Check environment variables
   - Verify API keys
   - Check network connectivity

2. **Demo Data Not Showing:**
   - Ensure DEMO_MODE=true in .env
   - Restart the application
   - Check plugin configurations

3. **Webhook Issues (Discord):**
   - Verify webhook URL format
   - Test webhook independently
   - Check Discord server permissions

## 🎬 Demo Script Template

### Opening (30 seconds):
"Hi everyone! I'm excited to show you SEI Mate, a comprehensive AI agent for the SEI blockchain that brings DeFi capabilities to mainstream platforms like Telegram and Discord."

### Feature Walkthrough (3-4 minutes):
1. **Wallet Management** (45 seconds)
2. **Token Swapping** (45 seconds)
3. **Trading Portfolio** (45 seconds)
4. **Governance** (45 seconds)
5. **Notifications** (30 seconds)

### Closing (30 seconds):
"SEI Mate makes complex DeFi operations as simple as sending a message, while maintaining enterprise-level security with confirmation prompts. It's perfect for the Consumer Agents Track because it truly brings blockchain to mainstream users."

## 🚀 Advanced Demo Features

### Multi-Platform Integration:
- Show the same commands working on both Telegram and Discord
- Demonstrate notification delivery across platforms
- Highlight consistent user experience

### Security Features:
- Always show confirmation prompts
- Explain the security-first approach
- Demonstrate how users stay in control

### Educational Value:
- Show how the agent explains blockchain concepts
- Demonstrate step-by-step guidance
- Highlight the educational aspects

## 📝 Demo Checklist

- [ ] Environment variables configured
- [ ] Bot/webhook tested and working
- [ ] Demo data loading correctly
- [ ] All major features tested
- [ ] Screen recording setup ready
- [ ] Script practiced and timed
- [ ] Backup plans for technical issues
- [ ] Demo environment isolated and safe

---

**Good luck with your demo! SEI Mate's comprehensive features and professional presentation will surely impress the hackathon judges.** 🏆