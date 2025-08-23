import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type ActionResult,
  type Content,
  type GenerateTextParams,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type Provider,
  type ProviderResult,
  Service,
  type State,
  logger,
  type MessagePayload,
  type WorldPayload,
  EventType,
} from '@elizaos/core';
import { z } from 'zod';
import axios from 'axios';
import { SigningStargateClient, GasPrice } from '@cosmjs/stargate';
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import { AIProvider, type AIProviderConfig } from './utils/ai-provider.ts';

/**
 * Configuration schema for collaborative governance
 */
const configSchema = z.object({
  GOV_RPC_URL: z.string().url().default('https://rpc.sei-apis.com'),
  GOV_REST_URL: z.string().url().default('https://rest.sei-apis.com'),
  SEI_MNEMONIC: z.string().optional(),
  SEI_PRIVATE_KEY: z.string().optional(),
  SEI_CHAIN_ID: z.string().default('pacific-1'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  POLL_DURATION_HOURS: z.number().default(24),
  MIN_POLL_PARTICIPANTS: z.number().default(3),
});

/**
 * Interface for governance proposal with AI analysis
 */
interface AnalyzedProposal {
  proposalId: string;
  title: string;
  description: string;
  status: string;
  votingStartTime: string;
  votingEndTime: string;
  submitTime: string;
  aiSummary: {
    shortSummary: string;
    pros: string[];
    cons: string[];
    riskLevel: 'low' | 'medium' | 'high';
    recommendation: 'yes' | 'no' | 'abstain' | 'analyze_more';
    complexity: 'simple' | 'moderate' | 'complex';
  };
  tallyResult: {
    yes: string;
    no: string;
    abstain: string;
    noWithVeto: string;
  };
}

/**
 * Interface for community poll
 */
interface CommunityPoll {
  id: string;
  proposalId: string;
  communityId: string;
  question: string;
  options: string[];
  votes: Map<string, string>; // userId -> vote
  createdAt: Date;
  expiresAt: Date;
  status: 'active' | 'completed' | 'executed';
  creatorId: string;
  aiAnalysis: AnalyzedProposal['aiSummary'];
  results?: {
    [option: string]: number;
  };
  executionPlan?: 'auto_delegate' | 'guide_users' | 'no_action';
}

/**
 * Interface for user voting preference
 */
interface UserVotingPreference {
  userId: string;
  communityId: string;
  autoVote: boolean;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  delegateTo?: string; // validator address
  votingPower?: string;
}

/**
 * Collaborative Governance Service
 */
export class CollaborativeGovernanceService extends Service {
  static override serviceType = 'collaborative-governance';

  override capabilityDescription =
    'Provides AI-powered collaborative governance with proposal analysis and community polling.';

  private rpcUrl: string;
  private restUrl: string;
  private mnemonic?: string;
  private privateKey?: string;
  private chainId: string;
  private pollDurationHours: number;
  private minPollParticipants: number;
  private aiProvider: AIProvider;

  // In-memory storage for demo (in production, use proper database)
  private analyzedProposals: Map<string, AnalyzedProposal> = new Map();
  private communityPolls: Map<string, CommunityPoll> = new Map();
  private userPreferences: Map<string, UserVotingPreference> = new Map();
  private proposalMonitor?: NodeJS.Timeout;

  override async initialize(runtime: IAgentRuntime): Promise<void> {
    const config = configSchema.parse(runtime.config);
    
    this.rpcUrl = config.GOV_RPC_URL;
    this.restUrl = config.GOV_REST_URL;
    this.mnemonic = config.SEI_MNEMONIC;
    this.privateKey = config.SEI_PRIVATE_KEY;
    this.chainId = config.SEI_CHAIN_ID;
    this.pollDurationHours = config.POLL_DURATION_HOURS;
    this.minPollParticipants = config.MIN_POLL_PARTICIPANTS;
    
    // Initialize AI provider
    this.aiProvider = new AIProvider({
      openaiApiKey: config.OPENAI_API_KEY,
      anthropicApiKey: config.ANTHROPIC_API_KEY,
      openrouterApiKey: config.OPENROUTER_API_KEY,
      defaultModel: {
        openai: 'gpt-4',
        anthropic: 'claude-3-sonnet-20240229',
        openrouter: 'anthropic/claude-3.5-sonnet',
      },
    });

    // Start proposal monitoring
    this.startProposalMonitoring();

    logger.info('CollaborativeGovernanceService initialized with AI analysis');
  }

  /**
   * Analyze a governance proposal using AI
   */
  async analyzeProposal(proposal: any): Promise<AnalyzedProposal> {
    try {
      const proposalId = proposal.proposal_id;
      
      // Check if already analyzed
      const existing = this.analyzedProposals.get(proposalId);
      if (existing) {
        return existing;
      }

      const title = proposal.content?.title || 'Unknown Proposal';
      const description = proposal.content?.description || '';
      
      // Generate AI analysis
      const aiSummary = await this.generateAIAnalysis(title, description);

      const analyzedProposal: AnalyzedProposal = {
        proposalId,
        title,
        description,
        status: proposal.status,
        votingStartTime: proposal.voting_start_time,
        votingEndTime: proposal.voting_end_time,
        submitTime: proposal.submit_time,
        aiSummary,
        tallyResult: proposal.final_tally_result || {
          yes: '0',
          no: '0',
          abstain: '0',
          noWithVeto: '0',
        },
      };

      this.analyzedProposals.set(proposalId, analyzedProposal);
      return analyzedProposal;
    } catch (error) {
      logger.error('Failed to analyze proposal:', error);
      throw error;
    }
  }

  /**
   * Generate AI analysis of a proposal
   */
  private async generateAIAnalysis(title: string, description: string): Promise<AnalyzedProposal['aiSummary']> {
    try {
      const prompt = `
Analyze this SEI governance proposal and provide a clear, unbiased summary:

Title: ${title}
Description: ${description}

Provide:
1. A short summary (2-3 sentences)
2. Potential pros (2-3 points)
3. Potential cons (2-3 points)
4. Risk level (low/medium/high)
5. Recommendation (yes/no/abstain/analyze_more)
6. Complexity (simple/moderate/complex)

Format as JSON with keys: shortSummary, pros, cons, riskLevel, recommendation, complexity
`;

      let response: string;
      
      try {
        response = await this.aiProvider.generateText(prompt, {
          maxTokens: 1000,
          temperature: 0.1,
        });
      } catch (error) {
        logger.warn('AI provider failed, using fallback analysis:', error);
        return this.generateFallbackAnalysis(title, description);
      }

      // Parse AI response
      const analysis = JSON.parse(response);
      
      return {
        shortSummary: analysis.shortSummary || 'AI analysis not available',
        pros: analysis.pros || [],
        cons: analysis.cons || [],
        riskLevel: analysis.riskLevel || 'medium',
        recommendation: analysis.recommendation || 'analyze_more',
        complexity: analysis.complexity || 'moderate',
      };
    } catch (error) {
      logger.error('Failed to generate AI analysis:', error);
      return this.generateFallbackAnalysis(title, description);
    }
  }



  /**
   * Generate fallback analysis when AI is not available
   */
  private generateFallbackAnalysis(title: string, description: string): AnalyzedProposal['aiSummary'] {
    const hasUpgrade = title.toLowerCase().includes('upgrade') || description.toLowerCase().includes('upgrade');
    const hasParameter = title.toLowerCase().includes('parameter') || description.toLowerCase().includes('parameter');
    const hasFunding = title.toLowerCase().includes('fund') || description.toLowerCase().includes('fund');
    
    return {
      shortSummary: `This proposal: ${title}. Please review the full description for details.`,
      pros: hasUpgrade ? ['May improve network functionality', 'Shows active development'] : 
            hasParameter ? ['May optimize network parameters', 'Could improve efficiency'] :
            hasFunding ? ['Supports ecosystem development', 'Provides community funding'] :
            ['Community-driven decision', 'Participates in governance'],
      cons: hasUpgrade ? ['May introduce new risks', 'Requires testing'] :
            hasParameter ? ['May have unintended consequences', 'Needs careful analysis'] :
            hasFunding ? ['Uses treasury funds', 'Requires oversight'] :
            ['Requires community consensus', 'May be controversial'],
      riskLevel: hasUpgrade ? 'high' : hasParameter ? 'medium' : 'low',
      recommendation: 'analyze_more',
      complexity: hasUpgrade ? 'complex' : hasParameter ? 'moderate' : 'simple',
    };
  }

  /**
   * Create community poll for a proposal
   */
  async createCommunityPoll(
    proposalId: string,
    communityId: string,
    creatorId: string
  ): Promise<CommunityPoll> {
    try {
      const proposal = await this.getProposal(proposalId);
      const analyzedProposal = await this.analyzeProposal(proposal);
      
      const pollId = `poll_${communityId}_${proposalId}`;
      const expiresAt = new Date(Date.now() + this.pollDurationHours * 60 * 60 * 1000);
      
      const question = `How should our community vote on proposal #${proposalId}?`;
      const options = ['Yes', 'No', 'Abstain', 'No with Veto'];

      const poll: CommunityPoll = {
        id: pollId,
        proposalId,
        communityId,
        question,
        options,
        votes: new Map(),
        createdAt: new Date(),
        expiresAt,
        status: 'active',
        creatorId,
        aiAnalysis: analyzedProposal.aiSummary,
        executionPlan: 'guide_users',
      };

      this.communityPolls.set(pollId, poll);
      return poll;
    } catch (error) {
      logger.error('Failed to create community poll:', error);
      throw error;
    }
  }

  /**
   * Cast vote in community poll
   */
  async voteInPoll(pollId: string, userId: string, vote: string): Promise<CommunityPoll> {
    const poll = this.communityPolls.get(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    if (poll.status !== 'active') {
      throw new Error('Poll is not active');
    }

    if (new Date() > poll.expiresAt) {
      poll.status = 'completed';
      throw new Error('Poll has expired');
    }

    if (!poll.options.includes(vote)) {
      throw new Error('Invalid vote option');
    }

    poll.votes.set(userId, vote);
    this.communityPolls.set(pollId, poll);

    // Calculate results
    poll.results = {};
    poll.options.forEach(option => {
      poll.results![option] = 0;
    });

    for (const userVote of poll.votes.values()) {
      poll.results[userVote]++;
    }

    return poll;
  }

  /**
   * Get proposal from SEI network
   */
  private async getProposal(proposalId: string): Promise<any> {
    try {
      const response = await axios.get(`${this.restUrl}/cosmos/gov/v1beta1/proposals/${proposalId}`);
      return response.data.proposal;
    } catch (error) {
      logger.error('Failed to get proposal:', error);
      throw error;
    }
  }

  /**
   * Get active proposals
   */
  async getActiveProposals(): Promise<any[]> {
    try {
      const response = await axios.get(`${this.restUrl}/cosmos/gov/v1beta1/proposals?proposal_status=2`);
      return response.data.proposals || [];
    } catch (error) {
      logger.error('Failed to get active proposals:', error);
      return [];
    }
  }

  /**
   * Start monitoring for new proposals
   */
  private startProposalMonitoring(): void {
    this.proposalMonitor = setInterval(async () => {
      try {
        const proposals = await this.getActiveProposals();
        
        for (const proposal of proposals) {
          const proposalId = proposal.proposal_id;
          if (!this.analyzedProposals.has(proposalId)) {
            await this.analyzeProposal(proposal);
            logger.info(`New proposal detected and analyzed: ${proposalId}`);
          }
        }
      } catch (error) {
        logger.error('Error in proposal monitoring:', error);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  /**
   * Get community poll
   */
  getCommunityPoll(pollId: string): CommunityPoll | null {
    return this.communityPolls.get(pollId) || null;
  }

  /**
   * Get active polls for community
   */
  getActivePolls(communityId: string): CommunityPoll[] {
    return Array.from(this.communityPolls.values())
      .filter(poll => poll.communityId === communityId && poll.status === 'active');
  }

  /**
   * Get analyzed proposal
   */
  getAnalyzedProposal(proposalId: string): AnalyzedProposal | null {
    return this.analyzedProposals.get(proposalId) || null;
  }
}

/**
 * Action to create governance poll
 */
const createGovernancePollAction: Action = {
  name: 'CREATE_GOVERNANCE_POLL',
  similes: ['POLL_PROPOSAL', 'VOTE_PROPOSAL', 'GOVERNANCE_POLL'],
  description: 'Creates a community poll for governance proposals with AI analysis',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    return (text.includes('proposal') && (text.includes('poll') || text.includes('vote'))) ||
           text.includes('governance poll') ||
           text.match(/proposal\s*#?\d+/);
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService<CollaborativeGovernanceService>('collaborative-governance');
      if (!service) {
        await callback({
          text: 'Collaborative governance service is not available.',
          error: true,
        });
        return { success: false, error: new Error('Service not available') };
      }

      const text = message.content.text || '';
      const proposalMatch = text.match(/proposal\s*#?(\d+)/i);
      
      if (!proposalMatch) {
        await callback({
          text: `🗳️ **Governance Poll Format**\n\n` +
                `To create a governance poll, mention a proposal:\n` +
                `"Create poll for proposal #42"\n` +
                `"Vote on proposal 42"\n\n` +
                `I'll analyze the proposal and create a community poll with:\n` +
                `• AI-powered summary and analysis\n` +
                `• Pro/con breakdown\n` +
                `• Risk assessment\n` +
                `• Community voting interface`,
        });
        return { success: false, error: new Error('No proposal ID found') };
      }

      const proposalId = proposalMatch[1];
      const communityId = message.roomId;
      const creatorId = message.entityId;

      const poll = await service.createCommunityPoll(proposalId, communityId, creatorId);

      const riskEmoji = poll.aiAnalysis.riskLevel === 'high' ? '🔴' : 
                       poll.aiAnalysis.riskLevel === 'medium' ? '🟡' : '🟢';
      
      const complexityEmoji = poll.aiAnalysis.complexity === 'complex' ? '🧠' :
                             poll.aiAnalysis.complexity === 'moderate' ? '📊' : '📋';

      await callback({
        text: `🗳️ **Governance Poll Created!**\n\n` +
              `📋 **Proposal #${proposalId}**\n` +
              `${complexityEmoji} **Complexity**: ${poll.aiAnalysis.complexity}\n` +
              `${riskEmoji} **Risk Level**: ${poll.aiAnalysis.riskLevel}\n\n` +
              `🤖 **AI Summary**:\n${poll.aiAnalysis.shortSummary}\n\n` +
              `✅ **Potential Pros**:\n${poll.aiAnalysis.pros.map(pro => `• ${pro}`).join('\n')}\n\n` +
              `❌ **Potential Cons**:\n${poll.aiAnalysis.cons.map(con => `• ${con}`).join('\n')}\n\n` +
              `🎯 **AI Recommendation**: ${poll.aiAnalysis.recommendation.toUpperCase()}\n\n` +
              `**How should our community vote?**\n` +
              `React with: 👍 (Yes) | 👎 (No) | 🤷 (Abstain) | ⛔ (Veto)\n\n` +
              `⏰ **Poll expires**: ${poll.expiresAt.toLocaleString()}`,
        action: 'CREATE_GOVERNANCE_POLL',
      });

      return {
        success: true,
        text: `Governance poll created for proposal ${proposalId}`,
        data: { pollId: poll.id, proposalId },
      };
    } catch (error) {
      logger.error('Failed to create governance poll:', error);
      await callback({
        text: `❌ Failed to create governance poll: ${error.message}`,
        error: true,
      });
      return { success: false, error: error as Error };
    }
  },
};

/**
 * Action to vote in governance poll
 */
const voteInGovernancePollAction: Action = {
  name: 'VOTE_IN_POLL',
  similes: ['CAST_VOTE', 'POLL_VOTE'],
  description: 'Casts a vote in an active governance poll',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    return text === '👍' || text === '👎' || text === '🤷' || text === '⛔' ||
           text.includes('vote yes') || text.includes('vote no') || 
           text.includes('vote abstain') || text.includes('vote veto');
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService<CollaborativeGovernanceService>('collaborative-governance');
      if (!service) {
        return { success: false, error: new Error('Service not available') };
      }

      const communityId = message.roomId;
      const userId = message.entityId;
      const text = message.content.text || '';
      
      // Find active polls in this community
      const activePolls = service.getActivePolls(communityId);
      
      if (activePolls.length === 0) {
        await callback({
          text: 'No active governance polls found. Create one with "poll proposal #[number]"',
        });
        return { success: false, error: new Error('No active polls') };
      }

      // Map reaction to vote
      let vote: string;
      if (text === '👍' || text.includes('vote yes')) vote = 'Yes';
      else if (text === '👎' || text.includes('vote no')) vote = 'No';
      else if (text === '🤷' || text.includes('vote abstain')) vote = 'Abstain';
      else if (text === '⛔' || text.includes('vote veto')) vote = 'No with Veto';
      else {
        await callback({
          text: 'Invalid vote. Use: 👍 (Yes) | 👎 (No) | 🤷 (Abstain) | ⛔ (Veto)',
        });
        return { success: false, error: new Error('Invalid vote') };
      }

      // Vote in the most recent poll
      const latestPoll = activePolls[activePolls.length - 1];
      const updatedPoll = await service.voteInPoll(latestPoll.id, userId, vote);

      const totalVotes = Array.from(updatedPoll.votes.values()).length;
      const results = updatedPoll.results || {};
      
      await callback({
        text: `✅ **Vote Recorded!**\n\n` +
              `Your vote: **${vote}**\n` +
              `Proposal: #${updatedPoll.proposalId}\n\n` +
              `📊 **Current Results** (${totalVotes} votes):\n` +
              `👍 Yes: ${results.Yes || 0}\n` +
              `👎 No: ${results.No || 0}\n` +
              `🤷 Abstain: ${results.Abstain || 0}\n` +
              `⛔ Veto: ${results['No with Veto'] || 0}\n\n` +
              `Share with others to get more community input! 🚀`,
        action: 'VOTE_IN_POLL',
      });

      return {
        success: true,
        text: `Vote cast in poll ${updatedPoll.id}`,
        data: { pollId: updatedPoll.id, vote, totalVotes },
      };
    } catch (error) {
      logger.error('Failed to vote in poll:', error);
      await callback({
        text: `❌ Failed to cast vote: ${error.message}`,
        error: true,
      });
      return { success: false, error: error as Error };
    }
  },
};

/**
 * Provider for governance information
 */
const collaborativeGovernanceProvider: Provider = {
  name: 'COLLABORATIVE_GOVERNANCE_PROVIDER',
  description: 'Provides governance proposals and community poll information',

  get: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ProviderResult> => {
    try {
      const service = runtime.getService<CollaborativeGovernanceService>('collaborative-governance');
      if (!service) {
        return { success: false, error: 'Service not available' };
      }

      const communityId = message.roomId;
      const activePolls = service.getActivePolls(communityId);

      return {
        success: true,
        data: {
          activePolls: activePolls.length,
          polls: activePolls.map(poll => ({
            id: poll.id,
            proposalId: poll.proposalId,
            question: poll.question,
            totalVotes: poll.votes.size,
            results: poll.results,
            aiSummary: poll.aiAnalysis.shortSummary,
            riskLevel: poll.aiAnalysis.riskLevel,
            recommendation: poll.aiAnalysis.recommendation,
            expiresAt: poll.expiresAt,
          })),
        },
      };
    } catch (error) {
      logger.error('Failed to get governance info:', error);
      return { success: false, error: error.message };
    }
  },
};

/**
 * Collaborative Governance Plugin
 */
export const collaborativeGovernancePlugin: Plugin = {
  name: 'plugin-collaborative-governance',
  description: 'Provides AI-powered collaborative governance with proposal analysis and community polling',
  config: {
    GOV_RPC_URL: process.env.GOV_RPC_URL || 'https://rpc.sei-apis.com',
    GOV_REST_URL: process.env.GOV_REST_URL || 'https://rest.sei-apis.com',
    SEI_MNEMONIC: process.env.SEI_MNEMONIC,
    SEI_PRIVATE_KEY: process.env.SEI_PRIVATE_KEY,
    SEI_CHAIN_ID: process.env.SEI_CHAIN_ID || 'pacific-1',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    POLL_DURATION_HOURS: parseInt(process.env.POLL_DURATION_HOURS || '24'),
    MIN_POLL_PARTICIPANTS: parseInt(process.env.MIN_POLL_PARTICIPANTS || '3'),
  },
  services: [CollaborativeGovernanceService],
  actions: [createGovernancePollAction, voteInGovernancePollAction],
  providers: [collaborativeGovernanceProvider],
  models: {
    [ModelType.TEXT_SMALL]: async (
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'I can create AI-powered governance polls to simplify DAO participation.';
    },
    [ModelType.TEXT_LARGE]: async (
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'I provide collaborative governance features with AI-powered proposal analysis. I can summarize complex governance proposals, identify pros and cons, assess risks, and create community polls that make DAO participation accessible through simple Discord/Telegram interactions.';
    },
  },
};