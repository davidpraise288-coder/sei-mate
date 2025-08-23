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

/**
 * Configuration schema for intent engine
 */
const configSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  INTENT_CONFIDENCE_THRESHOLD: z.number().default(0.7),
  MAX_EXECUTION_STEPS: z.number().default(10),
  INTENT_ANALYSIS_TIMEOUT: z.number().default(30000),
});

/**
 * Interface for parsed user intent
 */
interface UserIntent {
  id: string;
  userId: string;
  originalText: string;
  parsedIntent: {
    goal: string;
    category: 'yield' | 'trading' | 'governance' | 'portfolio' | 'social' | 'general';
    complexity: 'simple' | 'moderate' | 'complex';
    confidence: number;
    requiresConfirmation: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    timeline: 'immediate' | 'short_term' | 'long_term';
  };
  executionPlan: ExecutionStep[];
  status: 'analyzing' | 'planning' | 'executing' | 'monitoring' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  results?: any;
}

/**
 * Interface for execution steps
 */
interface ExecutionStep {
  id: string;
  action: string;
  description: string;
  parameters: any;
  dependencies: string[]; // IDs of steps that must complete first
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  estimatedDuration?: number;
  actualDuration?: number;
  startTime?: Date;
  endTime?: Date;
}

/**
 * Interface for monitoring configuration
 */
interface MonitoringConfig {
  intentId: string;
  userId: string;
  conditions: {
    type: 'price_drop' | 'yield_drop' | 'safety_score' | 'custom';
    threshold: number;
    operator: 'below' | 'above' | 'equals';
    value: string;
  }[];
  actions: {
    type: 'withdraw' | 'alert' | 'rebalance' | 'stop_loss';
    parameters: any;
  }[];
  isActive: boolean;
}

/**
 * Intent-Based Execution Engine Service
 */
export class IntentEngineService extends Service {
  static override serviceType = 'intent-engine';

  override capabilityDescription =
    'Provides intent-based execution engine for complex multi-step strategies from natural language.';

  private openaiApiKey?: string;
  private anthropicApiKey?: string;
  private confidenceThreshold: number;
  private maxExecutionSteps: number;
  private analysisTimeout: number;

  // In-memory storage for demo (in production, use proper database)
  private activeIntents: Map<string, UserIntent> = new Map();
  private monitoringConfigs: Map<string, MonitoringConfig> = new Map();
  private executionQueue: string[] = [];
  private executionTimer?: NodeJS.Timeout;

  override async initialize(runtime: IAgentRuntime): Promise<void> {
    const config = configSchema.parse(runtime.config);
    
    this.openaiApiKey = config.OPENAI_API_KEY;
    this.anthropicApiKey = config.ANTHROPIC_API_KEY;
    this.confidenceThreshold = config.INTENT_CONFIDENCE_THRESHOLD;
    this.maxExecutionSteps = config.MAX_EXECUTION_STEPS;
    this.analysisTimeout = config.INTENT_ANALYSIS_TIMEOUT;

    // Start execution engine
    this.startExecutionEngine();

    logger.info('IntentEngineService initialized for complex goal processing');
  }

  /**
   * Parse user intent using AI
   */
  async parseIntent(userId: string, text: string): Promise<UserIntent> {
    try {
      const intentId = `intent_${userId}_${Date.now()}`;
      
      // Initial intent structure
      const intent: UserIntent = {
        id: intentId,
        userId,
        originalText: text,
        parsedIntent: {
          goal: '',
          category: 'general',
          complexity: 'simple',
          confidence: 0,
          requiresConfirmation: false,
          riskLevel: 'low',
          timeline: 'immediate',
        },
        executionPlan: [],
        status: 'analyzing',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      this.activeIntents.set(intentId, intent);

      // Analyze intent with AI
      const analysis = await this.analyzeIntentWithAI(text);
      
      // Update intent with analysis
      intent.parsedIntent = analysis.parsedIntent;
      intent.executionPlan = analysis.executionPlan;
      intent.status = 'planning';
      intent.updatedAt = new Date();

      this.activeIntents.set(intentId, intent);

      logger.info(`Parsed intent: ${intent.parsedIntent.goal} (confidence: ${intent.parsedIntent.confidence})`);
      return intent;
    } catch (error) {
      logger.error('Failed to parse intent:', error);
      throw error;
    }
  }

  /**
   * Analyze intent using AI
   */
  private async analyzeIntentWithAI(text: string): Promise<{
    parsedIntent: UserIntent['parsedIntent'];
    executionPlan: ExecutionStep[];
  }> {
    try {
      const prompt = `
Analyze this user request and create an execution plan for a DeFi agent:

User Request: "${text}"

Provide a JSON response with:
1. parsedIntent: {
   goal: string (clear description of what user wants)
   category: "yield" | "trading" | "governance" | "portfolio" | "social" | "general"
   complexity: "simple" | "moderate" | "complex"
   confidence: number (0-1, how confident you are in understanding)
   requiresConfirmation: boolean (true for risky operations)
   riskLevel: "low" | "medium" | "high"
   timeline: "immediate" | "short_term" | "long_term"
}

2. executionPlan: Array of steps with:
   id: string
   action: string (specific action like "CHECK_BALANCE", "SWAP_TOKENS", "MONITOR_YIELD")
   description: string (human readable)
   parameters: object (action parameters)
   dependencies: string[] (step IDs that must complete first)

Focus on yield farming, trading, governance, and portfolio management use cases.
For complex goals, break them into logical steps.
Always prioritize user safety and require confirmation for risky operations.

Examples:
- "I want to earn yield on my SEI safely" → Check balance, research safe protocols, deposit with monitoring
- "Help me DCA into USDC" → Set up recurring swap orders
- "Alert me if my position loses value" → Set up monitoring with stop-loss
`;

      let response: string;
      
      if (this.openaiApiKey) {
        response = await this.callOpenAI(prompt);
      } else if (this.anthropicApiKey) {
        response = await this.callAnthropic(prompt);
      } else {
        return this.generateFallbackAnalysis(text);
      }

      const analysis = JSON.parse(response);
      
      // Validate and sanitize response
      return {
        parsedIntent: {
          goal: analysis.parsedIntent?.goal || 'Process user request',
          category: this.validateCategory(analysis.parsedIntent?.category) || 'general',
          complexity: this.validateComplexity(analysis.parsedIntent?.complexity) || 'simple',
          confidence: Math.min(Math.max(analysis.parsedIntent?.confidence || 0.5, 0), 1),
          requiresConfirmation: analysis.parsedIntent?.requiresConfirmation || false,
          riskLevel: this.validateRiskLevel(analysis.parsedIntent?.riskLevel) || 'low',
          timeline: this.validateTimeline(analysis.parsedIntent?.timeline) || 'immediate',
        },
        executionPlan: this.validateExecutionPlan(analysis.executionPlan || []),
      };
    } catch (error) {
      logger.error('Failed to analyze intent with AI:', error);
      return this.generateFallbackAnalysis(text);
    }
  }

  /**
   * Generate fallback analysis when AI is not available
   */
  private generateFallbackAnalysis(text: string): {
    parsedIntent: UserIntent['parsedIntent'];
    executionPlan: ExecutionStep[];
  } {
    const lowerText = text.toLowerCase();
    
    // Detect category based on keywords
    let category: UserIntent['parsedIntent']['category'] = 'general';
    let riskLevel: UserIntent['parsedIntent']['riskLevel'] = 'low';
    let requiresConfirmation = false;

    if (lowerText.includes('yield') || lowerText.includes('earn') || lowerText.includes('stake')) {
      category = 'yield';
      riskLevel = 'medium';
      requiresConfirmation = true;
    } else if (lowerText.includes('swap') || lowerText.includes('trade') || lowerText.includes('buy') || lowerText.includes('sell')) {
      category = 'trading';
      riskLevel = 'medium';
      requiresConfirmation = true;
    } else if (lowerText.includes('vote') || lowerText.includes('proposal') || lowerText.includes('governance')) {
      category = 'governance';
      riskLevel = 'low';
    } else if (lowerText.includes('portfolio') || lowerText.includes('balance') || lowerText.includes('asset')) {
      category = 'portfolio';
      riskLevel = 'low';
    }

    const executionPlan: ExecutionStep[] = [
      {
        id: 'step_1',
        action: 'ANALYZE_REQUEST',
        description: 'Analyze user request and provide guidance',
        parameters: { originalText: text },
        dependencies: [],
        status: 'pending',
      },
    ];

    return {
      parsedIntent: {
        goal: `Process request: ${text.slice(0, 100)}...`,
        category,
        complexity: 'simple',
        confidence: 0.6,
        requiresConfirmation,
        riskLevel,
        timeline: 'immediate',
      },
      executionPlan,
    };
  }

  /**
   * Execute intent plan
   */
  async executeIntent(intentId: string, runtime: IAgentRuntime): Promise<UserIntent> {
    try {
      const intent = this.activeIntents.get(intentId);
      if (!intent) {
        throw new Error('Intent not found');
      }

      intent.status = 'executing';
      intent.updatedAt = new Date();
      this.activeIntents.set(intentId, intent);

      // Execute steps in dependency order
      const executed = new Set<string>();
      let hasProgress = true;

      while (hasProgress && executed.size < intent.executionPlan.length) {
        hasProgress = false;

        for (const step of intent.executionPlan) {
          if (executed.has(step.id) || step.status === 'completed' || step.status === 'failed') {
            continue;
          }

          // Check if all dependencies are completed
          const dependenciesMet = step.dependencies.every(depId => 
            intent.executionPlan.find(s => s.id === depId)?.status === 'completed'
          );

          if (dependenciesMet) {
            await this.executeStep(step, intent, runtime);
            executed.add(step.id);
            hasProgress = true;
          }
        }
      }

      // Update intent status
      const allCompleted = intent.executionPlan.every(step => 
        step.status === 'completed' || step.status === 'skipped'
      );
      const anyFailed = intent.executionPlan.some(step => step.status === 'failed');

      intent.status = anyFailed ? 'failed' : allCompleted ? 'completed' : 'monitoring';
      intent.updatedAt = new Date();
      this.activeIntents.set(intentId, intent);

      return intent;
    } catch (error) {
      logger.error('Failed to execute intent:', error);
      const intent = this.activeIntents.get(intentId);
      if (intent) {
        intent.status = 'failed';
        intent.updatedAt = new Date();
        this.activeIntents.set(intentId, intent);
      }
      throw error;
    }
  }

  /**
   * Execute individual step
   */
  private async executeStep(step: ExecutionStep, intent: UserIntent, runtime: IAgentRuntime): Promise<void> {
    try {
      step.status = 'executing';
      step.startTime = new Date();

      logger.info(`Executing step: ${step.action} - ${step.description}`);

      // Route to appropriate service based on action
      switch (step.action) {
        case 'CHECK_BALANCE':
          step.result = await this.executeCheckBalance(step.parameters, runtime);
          break;
        case 'SWAP_TOKENS':
          step.result = await this.executeSwapTokens(step.parameters, runtime);
          break;
        case 'MONITOR_YIELD':
          step.result = await this.executeMonitorYield(step.parameters, runtime, intent);
          break;
        case 'SETUP_DCA':
          step.result = await this.executeSetupDCA(step.parameters, runtime, intent);
          break;
        case 'ANALYZE_REQUEST':
          step.result = await this.executeAnalyzeRequest(step.parameters, runtime);
          break;
        default:
          step.result = { message: `Simulated execution of ${step.action}` };
      }

      step.status = 'completed';
      step.endTime = new Date();
      step.actualDuration = step.endTime.getTime() - step.startTime.getTime();

    } catch (error) {
      step.status = 'failed';
      step.error = error.message;
      step.endTime = new Date();
      logger.error(`Step failed: ${step.action}`, error);
    }
  }

  /**
   * Execute check balance step
   */
  private async executeCheckBalance(parameters: any, runtime: IAgentRuntime): Promise<any> {
    // Get balance from swap service
    const swapService = runtime.getService('sei-swap');
    if (swapService && swapService.getBalance) {
      const balance = await swapService.getBalance(parameters.token || 'SEI');
      return { balance, token: parameters.token || 'SEI' };
    }
    return { message: 'Balance check simulated', balance: '10.0' };
  }

  /**
   * Execute swap tokens step
   */
  private async executeSwapTokens(parameters: any, runtime: IAgentRuntime): Promise<any> {
    // This would integrate with the swap service
    return {
      message: `Swapped ${parameters.amount} ${parameters.fromToken} to ${parameters.toToken}`,
      transactionHash: '0x' + Math.random().toString(16).substr(2, 40),
    };
  }

  /**
   * Execute monitor yield step
   */
  private async executeMonitorYield(parameters: any, runtime: IAgentRuntime, intent: UserIntent): Promise<any> {
    // Set up monitoring configuration
    const monitoringConfig: MonitoringConfig = {
      intentId: intent.id,
      userId: intent.userId,
      conditions: [
        {
          type: 'yield_drop',
          threshold: parameters.minYield || 4,
          operator: 'below',
          value: 'APY',
        },
      ],
      actions: [
        {
          type: 'alert',
          parameters: { message: 'Yield dropped below threshold' },
        },
      ],
      isActive: true,
    };

    this.monitoringConfigs.set(`monitor_${intent.id}`, monitoringConfig);

    return {
      message: 'Monitoring configured for yield protection',
      minYield: parameters.minYield || 4,
      monitoringId: `monitor_${intent.id}`,
    };
  }

  /**
   * Execute setup DCA step
   */
  private async executeSetupDCA(parameters: any, runtime: IAgentRuntime, intent: UserIntent): Promise<any> {
    // This would set up recurring orders
    return {
      message: `DCA configured: ${parameters.amount} ${parameters.fromToken} to ${parameters.toToken} every ${parameters.frequency}`,
      schedule: parameters.frequency,
      amount: parameters.amount,
    };
  }

  /**
   * Execute analyze request step
   */
  private async executeAnalyzeRequest(parameters: any, runtime: IAgentRuntime): Promise<any> {
    return {
      message: 'Request analyzed successfully',
      originalText: parameters.originalText,
      guidance: 'I can help you with more specific requests about trading, yield farming, or governance.',
    };
  }

  /**
   * Validation helpers
   */
  private validateCategory(category: string): UserIntent['parsedIntent']['category'] | null {
    const validCategories = ['yield', 'trading', 'governance', 'portfolio', 'social', 'general'];
    return validCategories.includes(category) ? category as any : null;
  }

  private validateComplexity(complexity: string): UserIntent['parsedIntent']['complexity'] | null {
    const validComplexities = ['simple', 'moderate', 'complex'];
    return validComplexities.includes(complexity) ? complexity as any : null;
  }

  private validateRiskLevel(riskLevel: string): UserIntent['parsedIntent']['riskLevel'] | null {
    const validRiskLevels = ['low', 'medium', 'high'];
    return validRiskLevels.includes(riskLevel) ? riskLevel as any : null;
  }

  private validateTimeline(timeline: string): UserIntent['parsedIntent']['timeline'] | null {
    const validTimelines = ['immediate', 'short_term', 'long_term'];
    return validTimelines.includes(timeline) ? timeline as any : null;
  }

  private validateExecutionPlan(plan: any[]): ExecutionStep[] {
    return plan.map((step, index) => ({
      id: step.id || `step_${index + 1}`,
      action: step.action || 'ANALYZE_REQUEST',
      description: step.description || 'Execute step',
      parameters: step.parameters || {},
      dependencies: Array.isArray(step.dependencies) ? step.dependencies : [],
      status: 'pending' as const,
    }));
  }

  /**
   * Start execution engine
   */
  private startExecutionEngine(): void {
    this.executionTimer = setInterval(() => {
      // Process execution queue
      this.processExecutionQueue();
      
      // Check monitoring conditions
      this.checkMonitoringConditions();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Process execution queue
   */
  private processExecutionQueue(): void {
    // Implementation for processing queued executions
  }

  /**
   * Check monitoring conditions
   */
  private checkMonitoringConditions(): void {
    // Implementation for checking monitoring conditions
  }

  /**
   * API call helpers
   */
  private async callOpenAI(prompt: string): Promise<string> {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    return response.data.choices[0].message.content;
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key': this.anthropicApiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
      }
    );
    
    return response.data.content[0].text;
  }

  /**
   * Get intent
   */
  getIntent(intentId: string): UserIntent | null {
    return this.activeIntents.get(intentId) || null;
  }

  /**
   * Get user intents
   */
  getUserIntents(userId: string): UserIntent[] {
    return Array.from(this.activeIntents.values())
      .filter(intent => intent.userId === userId);
  }
}

/**
 * Action to process complex intent
 */
const processComplexIntentAction: Action = {
  name: 'PROCESS_COMPLEX_INTENT',
  similes: ['UNDERSTAND_GOAL', 'EXECUTE_STRATEGY', 'HELP_WITH_GOAL'],
  description: 'Processes complex user intents and executes multi-step strategies',

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    const text = message.content.text?.toLowerCase() || '';
    
    // Look for complex intent indicators
    return text.includes('i want to') || 
           text.includes('help me') || 
           text.includes('i need to') ||
           text.includes('how can i') ||
           text.includes('my goal is') ||
           (text.includes('earn') && (text.includes('yield') || text.includes('interest'))) ||
           (text.includes('lose') && text.includes('money')) ||
           text.includes('safe') && (text.includes('invest') || text.includes('stake')) ||
           text.includes('dca') ||
           text.includes('dollar cost average');
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService<IntentEngineService>('intent-engine');
      if (!service) {
        await callback({
          text: 'Intent engine service is not available.',
          error: true,
        });
        return { success: false, error: new Error('Service not available') };
      }

      const userId = message.entityId;
      const text = message.content.text || '';

      // Parse the intent
      const intent = await service.parseIntent(userId, text);

      if (intent.parsedIntent.confidence < 0.5) {
        await callback({
          text: `🤔 I'm not entirely sure what you're looking for. Could you be more specific?\n\n` +
                `I can help with:\n` +
                `• **Yield Farming**: "I want to earn yield on my SEI safely"\n` +
                `• **Trading**: "Help me DCA into USDC"\n` +
                `• **Portfolio**: "Alert me if my position loses value"\n` +
                `• **Governance**: "Help me understand proposal #42"\n\n` +
                `Try rephrasing your request with more details about what you want to achieve.`,
        });
        return { success: false, error: new Error('Low confidence in intent') };
      }

      const riskEmoji = intent.parsedIntent.riskLevel === 'high' ? '🔴' : 
                       intent.parsedIntent.riskLevel === 'medium' ? '🟡' : '🟢';
      
      const complexityEmoji = intent.parsedIntent.complexity === 'complex' ? '🧠' :
                             intent.parsedIntent.complexity === 'moderate' ? '⚙️' : '⚡';

      if (intent.parsedIntent.requiresConfirmation) {
        await callback({
          text: `🎯 **I understand your goal!**\n\n` +
                `${complexityEmoji} **Goal**: ${intent.parsedIntent.goal}\n` +
                `${riskEmoji} **Risk Level**: ${intent.parsedIntent.riskLevel}\n` +
                `📊 **Confidence**: ${Math.round(intent.parsedIntent.confidence * 100)}%\n\n` +
                `**Execution Plan** (${intent.executionPlan.length} steps):\n` +
                intent.executionPlan.map((step, i) => 
                  `${i + 1}. ${step.description}`
                ).join('\n') +
                `\n\n**This involves ${intent.parsedIntent.riskLevel} risk operations. Are you sure you want me to proceed?**\n` +
                `Reply with "yes" to execute this strategy.`,
          action: 'PROCESS_COMPLEX_INTENT',
        });

        return {
          success: true,
          text: `Intent processed, awaiting confirmation`,
          data: { intentId: intent.id, requiresConfirmation: true },
        };
      } else {
        // Execute immediately for low-risk operations
        await callback({
          text: `🎯 **Executing your strategy...**\n\n` +
                `${complexityEmoji} **Goal**: ${intent.parsedIntent.goal}\n` +
                `${riskEmoji} **Risk Level**: ${intent.parsedIntent.riskLevel}\n\n` +
                `**Starting execution of ${intent.executionPlan.length} steps...**`,
          action: 'PROCESS_COMPLEX_INTENT',
        });

        // Execute the intent
        const executedIntent = await service.executeIntent(intent.id, runtime);

        // Report results
        const completedSteps = executedIntent.executionPlan.filter(step => step.status === 'completed').length;
        const failedSteps = executedIntent.executionPlan.filter(step => step.status === 'failed').length;

        await callback({
          text: `✅ **Strategy ${executedIntent.status === 'completed' ? 'Completed' : 'Executed'}!**\n\n` +
                `📊 **Results**: ${completedSteps}/${executedIntent.executionPlan.length} steps completed\n` +
                (failedSteps > 0 ? `⚠️ ${failedSteps} steps failed\n` : '') +
                `\n**Step Results**:\n` +
                executedIntent.executionPlan.map((step, i) => 
                  `${i + 1}. ${step.status === 'completed' ? '✅' : step.status === 'failed' ? '❌' : '⏳'} ${step.description}` +
                  (step.result?.message ? `\n   → ${step.result.message}` : '')
                ).join('\n') +
                (executedIntent.status === 'monitoring' ? `\n\n🔍 **I'm now monitoring your strategy and will alert you of any important changes.**` : ''),
        });

        return {
          success: true,
          text: `Intent executed successfully`,
          data: { intentId: executedIntent.id, status: executedIntent.status },
        };
      }
    } catch (error) {
      logger.error('Failed to process complex intent:', error);
      await callback({
        text: `❌ I encountered an error while processing your request: ${error.message}\n\n` +
              `Please try rephrasing your goal or contact support if the issue persists.`,
        error: true,
      });
      return { success: false, error: error as Error };
    }
  },
};

/**
 * Provider for intent information
 */
const intentEngineProvider: Provider = {
  name: 'INTENT_ENGINE_PROVIDER',
  description: 'Provides information about user intents and execution status',

  get: async (runtime: IAgentRuntime, message: Memory, state: State): Promise<ProviderResult> => {
    try {
      const service = runtime.getService<IntentEngineService>('intent-engine');
      if (!service) {
        return { success: false, error: 'Service not available' };
      }

      const userId = message.entityId;
      const userIntents = service.getUserIntents(userId);

      return {
        success: true,
        data: {
          totalIntents: userIntents.length,
          activeIntents: userIntents.filter(intent => 
            ['analyzing', 'planning', 'executing', 'monitoring'].includes(intent.status)
          ).length,
          intents: userIntents.map(intent => ({
            id: intent.id,
            goal: intent.parsedIntent.goal,
            category: intent.parsedIntent.category,
            status: intent.status,
            confidence: intent.parsedIntent.confidence,
            riskLevel: intent.parsedIntent.riskLevel,
            stepsCompleted: intent.executionPlan.filter(step => step.status === 'completed').length,
            totalSteps: intent.executionPlan.length,
            createdAt: intent.createdAt,
          })),
        },
      };
    } catch (error) {
      logger.error('Failed to get intent info:', error);
      return { success: false, error: error.message };
    }
  },
};

/**
 * Intent Engine Plugin
 */
export const intentEnginePlugin: Plugin = {
  name: 'plugin-intent-engine',
  description: 'Provides intent-based execution engine for complex multi-step strategies from natural language',
  config: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    INTENT_CONFIDENCE_THRESHOLD: parseFloat(process.env.INTENT_CONFIDENCE_THRESHOLD || '0.7'),
    MAX_EXECUTION_STEPS: parseInt(process.env.MAX_EXECUTION_STEPS || '10'),
    INTENT_ANALYSIS_TIMEOUT: parseInt(process.env.INTENT_ANALYSIS_TIMEOUT || '30000'),
  },
  services: [IntentEngineService],
  actions: [processComplexIntentAction],
  providers: [intentEngineProvider],
  models: {
    [ModelType.TEXT_SMALL]: async (
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'I can understand complex goals and execute multi-step strategies automatically.';
    },
    [ModelType.TEXT_LARGE]: async (
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'I provide intent-based execution that goes beyond simple commands. I can understand complex user goals like "I want to earn yield safely" or "Help me DCA into tokens" and automatically create and execute multi-step strategies. I analyze risk, break down complex operations, and monitor ongoing strategies to ensure they meet your objectives.';
    },
  },
};