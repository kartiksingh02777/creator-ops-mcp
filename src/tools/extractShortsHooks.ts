import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { extractShortsHooksInputSchema } from "../schemas/index.js";
import { resolveTranscript } from "../ingestion/resolver.js";
import { analyzeHooks } from "../analysis/hooks.js";
import { logger } from "../lib/logger.js";
import { toErrorMessage } from "../lib/errors.js";

export function registerExtractShortsHooks(server: McpServer): void {
  server.tool(
    "extract_shorts_hooks",
    "Analyze a transcript and return ranked YouTube Shorts candidates scored by the ShortScore formula (0.30·H + 0.20·R + 0.20·E + 0.15·P + 0.10·C + 0.05·S). Applies hard rejection rules for filler starts, dangling pronouns, and dead zones.",
    {
      transcript: extractShortsHooksInputSchema.shape.transcript,
      context: extractShortsHooksInputSchema.shape.context,
      maxResults: extractShortsHooksInputSchema.shape.maxResults,
    },
    async (args) => {
      logger.info("Tool called: extract_shorts_hooks");

      try {
        const parsed = extractShortsHooksInputSchema.parse(args);
        const cues = await resolveTranscript(parsed.transcript);

        logger.info(`Resolved ${cues.length} transcript cues`);

        const result = analyzeHooks(cues, {
          targetDurationSec: parsed.context.targetDurationSec,
          maxResults: parsed.maxResults,
        });

        logger.info(
          `Analysis complete: ${result.candidates.length} candidates, ${result.totalRejected} rejected`
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = toErrorMessage(err);
        logger.error("extract_shorts_hooks failed", { error: message });
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
