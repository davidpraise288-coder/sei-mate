import { logger, type IAgentRuntime, type Project, type ProjectAgent } from '@elizaos/core';
import { simpleDemoPlugin } from './simple-demo.ts';
import { simpleCharacter } from './simple-character.ts';

const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info('Initializing Simple SEI Mate Demo');
  logger.info({ name: simpleCharacter.name }, 'Character Name:');
};

export const simpleProjectAgent: ProjectAgent = {
  character: simpleCharacter,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  plugins: [simpleDemoPlugin],
  tests: [], // No tests for simple demo
};

const simpleProject: Project = {
  agents: [simpleProjectAgent],
};

export { simpleCharacter } from './simple-character.ts';
export { simpleDemoPlugin } from './simple-demo.ts';

export default simpleProject;