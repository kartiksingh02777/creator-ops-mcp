import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { generateSeoMetadataInputSchema } from "../schemas/index.js";
import { resolveTranscript } from "../ingestion/resolver.js";
import { generateSeoMetadata } from "../analysis/seo.js";
import { logger } from "../lib/logger.js";
import { toErrorMessage } from "../lib/errors.js";

export function registerGenerateSeoMetadata(server: McpServer): void {
  server.tool(
    "generate_seo_metadata",
    "Generate a 5-archetype title matrix (Curiosity Gap, FOMO, Before/After, Extreme Contrast, Authority/Proof) plus a visual thumbnail brief in Midjourney and Flux prompt formats. All titles are under 60 characters. Returns suggested description and tags.",
    {
      transcript: generateSeoMetadataInputSchema.shape.transcript,
      context: generateSeoMetadataInputSchema.shape.context,
      existingTitle: generateSeoMetadataInputSchema.shape.existingTitle,
    },
    async (args) => {
      logger.info("Tool called: generate_seo_metadata");

      try {
        const parsed = generateSeoMetadataInputSchema.parse(args);
        const cues = await resolveTranscript(parsed.transcript);

        logger.info(`Resolved ${cues.length} transcript cues`);

        const result = generateSeoMetadata(cues, {
          existingTitle: parsed.existingTitle,
        });

        logger.info("SEO metadata generation complete");

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
        logger.error("generate_seo_metadata failed", { error: message });
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
