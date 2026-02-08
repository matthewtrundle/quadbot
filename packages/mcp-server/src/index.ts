#!/usr/bin/env node

// Load config first (triggers dotenv + validation)
import './config.js';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAllTools } from './tools/index.js';
import { closeRedis } from './redis.js';

const server = new McpServer({
  name: 'quadbot',
  version: '0.0.1',
});

// Register all 20 tools
registerAllTools(server);

// All logging must go to stderr (stdout is the MCP protocol channel)
const log = (...args: unknown[]) => console.error('[mcp-server]', ...args);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('QuadBot MCP server running on stdio');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  log('Shutting down...');
  await closeRedis();
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('Shutting down...');
  await closeRedis();
  await server.close();
  process.exit(0);
});

main().catch((err) => {
  log('Fatal error:', err);
  process.exit(1);
});
