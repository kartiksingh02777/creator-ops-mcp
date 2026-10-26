import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExtractShortsHooks } from "./tools/extractShortsHooks.js";
import { registerGenerateChapters } from "./tools/generateChapters.js";
import { registerGenerateSeoMetadata } from "./tools/generateSeoMetadata.js";
import { registerAuditCompliance } from "./tools/auditCompliance.js";
import { logger } from "./lib/logger.js";

/**
 * Creates and configures the creator-ops MCP server with all registered tools.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "creator-ops-mcp",
    version: "0.1.0",
  });

  logger.info("Registering MCP tools...");

  registerExtractShortsHooks(server);
  registerGenerateChapters(server);
  registerGenerateSeoMetadata(server);
  registerAuditCompliance(server);

  logger.info("All tools registered: extract_shorts_hooks, generate_chapters, generate_seo_metadata, audit_compliance");

  return server;
}
