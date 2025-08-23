# 🤖 AI Provider Integration Guide

SEI Mate supports **three powerful AI providers** to give users maximum flexibility and access to the best models available. This guide covers setup, configuration, and best practices for each provider.

## 📋 Overview

SEI Mate integrates with:
- **OpenAI** - Industry-leading GPT models (GPT-4, GPT-3.5-turbo)
- **Anthropic** - Advanced Claude models (Claude-3-Sonnet, Claude-3-Haiku)  
- **OpenRouter** - Access to 200+ models from multiple providers

### 🎯 **Key Benefits**
- **Choice**: Pick your preferred AI provider
- **Fallback**: Automatic failover if one provider is down
- **Cost Optimization**: Switch to cheaper models when needed
- **Performance**: Access to the latest and best models
- **Reliability**: Multiple providers ensure 99.9% uptime

---

## 🔧 Quick Setup

### 1. **Choose Your Provider(s)**

You can use **any combination** of the three providers:

```bash
# Option 1: OpenAI only
export OPENAI_API_KEY=sk-your-openai-key-here

# Option 2: Anthropic only  
export ANTHROPIC_API_KEY=your-anthropic-key-here

# Option 3: OpenRouter only
export OPENROUTER_API_KEY=your-openrouter-key-here

# Option 4: All providers (recommended)
export OPENAI_API_KEY=sk-your-openai-key-here
export ANTHROPIC_API_KEY=your-anthropic-key-here
export OPENROUTER_API_KEY=your-openrouter-key-here
```

### 2. **Start SEI Mate**

```bash
# SEI Mate will automatically detect and use your configured providers
npm start
```

That's it! SEI Mate will work with whatever providers you have configured.

---

## 🎮 Provider Details

### 🤖 **OpenAI**

**Best for**: General use, proven reliability, extensive ecosystem

#### **Setup**
1. Get API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Set environment variable:
   ```bash
   export OPENAI_API_KEY=sk-your-key-here
   ```

#### **Available Models**
- `gpt-4` (default) - Best quality, higher cost
- `gpt-3.5-turbo` - Fast, cost-effective

#### **Configuration**
```bash
# Optional: Specify model
export OPENAI_DEFAULT_MODEL=gpt-4

# For cost savings:
export OPENAI_DEFAULT_MODEL=gpt-3.5-turbo
```

#### **Pricing** (approximate)
- GPT-4: $0.03/1k input tokens, $0.06/1k output tokens
- GPT-3.5-turbo: $0.001/1k input tokens, $0.002/1k output tokens

---

### 🧠 **Anthropic**

**Best for**: Analysis, reasoning, safety-focused responses

#### **Setup**
1. Get API key from [Anthropic Console](https://console.anthropic.com/)
2. Set environment variable:
   ```bash
   export ANTHROPIC_API_KEY=your-key-here
   ```

#### **Available Models**
- `claude-3-sonnet-20240229` (default) - Balanced performance
- `claude-3-haiku-20240307` - Fastest, most cost-effective

#### **Configuration**
```bash
# Optional: Specify model
export ANTHROPIC_DEFAULT_MODEL=claude-3-sonnet-20240229

# For speed/cost:
export ANTHROPIC_DEFAULT_MODEL=claude-3-haiku-20240307
```

#### **Pricing** (approximate)
- Claude-3-Sonnet: $0.003/1k input tokens, $0.015/1k output tokens
- Claude-3-Haiku: $0.00025/1k input tokens, $0.00125/1k output tokens

---

### 🌐 **OpenRouter**

**Best for**: Access to latest models, flexibility, cost optimization

#### **Setup**
1. Get API key from [OpenRouter](https://openrouter.ai/keys)
2. Set environment variable:
   ```bash
   export OPENROUTER_API_KEY=your-key-here
   ```

#### **Available Models** (200+ options including)
- `anthropic/claude-3.5-sonnet` (default) - Latest Claude model
- `openai/gpt-4` - GPT-4 via OpenRouter
- `meta-llama/llama-3-70b-instruct` - Open source alternative
- `google/gemini-pro` - Google's model
- `mistralai/mixtral-8x7b-instruct` - Mistral model

#### **Configuration**
```bash
# Default (recommended):
export OPENROUTER_DEFAULT_MODEL=anthropic/claude-3.5-sonnet

# For latest GPT-4:
export OPENROUTER_DEFAULT_MODEL=openai/gpt-4

# For cost savings:
export OPENROUTER_DEFAULT_MODEL=meta-llama/llama-3-70b-instruct
```

#### **Pricing**
- **Variable** - Each model has different pricing
- **Often cheaper** than direct API access
- **Credits system** - Buy credits, use across models
- See [OpenRouter Pricing](https://openrouter.ai/models) for details

---

## ⚙️ Advanced Configuration

### 🔄 **Provider Priority**

SEI Mate tries providers in this order: **OpenAI → Anthropic → OpenRouter**

To change the order:
```bash
# Use OpenRouter first
export PREFERRED_AI_PROVIDER=openrouter

# Use Anthropic first  
export PREFERRED_AI_PROVIDER=anthropic
```

### 🛡️ **Fallback System**

When a provider fails, SEI Mate automatically:
1. Tries the next available provider
2. Logs the error for debugging
3. Continues with a working provider
4. Falls back to static responses if all fail

### 📊 **Model Selection by Use Case**

```bash
# For governance analysis (accuracy critical)
export OPENAI_DEFAULT_MODEL=gpt-4
export ANTHROPIC_DEFAULT_MODEL=claude-3-sonnet-20240229
export OPENROUTER_DEFAULT_MODEL=anthropic/claude-3.5-sonnet

# For intent parsing (speed important)
export OPENAI_DEFAULT_MODEL=gpt-3.5-turbo
export ANTHROPIC_DEFAULT_MODEL=claude-3-haiku-20240307
export OPENROUTER_DEFAULT_MODEL=meta-llama/llama-3-70b-instruct

# For cost optimization
export OPENAI_DEFAULT_MODEL=gpt-3.5-turbo
export ANTHROPIC_DEFAULT_MODEL=claude-3-haiku-20240307
export OPENROUTER_DEFAULT_MODEL=meta-llama/llama-3-70b-instruct
```

---

## 🎯 **Recommended Configurations**

### 💎 **Premium Setup** (Best Quality)
```bash
export OPENAI_API_KEY=sk-your-key
export ANTHROPIC_API_KEY=your-key  
export OPENROUTER_API_KEY=your-key

export OPENAI_DEFAULT_MODEL=gpt-4
export ANTHROPIC_DEFAULT_MODEL=claude-3-sonnet-20240229
export OPENROUTER_DEFAULT_MODEL=anthropic/claude-3.5-sonnet
```

### ⚡ **Balanced Setup** (Good Quality + Speed)
```bash
export OPENAI_API_KEY=sk-your-key
export OPENROUTER_API_KEY=your-key

export OPENAI_DEFAULT_MODEL=gpt-3.5-turbo
export OPENROUTER_DEFAULT_MODEL=anthropic/claude-3.5-sonnet
```

### 💰 **Budget Setup** (Cost Optimized)
```bash
export OPENROUTER_API_KEY=your-key

export OPENROUTER_DEFAULT_MODEL=meta-llama/llama-3-70b-instruct
export PREFERRED_AI_PROVIDER=openrouter
```

### 🚀 **Cutting Edge Setup** (Latest Models)
```bash
export OPENROUTER_API_KEY=your-key
export ANTHROPIC_API_KEY=your-key

export OPENROUTER_DEFAULT_MODEL=anthropic/claude-3.5-sonnet
export ANTHROPIC_DEFAULT_MODEL=claude-3-sonnet-20240229
export PREFERRED_AI_PROVIDER=openrouter
```

---

## 🔍 **Monitoring & Debugging**

### **Check Provider Status**
SEI Mate logs which providers are available at startup:
```
✅ AI Provider Status: OpenAI, Anthropic, OpenRouter available
🎯 Primary provider: OpenAI
🔄 Fallback order: OpenAI → Anthropic → OpenRouter
```

### **Debug AI Calls**
Set debug mode to see AI provider details:
```bash
export DEBUG_MODE=true
export VERBOSE_LOGGING=true
```

### **Monitor Costs**
- **OpenAI**: Check usage at [OpenAI Usage Dashboard](https://platform.openai.com/usage)
- **Anthropic**: Monitor at [Anthropic Console](https://console.anthropic.com/)
- **OpenRouter**: View credits at [OpenRouter Dashboard](https://openrouter.ai/activity)

---

## 🎨 **Use Cases by Provider**

### **OpenAI** 📊
- **Best for**: General conversation, well-tested use cases
- **Use when**: You need proven reliability
- **Governance**: ✅ Excellent analysis
- **Intent parsing**: ✅ Very good understanding
- **Trading logic**: ✅ Reliable execution

### **Anthropic** 🧠  
- **Best for**: Complex analysis, safety-critical decisions
- **Use when**: You need careful, nuanced responses
- **Governance**: ✅ Outstanding analysis
- **Intent parsing**: ✅ Excellent understanding  
- **Trading logic**: ✅ Conservative, safe approaches

### **OpenRouter** 🌐
- **Best for**: Access to cutting-edge models, cost optimization
- **Use when**: You want the latest models or best prices
- **Governance**: ✅ Access to Claude-3.5-Sonnet
- **Intent parsing**: ✅ Many model options
- **Trading logic**: ✅ Flexible model selection

---

## 🚨 **Troubleshooting**

### **Common Issues**

#### **"No AI providers available"**
- Check your API keys are set correctly
- Verify your API keys have sufficient credits
- Test connectivity: `curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models`

#### **"Provider failed with 401 error"**
- Invalid API key - check the key is correct
- API key might be expired or deactivated

#### **"Provider failed with 429 error"**  
- Rate limit exceeded - wait a moment and try again
- Consider upgrading your API plan

#### **"Provider failed with timeout"**
- Network connectivity issue
- Try again or switch providers

### **Performance Issues**
- Use faster models (GPT-3.5-turbo, Claude-3-Haiku)
- Set `PREFERRED_AI_PROVIDER=openrouter` with a fast model
- Reduce token limits in configuration

---

## 📚 **Best Practices**

### **🔒 Security**
- Store API keys in environment variables, never in code
- Use different keys for development and production
- Regularly rotate API keys
- Monitor usage for unexpected spikes

### **💰 Cost Management** 
- Start with cheaper models and upgrade if needed
- Use OpenRouter for cost comparison across providers
- Set usage alerts in provider dashboards
- Monitor token usage in logs

### **⚡ Performance**
- Configure multiple providers for redundancy
- Use appropriate model sizes for your use case
- Test different providers for your specific tasks
- Monitor response times and adjust accordingly

### **🎯 Quality**
- Test each provider with your specific prompts
- Use premium models for critical decisions
- Have fallbacks for safety-critical operations
- Log AI responses for quality monitoring

---

## 🎉 **Conclusion**

SEI Mate's multi-provider AI integration gives you:

✅ **Maximum Flexibility** - Choose your preferred AI provider  
✅ **Best Performance** - Access to top models from multiple companies  
✅ **Cost Control** - Switch providers based on pricing  
✅ **Reliability** - Automatic failover ensures 99.9% uptime  
✅ **Future-Proof** - Easy to add new providers as they emerge  

**Start with any provider and upgrade to multiple providers as needed. SEI Mate adapts to your configuration automatically!**

---

## 📞 **Support**

Need help with AI provider configuration?
- Check the [README.md](./README.md) for general setup
- Review [ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md) for plugin details
- Test your setup with `node verify-ai-providers.cjs`

**SEI Mate works with whatever AI providers you have - start with one and expand from there!** 🚀