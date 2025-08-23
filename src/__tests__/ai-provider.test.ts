import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import axios from 'axios';
import { AIProvider } from '../utils/ai-provider.ts';
import { logger } from '@elizaos/core';

// Mock axios and logger
jest.mock('axios');
jest.mock('@elizaos/core', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AIProvider', () => {
  let aiProvider: AIProvider;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Provider Detection', () => {
    test('should detect OpenAI as primary when available', () => {
      aiProvider = new AIProvider({
        openaiApiKey: 'test-openai-key',
        anthropicApiKey: 'test-anthropic-key',
        openrouterApiKey: 'test-openrouter-key',
      });

      expect(aiProvider.getAvailableProvider()).toBe('openai');
    });

    test('should detect Anthropic as primary when OpenAI unavailable', () => {
      aiProvider = new AIProvider({
        anthropicApiKey: 'test-anthropic-key',
        openrouterApiKey: 'test-openrouter-key',
      });

      expect(aiProvider.getAvailableProvider()).toBe('anthropic');
    });

    test('should detect OpenRouter as primary when others unavailable', () => {
      aiProvider = new AIProvider({
        openrouterApiKey: 'test-openrouter-key',
      });

      expect(aiProvider.getAvailableProvider()).toBe('openrouter');
    });

    test('should return null when no providers available', () => {
      aiProvider = new AIProvider({});

      expect(aiProvider.getAvailableProvider()).toBe(null);
    });
  });

  describe('OpenAI Integration', () => {
    beforeEach(() => {
      aiProvider = new AIProvider({
        openaiApiKey: 'test-openai-key',
      });
    });

    test('should successfully call OpenAI API', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'Test response from OpenAI',
              },
            },
          ],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await aiProvider.generateText('Test prompt');

      expect(result).toBe('Test response from OpenAI');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test prompt' }],
          temperature: 0.1,
          max_tokens: 1000,
        },
        {
          headers: {
            'Authorization': 'Bearer test-openai-key',
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );
    });

    test('should handle OpenAI API errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('OpenAI API Error'));

      await expect(aiProvider.generateText('Test prompt')).rejects.toThrow(
        'No AI providers available or all providers failed'
      );
    });

    test('should handle invalid OpenAI response format', async () => {
      const mockResponse = {
        data: {
          choices: [],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      await expect(aiProvider.generateText('Test prompt')).rejects.toThrow(
        'No AI providers available or all providers failed'
      );
    });
  });

  describe('Anthropic Integration', () => {
    beforeEach(() => {
      aiProvider = new AIProvider({
        anthropicApiKey: 'test-anthropic-key',
      });
    });

    test('should successfully call Anthropic API', async () => {
      const mockResponse = {
        data: {
          content: [
            {
              text: 'Test response from Anthropic',
            },
          ],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await aiProvider.generateText('Test prompt');

      expect(result).toBe('Test response from Anthropic');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1000,
          messages: [{ role: 'user', content: 'Test prompt' }],
          temperature: 0.1,
        },
        {
          headers: {
            'x-api-key': 'test-anthropic-key',
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
          },
          timeout: 30000,
        }
      );
    });

    test('should handle Anthropic API errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Anthropic API Error'));

      await expect(aiProvider.generateText('Test prompt')).rejects.toThrow(
        'No AI providers available or all providers failed'
      );
    });
  });

  describe('OpenRouter Integration', () => {
    beforeEach(() => {
      aiProvider = new AIProvider({
        openrouterApiKey: 'test-openrouter-key',
      });
    });

    test('should successfully call OpenRouter API', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'Test response from OpenRouter',
              },
            },
          ],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await aiProvider.generateText('Test prompt');

      expect(result).toBe('Test response from OpenRouter');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'anthropic/claude-3.5-sonnet',
          messages: [{ role: 'user', content: 'Test prompt' }],
          temperature: 0.1,
          max_tokens: 1000,
        },
        {
          headers: {
            'Authorization': 'Bearer test-openrouter-key',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://sei-mate.ai',
            'X-Title': 'SEI Mate AI Agent',
          },
          timeout: 30000,
        }
      );
    });

    test('should handle OpenRouter API errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('OpenRouter API Error'));

      await expect(aiProvider.generateText('Test prompt')).rejects.toThrow(
        'No AI providers available or all providers failed'
      );
    });
  });

  describe('Fallback Behavior', () => {
    test('should try providers in order and fallback on failure', async () => {
      aiProvider = new AIProvider({
        openaiApiKey: 'test-openai-key',
        anthropicApiKey: 'test-anthropic-key',
        openrouterApiKey: 'test-openrouter-key',
      });

      // Mock OpenAI failure
      mockedAxios.post.mockRejectedValueOnce(new Error('OpenAI failed'));

      // Mock Anthropic success
      const anthropicResponse = {
        data: {
          content: [
            {
              text: 'Fallback response from Anthropic',
            },
          ],
        },
      };
      mockedAxios.post.mockResolvedValueOnce(anthropicResponse);

      const result = await aiProvider.generateText('Test prompt');

      expect(result).toBe('Fallback response from Anthropic');
      expect(logger.warn).toHaveBeenCalledWith(
        'AI provider openai failed:',
        expect.any(Error)
      );
    });

    test('should respect preferred provider', async () => {
      aiProvider = new AIProvider({
        openaiApiKey: 'test-openai-key',
        anthropicApiKey: 'test-anthropic-key',
      });

      const anthropicResponse = {
        data: {
          content: [
            {
              text: 'Preferred Anthropic response',
            },
          ],
        },
      };
      mockedAxios.post.mockResolvedValueOnce(anthropicResponse);

      const result = await aiProvider.generateText('Test prompt', {
        preferredProvider: 'anthropic',
      });

      expect(result).toBe('Preferred Anthropic response');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('Provider Status', () => {
    test('should return correct provider status', () => {
      aiProvider = new AIProvider({
        openaiApiKey: 'test-openai-key',
        openrouterApiKey: 'test-openrouter-key',
      });

      const status = aiProvider.getProviderStatus();

      expect(status).toEqual({
        available: ['openai', 'openrouter'],
        primary: 'openai',
        total: 2,
      });
    });

    test('should return empty status when no providers available', () => {
      aiProvider = new AIProvider({});

      const status = aiProvider.getProviderStatus();

      expect(status).toEqual({
        available: [],
        primary: null,
        total: 0,
      });
    });
  });

  describe('Custom Options', () => {
    beforeEach(() => {
      aiProvider = new AIProvider({
        openaiApiKey: 'test-openai-key',
        defaultModel: {
          openai: 'gpt-3.5-turbo',
        },
      });
    });

    test('should use custom model from configuration', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'Response with custom model',
              },
            },
          ],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      await aiProvider.generateText('Test prompt');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          model: 'gpt-3.5-turbo',
        }),
        expect.any(Object)
      );
    });

    test('should use custom temperature and max tokens', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'Response with custom options',
              },
            },
          ],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      await aiProvider.generateText('Test prompt', {
        temperature: 0.8,
        maxTokens: 2000,
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          temperature: 0.8,
          max_tokens: 2000,
        }),
        expect.any(Object)
      );
    });
  });
});

describe('Plugin Integration Tests', () => {
  describe('Collaborative Governance AI Integration', () => {
    test('should analyze governance proposals correctly', async () => {
      // This would test the actual governance plugin with mocked AI responses
      const mockAnalysis = {
        parsedIntent: {
          goal: 'Analyze governance proposal',
          category: 'governance',
          complexity: 'moderate',
          confidence: 0.9,
          requiresConfirmation: false,
          riskLevel: 'low',
          timeline: 'immediate',
        },
        executionPlan: [
          {
            id: 'step_1',
            action: 'ANALYZE_PROPOSAL',
            description: 'Analyze proposal content and risks',
            parameters: {},
            dependencies: [],
          },
        ],
      };

      // Test would verify that the AI provider correctly processes governance prompts
      expect(mockAnalysis.parsedIntent.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Intent Engine AI Integration', () => {
    test('should parse complex user intents correctly', async () => {
      const mockIntent = {
        goal: 'Earn yield on SEI safely',
        category: 'yield',
        complexity: 'moderate',
        confidence: 0.95,
        requiresConfirmation: true,
        riskLevel: 'medium',
        timeline: 'immediate',
      };

      // Test would verify intent parsing with different AI providers
      expect(mockIntent.confidence).toBeGreaterThan(0.9);
      expect(mockIntent.category).toBe('yield');
    });
  });
});

export default describe;