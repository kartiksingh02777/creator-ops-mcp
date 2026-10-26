import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { logger } from "./lib/logger.js";

/**
 * Entry point: connects the MCP server to stdio transport.
 * All logging goes to stderr. stdout is reserved exclusively for MCP JSON-RPC.
 */
async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  logger.info("Starting creator-ops-mcp server on stdio transport...");

  await server.connect(transport);

  logger.info("creator-ops-mcp server running. Waiting for MCP client connections.");
}

main().catch((err: unknown) => {
  logger.error("Fatal server error", err);
  process.exit(1);
});
