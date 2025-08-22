# 🤖 Simple SEI Mate Telegram Demo

This is a simplified, working version of SEI Mate for Telegram demonstrations.

## 🚀 Quick Setup

1. **Clone and switch to this branch:**
```bash
git clone https://github.com/davidpraise288-coder/sei-mate.git
cd sei-mate
git checkout simple-telegram-demo
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment:**
```bash
cp .env.telegram .env
```

4. **Edit `.env` with your values:**
```env
OPENAI_API_KEY=your_actual_openai_key
TELEGRAM_BOT_TOKEN=your_actual_telegram_bot_token
```

5. **Run the demo:**
```bash
npm start
```

## 💬 Demo Commands

Once your Telegram bot is running, try these commands:

### Check Balance
```
check balance
```
**Response:**
```
💰 Wallet Balance

🔗 Address: sei1demo123...

💎 Tokens:
• SEI: 125.50 (~$52.71)
• USDC: 2,450.75
• WETH: 0.0125 (~$31.25)

📊 Total: $3,125.80

🎯 Actions:
• "transfer 10 SEI to [address]"
• "swap 5 SEI to USDC"
```

### Transfer Tokens
```
transfer 10 SEI to sei1abc123def456
```
**Response:**
```
🔄 Transfer Confirmation

💸 Details:
• Amount: 10 SEI (~$4.20)
• To: sei1abc123def456
• Network: SEI Mainnet
• Gas: ~0.001 SEI

⚠️ Confirm with "yes" to proceed.
```

### Confirm Transfer
```
yes
```
**Response:**
```
✅ Transfer Completed!

🎉 Success:
• Transaction Hash: 0xabc123...
• Status: Confirmed
• Block: #12,345,678
• Gas Used: 21,000

💡 Your transfer has been processed successfully!
```

## 🎬 Perfect for Demo Videos

This simplified version:
- ✅ Works out of the box
- ✅ No complex dependencies
- ✅ Clear, formatted responses
- ✅ Professional looking output
- ✅ Confirmation flow demonstration
- ✅ Sample data for consistency

## 🔧 Troubleshooting

**Bot not responding?**
- Check your `TELEGRAM_BOT_TOKEN` is correct
- Make sure the bot is started with `/start` in Telegram
- Check the console for any error messages

**Need help with Telegram bot setup?**
1. Message @BotFather on Telegram
2. Create a new bot with `/newbot`
3. Copy the token to your `.env` file

## 📱 Demo Flow for Videos

1. Start with `check balance` to show wallet info
2. Try `transfer 5 SEI to sei1demo123` to show confirmation
3. Confirm with `yes` to show success
4. Show the professional formatting and emojis

This gives you a complete, working demo in under 2 minutes! 🎉