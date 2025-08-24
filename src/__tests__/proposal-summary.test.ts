import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IAgentRuntime, Memory, State } from '@elizaos/core';
import { proposalSummaryPlugin } from '../proposal-summary.ts';

describe('Proposal Summary Plugin', () => {
  let mockRuntime: IAgentRuntime;

  beforeEach(() => {
    mockRuntime = {
      getService: vi.fn(),
    } as unknown as IAgentRuntime;
  });

  describe('summarizeProposalAction', () => {
    const action = proposalSummaryPlugin.actions[0];

    it('should validate summarize proposal messages correctly', async () => {
      const validMessages = [
        { content: { text: 'summarize proposal #42' } },
        { content: { text: 'can you summarize proposal 25?' } },
        { content: { text: 'give me a summary of proposal #15' } },
        { content: { text: 'summarize #42' } },
      ];

      for (const message of validMessages) {
        const result = await action.validate(
          mockRuntime,
          message as Memory,
          undefined as State
        );
        expect(result).toBe(true);
      }
    });

    it('should not validate irrelevant messages', async () => {
      const invalidMessages = [
        { content: { text: 'hello world' } },
        { content: { text: 'swap 10 SEI for USDC' } },
        { content: { text: 'vote yes on proposal #42' } },
        { content: { text: 'summarize my portfolio' } },
        { content: {} },
      ];

      for (const message of invalidMessages) {
        const result = await action.validate(
          mockRuntime,
          message as Memory,
          undefined as State
        );
        expect(result).toBe(false);
      }
    });

    it('should extract proposal ID correctly', async () => {
      const mockService = {
        isConfigured: vi.fn().mockReturnValue(false),
      };

      mockRuntime.getService = vi.fn().mockReturnValue(mockService);

      const message = { content: { text: 'summarize proposal #42' } } as Memory;
      
      const result = await action.handler(
        mockRuntime,
        message,
        undefined as State,
        {},
        undefined
      );

      expect(result.success).toBe(false);
      expect(result.text).toContain('No AI service configured');
    });

    it('should handle missing proposal ID', async () => {
      const mockService = {
        isConfigured: vi.fn().mockReturnValue(true),
      };

      mockRuntime.getService = vi.fn().mockReturnValue(mockService);

      const message = { content: { text: 'summarize proposal' } } as Memory;
      
      const result = await action.handler(
        mockRuntime,
        message,
        undefined as State,
        {},
        undefined
      );

      expect(result.success).toBe(false);
      expect(result.text).toContain('Please specify a proposal ID');
    });
  });

  describe('ProposalSummaryService', () => {
    it('should be properly configured in the plugin', () => {
      expect(proposalSummaryPlugin.services).toHaveLength(1);
      expect(proposalSummaryPlugin.services[0].name).toBe('ProposalSummaryService');
    });

    it('should have correct plugin metadata', () => {
      expect(proposalSummaryPlugin.name).toBe('proposal-summary');
      expect(proposalSummaryPlugin.description).toContain('AI-powered governance proposal summarization');
      expect(proposalSummaryPlugin.actions).toHaveLength(1);
      expect(proposalSummaryPlugin.providers).toHaveLength(0);
    });
  });
});