import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { generateChaptersInputSchema } from "../schemas/index.js";
import { resolveTranscript } from "../ingestion/resolver.js";
import { generateChapters } from "../analysis/chapters.js";
import { logger } from "../lib/logger.js";
import { toErrorMessage } from "../lib/errors.js";

export function registerGenerateChapters(server: McpServer): void {
  server.tool(
    "generate_chapters",
    "Generate non-spoiling YouTube chapters from a transcript. Chapters use the [Searchable Subject] + [Non-Spoiling Outcome Category] formula. The first chapter always starts at 00:00. Spoiler guard replaces reveal-type titles with curiosity categories based on spoilerPolicy.",
    {
      transcript: generateChaptersInputSchema.shape.transcript,
      context: generateChaptersInputSchema.shape.context,
      minChapterDurationSec: generateChaptersInputSchema.shape.minChapterDurationSec,
    },
    async (args) => {
      logger.info("Tool called: generate_chapters");

      try {
        const parsed = generateChaptersInputSchema.parse(args);
        const cues = await resolveTranscript(parsed.transcript);

        logger.info(`Resolved ${cues.length} transcript cues`);

        const result = generateChapters(cues, {
          minChapterDurationSec: parsed.minChapterDurationSec,
          spoilerPolicy: parsed.context.spoilerPolicy,
        });

        logger.info(`Generated ${result.chapters.length} chapters`);

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
        logger.error("generate_chapters failed", { error: message });
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
