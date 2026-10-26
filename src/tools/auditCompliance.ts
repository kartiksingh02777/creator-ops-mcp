import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { auditComplianceInputSchema } from "../schemas/index.js";
import { resolveTranscript } from "../ingestion/resolver.js";
import { auditCompliance } from "../analysis/compliance.js";
import { logger } from "../lib/logger.js";
import { toErrorMessage } from "../lib/errors.js";

export function registerAuditCompliance(server: McpServer): void {
  server.tool(
    "audit_compliance",
    "Scan a transcript and optional metadata for compliance risks before publishing. Detects clickbait overpromise, profanity/demonetization triggers, sensitive claims (medical/financial/legal), PII leaks (phone, email, SSN), and copyright signals. Returns overall risk level, per-flag severities, monetization safety, and publish-readiness.",
    {
      transcript: auditComplianceInputSchema.shape.transcript,
      metadata: auditComplianceInputSchema.shape.metadata,
    },
    async (args) => {
      logger.info("Tool called: audit_compliance");

      try {
        const parsed = auditComplianceInputSchema.parse(args);
        const cues = await resolveTranscript(parsed.transcript);

        logger.info(`Resolved ${cues.length} transcript cues`);

        const result = auditCompliance(cues, parsed.metadata);

        logger.info(
          `Compliance audit complete: ${result.overallRisk} risk, ${result.flags.length} flags`
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
        logger.error("audit_compliance failed", { error: message });
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
