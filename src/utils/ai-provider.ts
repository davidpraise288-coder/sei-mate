import axios from 'axios';
import { logger } from '@elizaos/core';

/**
 * Configuration for AI providers
 */
export interface AIProviderConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  defaultModel?: {
    openai?: string;
    anthropic?: string;
    openrouter?: string;
  };
}

/**
 * AI Provider utility for consistent API calls across all plugins
 */
export class AIProvider {
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  /**
   * Get available AI provider (prioritizes OpenAI > Anthropic > OpenRouter)
   */
  getAvailableProvider(): 'openai' | 'anthropic' | 'openrouter' | null {
    if (this.config.openaiApiKey) return 'openai';
    if (this.config.anthropicApiKey) return 'anthropic';
    if (this.config.openrouterApiKey) return 'openrouter';
    return null;
  }

  /**
   * Generate text using available AI provider
   */
  async generateText(
    prompt: string, 
    options: {
      maxTokens?: number;
      temperature?: number;
      preferredProvider?: 'openai' | 'anthropic' | 'openrouter';
    } = {}
  ): Promise<string> {
    const {
      maxTokens = 1000,
      temperature = 0.1,
      preferredProvider
    } = options;

    // Try preferred provider first if specified and available
    if (preferredProvider && this.isProviderAvailable(preferredProvider)) {
      try {
        return await this.callProvider(preferredProvider, prompt, maxTokens, temperature);
      } catch (error) {
        logger.warn(`Preferred provider ${preferredProvider} failed, trying fallback:`, error);
      }
    }

    // Try providers in order of preference
    const providers: ('openai' | 'anthropic' | 'openrouter')[] = ['openai', 'anthropic', 'openrouter'];
    
    for (const provider of providers) {
      if (this.isProviderAvailable(provider)) {
        try {
          return await this.callProvider(provider, prompt, maxTokens, temperature);
        } catch (error) {
          logger.warn(`AI provider ${provider} failed:`, error);
          continue;
        }
      }
    }

    throw new Error('No AI providers available or all providers failed');
  }

  /**
   * Check if a specific provider is available
   */
  private isProviderAvailable(provider: 'openai' | 'anthropic' | 'openrouter'): boolean {
    switch (provider) {
      case 'openai':
        return !!this.config.openaiApiKey;
      case 'anthropic':
        return !!this.config.anthropicApiKey;
      case 'openrouter':
        return !!this.config.openrouterApiKey;
      default:
        return false;
    }
  }

  /**
   * Call specific AI provider
   */
  private async callProvider(
    provider: 'openai' | 'anthropic' | 'openrouter',
    prompt: string,
    maxTokens: number,
    temperature: number
  ): Promise<string> {
    switch (provider) {
      case 'openai':
        return await this.callOpenAI(prompt, maxTokens, temperature);
      case 'anthropic':
        return await this.callAnthropic(prompt, maxTokens, temperature);
      case 'openrouter':
        return await this.callOpenRouter(prompt, maxTokens, temperature);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(prompt: string, maxTokens: number, temperature: number): Promise<string> {
    const model = this.config.defaultModel?.openai || 'gpt-4';
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    
    if (!response.data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response from OpenAI API');
    }
    
    return response.data.choices[0].message.content;
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(prompt: string, maxTokens: number, temperature: number): Promise<string> {
    const model = this.config.defaultModel?.anthropic || 'claude-3-sonnet-20240229';
    
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
        temperature,
      },
      {
        headers: {
          'x-api-key': this.config.anthropicApiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        timeout: 30000,
      }
    );
    
    if (!response.data.content?.[0]?.text) {
      throw new Error('Invalid response from Anthropic API');
    }
    
    return response.data.content[0].text;
  }

  /**
   * Call OpenRouter API
   */
  private async callOpenRouter(prompt: string, maxTokens: number, temperature: number): Promise<string> {
    const model = this.config.defaultModel?.openrouter || 'anthropic/claude-3.5-sonnet';
    
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxTokens,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.openrouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://sei-mate.ai',
          'X-Title': 'SEI Mate AI Agent',
        },
        timeout: 30000,
      }
    );
    
    if (!response.data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response from OpenRouter API');
    }
    
    return response.data.choices[0].message.content;
  }

  /**
   * Get provider status for debugging
   */
  getProviderStatus(): {
    available: string[];
    primary: string | null;
    total: number;
  } {
    const available: string[] = [];
    
    if (this.config.openaiApiKey) available.push('openai');
    if (this.config.anthropicApiKey) available.push('anthropic');
    if (this.config.openrouterApiKey) available.push('openrouter');
    
    return {
      available,
      primary: this.getAvailableProvider(),
      total: available.length,
    };
  }
}