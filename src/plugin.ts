import type { Plugin } from '@elizaos/core';
import { seiSwapPlugin } from './swap.ts';
import { seiGovernancePlugin } from './gov.ts';
import { notificationPlugin } from './notification.ts';
import { seiPerpetualTradingPlugin } from './trade.ts';

// Combine all actions from all plugins
const actions = [
  ...(seiSwapPlugin.actions || []),
  ...(seiGovernancePlugin.actions || []),
  ...(notificationPlugin.actions || []),
  ...(seiPerpetualTradingPlugin.actions || []),
];

// Combine all providers from all plugins
const providers = [
  ...(seiSwapPlugin.providers || []),
  ...(seiGovernancePlugin.providers || []),
  ...(notificationPlugin.providers || []),
  ...(seiPerpetualTradingPlugin.providers || []),
];

// Combine all evaluators from all plugins
const evaluators = [
  ...(seiSwapPlugin.evaluators || []),
  ...(seiGovernancePlugin.evaluators || []),
  ...(notificationPlugin.evaluators || []),
  ...(seiPerpetualTradingPlugin.evaluators || []),
];

// Combine all services from all plugins
const services = [
  ...(seiSwapPlugin.services || []),
  ...(seiGovernancePlugin.services || []),
  ...(notificationPlugin.services || []),
  ...(seiPerpetualTradingPlugin.services || []),
];

// Combine all models from all plugins
const models = {
  ...(seiSwapPlugin.models || {}),
  ...(seiGovernancePlugin.models || {}),
  ...(notificationPlugin.models || {}),
  ...(seiPerpetualTradingPlugin.models || {}),
};

// Combined plugin configuration
const plugin: Plugin = {
  name: 'starter',
  description: 'A starter plugin for Eliza',
  config: {
    EXAMPLE_PLUGIN_VARIABLE: {
      type: 'string',
      required: false,
      description: 'An example plugin variable',
    },
  },
  actions,
  providers,
  evaluators,
  services,
  models,
};

// Export the StarterService from one of the plugins for compatibility
export { SeiSwapService as StarterService } from './swap.ts';

export default plugin;