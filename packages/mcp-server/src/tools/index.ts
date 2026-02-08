import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBrandTools } from './brands.js';
import { registerJobTools } from './jobs.js';
import { registerRecommendationTools } from './recommendations.js';
import { registerActionTools } from './actions.js';
import { registerMonitoringTools } from './monitoring.js';
import { registerSystemTools } from './system.js';

export function registerAllTools(server: McpServer) {
  registerBrandTools(server);
  registerJobTools(server);
  registerRecommendationTools(server);
  registerActionTools(server);
  registerMonitoringTools(server);
  registerSystemTools(server);
}
