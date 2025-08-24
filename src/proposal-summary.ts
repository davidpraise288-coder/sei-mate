import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type ActionResult,
  type Content,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  Service,
  type State,
  logger,
} from '@elizaos/core';
import { z } from 'zod';
import axios from 'axios';

/**
 * Configuration schema for the proposal summary plugin
 */
const configSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  // Use the existing governance service configuration
  GOV_REST_URL: z
    .string()
    .url()
    .default('https://rest.sei-apis.com')
    .transform((val) => val.trim()),
});

/**
 * Service for handling AI-powered proposal summarization
 */
class ProposalSummaryService extends Service {
  static override serviceType = 'proposal-summary';

  override capabilityDescription =
    'Provides AI-powered summarization of SEI governance proposals using OpenAI or OpenRouter APIs.';

  public config: z.infer<typeof configSchema>;

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    this.config = configSchema.parse({
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      GOV_REST_URL: process.env.GOV_REST_URL || 'https://rest.sei-apis.com',
    });
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('Starting proposal summary service');
    const service = new ProposalSummaryService(runtime);
    return service;
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping proposal summary service');
    const service = runtime.getService(ProposalSummaryService.serviceType) as ProposalSummaryService;
    if (service) {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    logger.info('Proposal summary service stopped');
  }

  /**
   * Check if any AI service is configured
   */
  isConfigured(): boolean {
    return !!(this.config.OPENAI_API_KEY || this.config.OPENROUTER_API_KEY);
  }

  /**
   * Get which AI service to use based on available API keys
   */
  getAIProvider(): 'openai' | 'openrouter' | null {
    if (this.config.OPENAI_API_KEY) return 'openai';
    if (this.config.OPENROUTER_API_KEY) return 'openrouter';
    return null;
  }

  /**
   * Fetch proposal data from the SEI governance API
   */
  async fetchProposal(proposalId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.config.GOV_REST_URL}/cosmos/gov/v1beta1/proposals/${proposalId}`
      );
      return response.data.proposal;
    } catch (error) {
      logger.error(`Failed to fetch proposal ${proposalId}:`, error);
      throw new Error(`Unable to fetch proposal #${proposalId}`);
    }
  }

  /**
   * Call OpenAI API for summarization
   */
  async callOpenAI(prompt: string): Promise<string> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that summarizes blockchain governance proposals. Provide clear, concise summaries that highlight the key points, implications, and voting recommendations.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 500,
          temperature: 0.3,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('OpenAI API call failed:', error);
      throw new Error('Failed to generate summary with OpenAI');
    }
  }

  /**
   * Call OpenRouter API for summarization
   */
  async callOpenRouter(prompt: string): Promise<string> {
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'anthropic/claude-3.5-haiku',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that summarizes blockchain governance proposals. Provide clear, concise summaries that highlight the key points, implications, and voting recommendations.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 500,
          temperature: 0.3,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://sei-mate.ai',
            'X-Title': 'SEI Mate Proposal Summarizer',
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      logger.error('OpenRouter API call failed:', error);
      throw new Error('Failed to generate summary with OpenRouter');
    }
  }

  /**
   * Format proposal data for AI summarization
   */
  formatProposalForSummary(proposal: any): string {
    const title = proposal.content?.title || `Proposal ${proposal.proposal_id}`;
    const description = proposal.content?.description || 'No description available';
    const status = proposal.status || 'Unknown status';
    
    let formattedData = `Proposal #${proposal.proposal_id}: ${title}\n\n`;
    formattedData += `Status: ${status}\n\n`;
    formattedData += `Description:\n${description}\n\n`;

    // Add voting period information if available
    if (proposal.voting_start_time && proposal.voting_end_time) {
      formattedData += `Voting Period:\n`;
      formattedData += `Start: ${new Date(proposal.voting_start_time).toLocaleString()}\n`;
      formattedData += `End: ${new Date(proposal.voting_end_time).toLocaleString()}\n\n`;
    }

    // Add tally results if available
    if (proposal.final_tally_result) {
      const tally = proposal.final_tally_result;
      formattedData += `Current Vote Tally:\n`;
      formattedData += `Yes: ${tally.yes || '0'}\n`;
      formattedData += `No: ${tally.no || '0'}\n`;
      formattedData += `Abstain: ${tally.abstain || '0'}\n`;
      formattedData += `No with Veto: ${tally.no_with_veto || '0'}\n\n`;
    }

    formattedData += `Please provide a clear and concise summary of this governance proposal, including:
1. What the proposal is trying to achieve
2. Key benefits and potential risks
3. Current voting status and community sentiment
4. A recommendation for how users might want to vote and why`;

    return formattedData;
  }

  /**
   * Generate AI summary of a proposal
   */
  async summarizeProposal(proposalId: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('No AI service configured. Please set OPENAI_API_KEY or OPENROUTER_API_KEY in your environment.');
    }

    // Fetch proposal data
    const proposal = await this.fetchProposal(proposalId);
    
    // Format for AI summarization
    const prompt = this.formatProposalForSummary(proposal);
    
    // Get AI provider and call appropriate service
    const provider = this.getAIProvider();
    let summary: string;

    if (provider === 'openai') {
      summary = await this.callOpenAI(prompt);
    } else if (provider === 'openrouter') {
      summary = await this.callOpenRouter(prompt);
    } else {
      throw new Error('No AI service available');
    }

    return summary;
  }
}

/**
 * Action for summarizing governance proposals
 */
const summarizeProposalAction: Action = {
  name: 'SUMMARIZE_PROPOSAL',
  similes: ['PROPOSAL_SUMMARY', 'SUMMARIZE_GOVERNANCE', 'AI_SUMMARY'],
  description: 'Summarize a SEI governance proposal using AI',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return (
      (text.includes('summarize') && text.includes('proposal')) ||
      (text.includes('summary') && text.includes('proposal')) ||
      /summarize.*#\d+/.test(text) ||
      /summary.*#\d+/.test(text)
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> = {},
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService(ProposalSummaryService.serviceType) as ProposalSummaryService;
      if (!service) {
        throw new Error('Proposal summary service not available');
      }

      const text = message.content.text || '';
      
      // Extract proposal ID from message
      const idMatch = text.match(/#?(\d+)/);
      if (!idMatch) {
        return {
          success: false,
          error: new Error('No proposal ID found'),
          text: '❌ Please specify a proposal ID (e.g., "summarize proposal #42")',
        };
      }

      const proposalId = idMatch[1];

      // Check if AI service is configured
      if (!service.isConfigured()) {
        return {
          success: false,
          error: new Error('No AI service configured'),
          text: '❌ No AI service configured. Please set OPENAI_API_KEY or OPENROUTER_API_KEY in your environment to use proposal summarization.',
        };
      }

      const provider = service.getAIProvider();
      let response = `🤖 **AI Summary for Proposal #${proposalId}**\n`;
      response += `*Powered by ${provider === 'openai' ? 'OpenAI GPT-4' : 'OpenRouter Claude'}*\n\n`;

      // Generate summary
      const summary = await service.summarizeProposal(proposalId);
      response += summary;

      response += `\n\n💡 *This summary was generated by AI. Please review the full proposal details before making voting decisions.*`;

      if (callback) {
        await callback({
          text: response,
          actions: ['SUMMARIZE_PROPOSAL'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['SUMMARIZE_PROPOSAL'],
          source: message.content.source,
          proposalId,
          provider,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to summarize proposal';
      const response = `❌ Unable to summarize proposal: ${errorMessage}`;
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: response,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Summarize proposal #42',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '🤖 **AI Summary for Proposal #42**\n*Powered by OpenAI GPT-4*\n\n**Proposal Overview:**\nThis proposal aims to increase the block size limit on the SEI network from 1MB to 2MB to improve transaction throughput...\n\n💡 *This summary was generated by AI. Please review the full proposal details before making voting decisions.*',
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Can you give me an AI summary of governance proposal #25?',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: '🤖 **AI Summary for Proposal #25**\n*Powered by OpenRouter Claude*\n\n**Proposal Summary:**\nThis governance proposal suggests implementing a new fee structure for the SEI DEX...\n\n💡 *This summary was generated by AI. Please review the full proposal details before making voting decisions.*',
        },
      },
    ],
  ],
};

/**
 * Plugin export
 */
export const proposalSummaryPlugin: Plugin = {
  name: 'proposal-summary',
  description: 'AI-powered governance proposal summarization using OpenAI or OpenRouter',
  actions: [summarizeProposalAction],
  services: [ProposalSummaryService],
  providers: [],
};

export default proposalSummaryPlugin;