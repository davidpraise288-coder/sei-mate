import { logger, type IAgentRuntime, type Project, type ProjectAgent } from '@elizaos/core';
import { seiSwapPlugin } from './swap.ts';
import { seiGovernancePlugin } from './gov.ts';
import { notificationPlugin } from './notification.ts';
import { seiPerpetualTradingPlugin } from './trade.ts';
import { embeddedWalletPlugin } from './embedded-wallet.ts';
import { groupSwapsPlugin } from './group-swaps.ts';
import { collaborativeGovernancePlugin } from './collaborative-governance.ts';
import { intentEnginePlugin } from './intent-engine.ts';
import { autonomousGoalsPlugin } from './autonomous-goals.ts';
import { character } from './character.ts';
import { ProjectStarterTestSuite } from './__tests__/e2e/project-starter.e2e.ts';

const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info('Initializing SEI Mate with advanced strategies');
  logger.info({ name: character.name }, 'Agent Name:');
  logger.info('🚀 Advanced features loaded: Embedded wallets, Group swaps, AI governance, Intent engine, Autonomous goals');
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  plugins: [
    // Core SEI blockchain functionality
    seiSwapPlugin, 
    seiGovernancePlugin, 
    notificationPlugin, 
    seiPerpetualTradingPlugin,
    
    // Advanced "SeiBot Killer" strategies
    embeddedWalletPlugin,        // Strategy 1: Zero-friction onboarding
    groupSwapsPlugin,            // Strategy 2: Social DeFi - crowdbuys
    collaborativeGovernancePlugin, // Strategy 2: AI-powered governance
    intentEnginePlugin,          // Strategy 3: Intent-based execution
    autonomousGoalsPlugin,       // Strategy 3: Autonomous goal-seeking
  ], 
  tests: [ProjectStarterTestSuite], // Export tests from ProjectAgent
};

const project: Project = {
  agents: [projectAgent],
};

export { character } from './character.ts';

export default project;
