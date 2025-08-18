import { logger, type IAgentRuntime, type Project, type ProjectAgent } from '@elizaos/core';
import { seiSwapPlugin } from './swap.ts';
import { seiNFTPlugin } from './nft.ts';
import { seiGovernancePlugin } from './gov.ts';
import { notificationPlugin } from './notification.ts';
import { seiPerpetualTradingPlugin } from './trade.ts';
import { character } from './character.ts';
import { ProjectStarterTestSuite } from './__tests__/e2e/project-starter.e2e.ts';

const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info('Initializing character');
  logger.info({ name: character.name }, 'Name:');
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  plugins: [
    seiSwapPlugin, 
    seiNFTPlugin, 
    seiGovernancePlugin, 
    notificationPlugin, 
    seiPerpetualTradingPlugin
  ], 
  tests: [ProjectStarterTestSuite], // Export tests from ProjectAgent
};

const project: Project = {
  agents: [projectAgent],
};

export { character } from './character.ts';

export default project;
