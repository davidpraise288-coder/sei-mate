# 🚀 SEI Mate - Comprehensive SEI Blockchain Agent

<div align="center">

![SEI Mate Banner](https://i.ibb.co/rRHRLJFb/SEI-MATE.png)

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
OPENAI_API_KEY=your_openai_key              # Option 1: OpenAI
OPENROUTER_API_KEY=your_openrouter_key      # Option 2: OpenRouter  
OLLAMA_API_ENDPOINT=http://localhost:11434  # Option 3: Local Ollama

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

### 📈 Trading
```
User: "Buy 10 SEI-PERP at market price"
SEI Mate: "Are you sure you want to place a BUY order for 10 SEI-PERP at market price (~$0.45)? Please confirm with 'yes' to proceed."
User: "yes"
SEI Mate: "📈 Order executed! Position opened: 10 SEI-PERP LONG at $0.45"
```

## 🎯 Complete List of Available Prompts & Commands

SEI Mate understands natural language and responds to a wide variety of prompts. Here's a comprehensive list of all available commands and their functionality:

### 🔄 **Token Swapping Commands**
**Plugin**: `plugin-sei-swap`

| Command | Example | Functionality |
|---------|---------|---------------|
| **Swap Tokens** | `"swap 100 SEI to USDC"` | Swaps SEI tokens for USDC using Symphony protocol |
| **Exchange Tokens** | `"exchange 50 SEI for USDT"` | Alternative syntax for token swapping |
| **Trade Tokens** | `"trade 25 SEI to USDC"` | Another way to initiate token swaps |
| **Convert Tokens** | `"convert 75 SEI to USDC"` | Token conversion functionality |

**Supported Tokens**: SEI, USDC, USDT, and other SEI-based tokens
**Protocol**: Symphony DEX
**Features**: Automatic slippage protection, balance validation, transaction confirmation

### 📈 **Perpetual Trading Commands**
**Plugin**: `plugin-sei-perpetual-trading`

| Command | Example | Functionality |
|---------|---------|---------------|
| **Buy Perpetual** | `"buy 10 ETH-PERP at market price"` | Opens long position in ETH perpetual |
| **Sell Perpetual** | `"sell 5 BTC-PERP at $45,000"` | Opens short position in BTC perpetual |
| **Long Position** | `"long 20 SEI-PERP at $0.45"` | Alternative syntax for buying perpetuals |
| **Short Position** | `"short 15 ETH-PERP at $3,200"` | Alternative syntax for selling perpetuals |
| **Check Positions** | `"show my positions"` | Displays all open perpetual positions with PnL |
| **Position Status** | `"check my positions"` | Alternative way to view positions |
| **Trading Balance** | `"show trading balance"` | Displays perpetual trading account balance |
| **Margin Balance** | `"check margin balance"` | Shows available margin and used margin |
| **Open Orders** | `"list open orders"` | Shows pending perpetual trading orders |
| **Deposit to Trading** | `"deposit 1000 SEI to trading account"` | Funds perpetual trading account |

**Supported Markets**: ETH-PERP, BTC-PERP, SEI-PERP, and other perpetual contracts
**Protocol**: Citrex
**Features**: Market/Limit orders, position management, margin trading, PnL tracking

### 🏛️ **Governance Commands**
**Plugin**: `plugin-sei-governance`

| Command | Example | Functionality |
|---------|---------|---------------|
| **Vote on Proposal** | `"vote yes on proposal #42"` | Casts vote on governance proposal |
| **Cast Vote** | `"vote no on proposal #15"` | Alternative voting syntax |
| **Governance Vote** | `"vote abstain on proposal #30"` | Votes with abstain option |
| **Proposal Vote** | `"vote veto on proposal #25"` | Votes with veto option |
| **List Proposals** | `"show governance proposals"` | Lists all active governance proposals |
| **Check Proposals** | `"list proposals"` | Alternative way to view proposals |
| **Proposal Details** | `"show proposal #42 details"` | Displays detailed proposal information |
| **List Validators** | `"show validators"` | Lists all SEI network validators |
| **Check Validators** | `"list validators"` | Alternative way to view validators |
| **Delegate Tokens** | `"delegate 1000 SEI to seivalidator123..."` | Delegates SEI to validator for staking |
| **Stake Tokens** | `"stake 500 SEI to validator456..."` | Alternative delegation syntax |

**Vote Options**: YES, NO, ABSTAIN, VETO
**Features**: Real-time proposal tracking, validator information, delegation management

### 🎨 **NFT Commands**
**Plugin**: `plugin-sei-nft`

| Command | Example | Functionality |
|---------|---------|---------------|
| **Mint NFT** | `"mint NFT name: My Artwork description: A beautiful digital piece"` | Creates and mints new NFT |
| **Create NFT** | `"create NFT name: My Collection description: Unique digital art"` | Alternative minting syntax |
| **New NFT** | `"new NFT name: My Masterpiece"` | Simplified NFT creation |
| **Sell NFT** | `"sell NFT #123 for 100 SEI"` | Lists NFT for sale on marketplace |
| **List NFT** | `"list NFT #456 for 50 SEI"` | Alternative selling syntax |
| **Buy NFT** | `"buy NFT #789 for 75 SEI"` | Purchases NFT from marketplace |
| **Purchase NFT** | `"purchase NFT #101 for 200 SEI"` | Alternative buying syntax |

**Features**: Custom metadata, marketplace integration, secure transactions
**Supported**: SEI NFT standard with marketplace functionality

### 🔔 **Notification Commands**
**Plugin**: `plugin-notification`

| Command | Example | Functionality |
|---------|---------|---------------|
| **Price Alert** | `"alert me when SEI reaches $0.005"` | Sets price alert notification |
| **Price Notification** | `"notify me when SEI goes above $0.006"` | Alternative alert syntax |
| **SEI Price Alert** | `"alert me when SEI drops below $0.004"` | Sets lower price threshold |
| **Governance Alert** | `"notify me of new governance proposals"` | Sets proposal notification |
| **Proposal Alert** | `"alert me when proposals are submitted"` | Alternative proposal notification |

**Features**: Multi-platform delivery (Telegram, Discord), customizable thresholds
**Supported**: Price alerts, governance proposal notifications

### 🤖 **AI-Powered Commands**
**Plugin**: `plugin-proposal-summary`

| Command | Example | Functionality |
|---------|---------|---------------|
| **Summarize Proposal** | `"summarize proposal #42"` | AI-generated proposal summary |
| **Proposal Summary** | `"summary of proposal #15"` | Alternative summary syntax |
| **AI Summary** | `"AI summary for proposal #30"` | AI-powered proposal analysis |

**AI Providers**: OpenAI GPT-4, OpenRouter Claude
**Features**: Intelligent analysis, key points extraction, risk assessment

### 💬 **General Conversation Commands**

| Command | Example | Functionality |
|---------|---------|---------------|
| **Help** | `"help"` or `"what can you do?"` | Shows available commands and features |
| **Status** | `"status"` or `"how are you?"` | Checks agent status and connectivity |
| **Balance Check** | `"check my SEI balance"` | Shows wallet balance (if configured) |
| **Network Info** | `"SEI network status"` | Displays network information |
| **Price Check** | `"what's the price of SEI?"` | Shows current SEI price |

### 🔒 **Security Features**

**Confirmation Required for All Major Actions:**
- **Token Swaps**: Requires explicit "yes" confirmation
- **Trading Orders**: Must confirm order details before execution
- **NFT Operations**: Confirmation needed for minting, buying, selling
- **Governance Actions**: Vote confirmation required
- **Delegation**: Staking confirmation mandatory
- **Deposits**: Trading account funding confirmation

**Example Confirmation Flow:**
```
User: "swap 100 SEI to USDC"
SEI Mate: "Are you sure you want to swap 100 SEI to USDC? Please confirm with 'yes' to proceed."
User: "yes"
SEI Mate: [Executes the swap]
```

### 📱 **Platform Support**

**Telegram**: Full-featured bot with inline keyboards and rich formatting
**Discord**: Rich embeds, slash commands, and webhook integration
**Future**: Twitter/X integration planned

### 🎯 **Command Patterns**

**General Format**: `[Action] [Amount/Details] [Asset/Parameter] [Additional Options]`

**Examples:**
- `swap 100 SEI to USDC`
- `buy 10 ETH-PERP at market price`
- `vote yes on proposal #42`
- `delegate 1000 SEI to validator123...`
- `mint NFT name: My Artwork description: Beautiful piece`
- `alert me when SEI reaches $0.005`

**Natural Language Support**: SEI Mate understands various phrasings and synonyms for the same commands, making interaction intuitive and user-friendly.

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
