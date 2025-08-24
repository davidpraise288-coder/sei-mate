# 🚀 SEI Mate - Comprehensive SEI Blockchain Agent

<div align="center">

![SEI Mate Banner](https://elizaos.github.io/eliza-avatars/Eliza/portrait.png)

**🏆 AI Acceleration Hackathon 2025 - Consumer Agents Track**  
*Powered by AIDN - Building AI Agents for Mainstream Consumer Platforms*

[![ElizaOS](https://img.shields.io/badge/Built%20with-ElizaOS-blue)](https://github.com/elizaOS/eliza)
[![SEI Network](https://img.shields.io/badge/Blockchain-SEI-red)](https://sei.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

</div>

## 🎯 Project Overview

**SEI Mate** is a revolutionary AI agent built on [ElizaOS](https://github.com/elizaOS/eliza) that brings comprehensive SEI blockchain capabilities to mainstream consumer platforms. Designed for the **Consumer Agents Track** of the AI Acceleration Hackathon 2025, SEI Mate transforms complex blockchain operations into simple, conversational interactions across popular platforms like Telegram, Discord, and more.

### 🎪 Hackathon Context
This project was developed for the **AI Acceleration Hackathon 2025 - Consumer Agents Track (Powered by AIDN)** with a **$60,000 prize pool**. The track focuses on building AI agents that bring blockchain capabilities to mainstream consumer platforms, making Web3 accessible to everyday users through familiar interfaces.

## ✨ Key Features

### 🔄 **Token Swapping**
- Seamless token swaps using Symphony protocol
- Real-time price quotes and slippage protection
- Support for all SEI-based tokens
- Confirmation-based security for all transactions

### 🏛️ **Governance Participation**
- Vote on SEI governance proposals
- Delegate tokens to validators
- Real-time proposal tracking and notifications
- Comprehensive governance analytics

### 🤖 **AI-Powered Proposal Summarization**
- Intelligent proposal summaries using OpenAI or OpenRouter
- Automatic detection of key points and implications
- Voting recommendations based on proposal analysis
- Supports both OpenAI and OpenRouter APIs

### 🎯 **Autonomous Goal-Seeking**
- Standing orders for recurring blockchain operations
- Natural language setup: "Buy $10 of SEI every Friday"
- DCA (Dollar Cost Averaging) strategies with custom allocations
- Automated staking and delegation schedules
- Portfolio rebalancing with custom targets and thresholds
- Limit orders with price triggers (above/below conditions)
- Auto-voting on governance proposals with customizable strategies
- Background execution with safety limits and notifications

### 📈 **Perpetual Trading**
- Advanced trading on Citrex protocol
- Market and limit order support
- Position management and monitoring
- Risk management tools

### 🔔 **Smart Notifications**
- Price alerts with customizable thresholds
- Governance proposal notifications
- Multi-platform delivery (Telegram, Discord)
- Real-time market updates

### 💬 **Multi-Platform Support**
- **Telegram**: Full-featured bot with inline keyboards
- **Discord**: Rich embeds and slash commands
- **Future**: Twitter/X integration planned

## 🏗️ Architecture & Innovation

### 🔌 **Modular Plugin System**
SEI Mate is built with a revolutionary modular architecture featuring **reusable plugins** that will be published to the ElizaOS ecosystem:

```typescript
// Modular Plugin Architecture
├── 🔄 Swap Plugin       - Token swapping capabilities
├── 🏛️ Governance Plugin - DAO participation tools
├── 🤖 Summary Plugin    - AI-powered proposal summarization
├── 🎯 Autonomous Plugin - Goal-seeking & standing orders
├── 📈 Trading Plugin    - Perpetual trading features
├── 🔔 Notification Plugin - Multi-platform alerts
└── 🎨 Character Plugin  - Conversational AI personality
```

### 🛡️ **Security-First Design**
- **Confirmation-based transactions**: Every major operation requires explicit user confirmation
- **Private key security**: Secure key management with environment-based configuration
- **Input validation**: Comprehensive validation for all user inputs and blockchain interactions
- **Error handling**: Graceful error handling with user-friendly messages

### 🧠 **AI-Powered Intelligence**
- **Natural Language Processing**: Understands complex blockchain requests in plain English
- **Context Awareness**: Maintains conversation context for seamless interactions
- **Smart Suggestions**: Proactive recommendations based on market conditions
- **Educational Mode**: Explains blockchain concepts to newcomers

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or Bun
- SEI wallet with private key
- Platform-specific tokens (Telegram bot token, Discord webhook, etc.)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/sei-agent.git
cd sei-agent

# Install dependencies
npm install
# or
bun install

# Copy environment template
cp .env.example .env

# Build the project
npm run build
# or
bun run build

# Start the agent
npm start
# or
bun start
```

### Environment Configuration

Create a `.env` file with your configuration:

```env
# Database
PGLITE_DATA_DIR=/workspace/eliza/sei-agent/.eliza/.elizadb

# Choose your AI model provider
OPENAI_API_KEY=your_openai_key              # Option 1: OpenAI (also enables proposal summarization)
OPENROUTER_API_KEY=your_openrouter_key      # Option 2: OpenRouter (also enables proposal summarization)
OLLAMA_API_ENDPOINT=http://localhost:11434  # Option 3: Local Ollama

# Autonomous Features
ENABLE_AUTONOMOUS_MODE=true                 # Enable background execution of standing orders
AUTONOMOUS_CHECK_INTERVAL=60000             # Check interval for autonomous tasks (ms)
MAX_DAILY_SPEND=1000                        # Daily spending limit for safety (USD)

# SEI Blockchain (Required)
SEI_NETWORK=mainnet
SEI_PRIVATE_KEY=your_64_character_hex_private_key

# Platform Integration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_default_chat_id
DISCORD_WEBHOOK_URL=your_discord_webhook_url

# Services
COINMARKETCAP_API_KEY=your_cmc_api_key
```

## 💡 Usage Examples

### 🔄 Token Swapping
```
User: "Swap 100 SEI to USDC"
SEI Mate: "Are you sure you want to swap 100 SEI to USDC? Current rate: 1 SEI = 0.45 USDC. Please confirm with 'yes' to proceed."
User: "yes"
SEI Mate: "✅ Swap completed! Transaction: 0xabc123... Gas used: 150,000"
```

### 🏛️ Governance Voting
```
User: "Vote yes on proposal 42"
SEI Mate: "Are you sure you want to vote YES on proposal #42 'SEI Network Upgrade v2.0'? Please confirm with 'yes' to proceed."
User: "yes"
SEI Mate: "🗳️ Vote submitted successfully! Your vote has been recorded on-chain."
```

### 🤖 AI Proposal Summarization
```
User: "Summarize proposal #42"
SEI Mate: "🤖 **AI Summary for Proposal #42**
*Powered by OpenAI GPT-4*

**Proposal Overview:**
This proposal aims to increase the block size limit on the SEI network from 1MB to 2MB to improve transaction throughput and reduce fees...

**Key Benefits:**
- Higher TPS capacity
- Lower transaction costs  
- Better user experience

**Potential Risks:**
- Increased node requirements
- Network centralization concerns

**Recommendation:** Consider voting YES if you prioritize network scalability.

💡 *This summary was generated by AI. Please review the full proposal details before making voting decisions.*"
```

### 🎯 Autonomous Goal-Seeking
```
User: "Buy $10 worth of SEI every Friday and stake it automatically"
SEI Mate: "🤖 **Standing Order Created Successfully!**

📋 **Order ID:** abc123
📝 **Description:** Buy $10 of SEI every Friday  
⏰ **Frequency:** weekly
🔄 **Status:** Active

💰 **Amount:** $10
🔔 **Notifications:** Enabled

✅ Your autonomous order is now active and will execute automatically in the background.

💡 *Use 'list my orders' to view all standing orders or 'cancel abc123' to stop this order.*"
```

### 📊 DCA Strategy Management
```
User: "DCA $100 into SEI and USDC every month"
SEI Mate: "🤖 **Standing Order Created Successfully!**

📋 **Order ID:** def456
📝 **Description:** DCA $100 every monthly
⏰ **Frequency:** monthly  
🔄 **Status:** Active

💰 **Amount:** $100
🔔 **Notifications:** Enabled

✅ Your autonomous DCA strategy is now running! I'll automatically invest $70 in SEI and $30 in USDC each month."
```

### 📈 Trading
```
User: "Buy 10 SEI-PERP at market price"
SEI Mate: "Are you sure you want to place a BUY order for 10 SEI-PERP at market price (~$0.45)? Please confirm with 'yes' to proceed."
User: "yes"
SEI Mate: "📈 Order executed! Position opened: 10 SEI-PERP LONG at $0.45"
```

## 🎯 Autonomous Goal-Seeking Features

SEI Mate's autonomous capabilities enable users to set up standing orders that execute automatically in the background, making blockchain participation as easy as setting up a recurring payment.

### 🔄 **Supported Standing Orders**

#### **Recurring Purchases**
- `"Buy $10 worth of SEI every Friday"`
- `"Purchase 100 USDC every Monday"`
- Custom amounts and frequencies (daily, weekly, monthly, specific days)

#### **DCA Strategies**
- `"DCA $100 every month into SEI and USDC"`
- `"Dollar cost average $50 weekly with 80% SEI, 20% USDC"`
- Customizable asset allocations and rebalancing

#### **Auto Staking**
- `"Stake 50 SEI every week"`
- `"Delegate 100 SEI to validator xyz every month"`
- Automated compounding of staking rewards

#### **Auto Governance**
- `"Auto vote yes on all proposals"`
- `"Automatically vote abstain on governance proposals"`
- `"Delegate my voting power to address xyz"`

#### **Portfolio Management**
- `"Rebalance my portfolio to 70% SEI, 30% USDC when deviation > 10%"`
- `"Sell 100 SEI when price goes above $1.50"`
- `"Buy 200 SEI if price drops below $0.30"`

#### **Limit Orders**
- `"Buy 1000 SEI when price goes below $0.40"`
- `"Sell 500 SEI if price goes above $1.00"`
- Price-triggered execution with customizable conditions

### 🛡️ **Safety Mechanisms**

#### **Spending Limits**
- Daily spending caps (configurable)
- Total order limits per standing order
- Maximum execution counts per order

#### **User Controls**
- Pause/resume orders anytime
- Cancel orders permanently
- Real-time notifications for all executions
- Complete execution history and audit trail

#### **Risk Management**
- Confirmation required for large orders
- Portfolio deviation monitoring
- Automatic order suspension on failures
- Emergency stop capabilities

### 📊 **Order Management**

#### **Natural Language Setup**
```
User: "Buy $25 worth of SEI every Friday and stake it automatically"
SEI Mate: Creates standing order with:
- Type: Recurring Buy + Auto Stake
- Amount: $25 USD equivalent
- Frequency: Weekly (every Friday)
- Auto-execution: Enabled
- Notifications: Enabled
```

#### **Order Status Monitoring**
```
User: "List my orders"
SEI Mate: Shows all active, paused, and completed orders with:
- Order descriptions and IDs
- Next execution times
- Total spent and execution counts
- Current status and performance
```

#### **Flexible Management**
```
User: "Pause order abc123"
User: "Resume order abc123" 
User: "Cancel order abc123"
User: "Update order abc123 to $50"
```

### ⚡ **Background Execution**

The autonomous service runs continuously in the background:
- **Check Interval**: Configurable (default: 1 minute)
- **Execution Window**: Precise timing for scheduled operations
- **Error Handling**: Automatic retry with exponential backoff
- **Notifications**: Real-time updates on all executions
- **Persistence**: Orders survive system restarts

### 🔔 **Smart Notifications**

Users receive notifications for:
- ✅ Successful order executions
- ❌ Failed executions with error details
- 📊 Weekly/monthly execution summaries
- ⚠️ Safety limit warnings
- 🔄 Order status changes

## 🏆 Hackathon Advantages

### 🎯 **Perfect Fit for Consumer Agents Track**
- **Mainstream Accessibility**: Transforms complex DeFi operations into simple chat commands
- **Multi-Platform Reach**: Native support for popular consumer platforms (Telegram, Discord)
- **Educational Value**: Teaches users about blockchain while they interact
- **Real-World Utility**: Solves actual problems in DeFi accessibility

### 🔧 **Technical Excellence**
- **Modular Architecture**: Reusable plugins that benefit the entire ElizaOS ecosystem
- **Production Ready**: Fully functional on mainnet with comprehensive error handling
- **Scalable Design**: Easy to extend with new features and platforms
- **Open Source**: Contributing back to the community with reusable components

### 🌟 **Innovation Highlights**
- **First Comprehensive SEI Agent**: Complete DeFi suite in a conversational interface
- **Security-First Approach**: Industry-leading confirmation system for blockchain operations
- **Plugin Ecosystem**: Will publish reusable plugins to ElizaOS marketplace
- **Educational Integration**: Makes DeFi accessible to non-technical users

## 🔮 Future Roadmap

### 🐦 **Twitter/X Integration**
- Native Twitter bot with thread support
- Real-time market updates and alerts
- Social trading features
- Community governance discussions

### 🎨 **Enhanced Features**
- **Portfolio Analytics**: Comprehensive portfolio tracking and insights
- **Advanced Trading**: Options, futures, and advanced order types
- **Social Features**: Copy trading and social signals
- **Mobile App**: Native mobile application with push notifications

### 🌐 **Multi-Chain Expansion**
- **Ethereum Integration**: Bridge operations and cross-chain swaps
- **Cosmos Ecosystem**: IBC transfers and multi-chain governance
- **Layer 2 Solutions**: Arbitrum, Optimism, and Polygon support

### 🤖 **AI Enhancements**
- **Predictive Analytics**: AI-powered market predictions and insights
- **Automated Strategies**: Smart trading bots and DCA strategies
- **Risk Management**: AI-driven risk assessment and portfolio optimization

## 🛠️ Technical Stack

- **Framework**: [ElizaOS](https://github.com/elizaOS/eliza) - Web3-native AI agent framework
- **Language**: TypeScript with comprehensive type safety
- **Blockchain**: SEI Network with Symphony DEX and Citrex perpetuals
- **AI Models**: OpenAI, OpenRouter, or local Ollama support
- **Database**: PGLite for efficient local storage
- **Platforms**: Telegram, Discord (Twitter/X coming soon)

## 🧪 Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run specific test categories
npm run test:integration
npm run test:plugins
npm run test:models

# Run with coverage
npm run test:coverage
```

## 📖 Documentation

- [Plugin Development Guide](./docs/plugin-development.md)
- [API Reference](./docs/api-reference.md)
- [Deployment Guide](./docs/deployment.md)
- [Security Best Practices](./docs/security.md)

## 🤝 Contributing

We welcome contributions from the community! SEI Mate is designed to be extensible and community-driven.

### Development Setup
```bash
# Fork the repository
git clone https://github.com/yourusername/sei-agent.git
cd sei-agent

# Create a feature branch
git checkout -b feature/amazing-feature

# Install dependencies
bun install

# Make your changes and test
bun test

# Submit a pull request
```

### Plugin Development
Interested in creating plugins for the ElizaOS ecosystem? Check out our plugin development guide and contribute to the growing ecosystem of reusable AI agent components.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[ElizaOS Team](https://github.com/elizaOS/eliza)** - For creating an amazing AI agent framework
- **[SEI Network](https://sei.io)** - For building the fastest blockchain for trading
- **AI Acceleration Hackathon** - For providing the platform to showcase innovation
- **AIDN** - For powering the Consumer Agents Track

## 🔗 Links

- **[Live Demo](https://t.me/YourSeiMateBot)** - Try SEI Mate on Telegram
- **[ElizaOS](https://github.com/elizaOS/eliza)** - The AI agent framework powering SEI Mate
- **[SEI Network](https://sei.io)** - The blockchain powering our DeFi operations
- **[Documentation](./docs/)** - Comprehensive guides and API reference

---

<div align="center">

**Built with ❤️ for the AI Acceleration Hackathon 2025**

*Making DeFi accessible to everyone, one conversation at a time.*

</div>
