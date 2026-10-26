import type {
  TranscriptCue,
  ComplianceAuditResult,
  ComplianceFlag,
} from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

interface ComplianceRule {
  category: ComplianceFlag["category"];
  severity: ComplianceFlag["severity"];
  patterns: RegExp[];
  suggestion: string;
}

const COMPLIANCE_RULES: ComplianceRule[] = [
  // Clickbait overpromise
  {
    category: "clickbait",
    severity: "medium",
    patterns: [
      /\b(100%|guaranteed|proven to|instantly|overnight|never fails|foolproof|works every time)\b/i,
      /\b(you won't believe|mind-blowing|insane results|life-changing|revolutionary|game-changing)\b/i,
      /\b(doctors (don't|won't|hate)|they (don't|won't) tell you|banned|suppressed|censored)\b/i,
    ],
    suggestion:
      "Use evidence-based language. Replace absolute claims with qualified statements (e.g., 'can help', 'may improve').",
  },

  // Profanity / demonetization
  {
    category: "profanity",
    severity: "high",
    patterns: [
      /\b(f+u+c+k+|sh[i1]t|b[i1]tch|a+s+s+h+o+l+e+|c[u0]nt|d[i1]ck|p[i1]ss)\b/i,
      /\b(wtf|stfu|lmfao|omfg)\b/i,
    ],
    suggestion:
      "Remove or bleep profanity. YouTube may limit monetization or restrict the video's reach.",
  },

  // Demonetization trigger words (YouTube ad-unsafe)
  {
    category: "demonetization",
    severity: "medium",
    patterns: [
      /\b(suicide|self-harm|self harm|eating disorder|anorex|bulimic|cutting yourself)\b/i,
      /\b(bomb|explosive|shoot (up|them)|mass shooting|terrorist|kill (yourself|them all))\b/i,
      /\b(cocaine|heroin|meth|fentanyl|crack cocaine|crystal meth)\b/i,
      /\b(rape|sexual assault|molest)\b/i,
    ],
    suggestion:
      "This topic may trigger YouTube's advertiser-sensitive content guidelines. Add a content warning and consider adjusting phrasing.",
  },

  // Sensitive claims
  {
    category: "sensitive_claim",
    severity: "medium",
    patterns: [
      /\b(cures?|treats?|prevents?|heals?)\s+(cancer|diabetes|depression|anxiety|covid|autism)\b/i,
      /\b(guaranteed (to|weight loss|income|returns?|profit))\b/i,
      /\b(investment advice|financial advice|buy|sell) .{0,30}\b(stock|crypto|bitcoin|forex)\b/i,
      /\b(legal advice|you should (sue|file|legally))\b/i,
    ],
    suggestion:
      "Add appropriate disclaimers: 'This is not medical/financial/legal advice. Consult a professional before...'",
  },

  // PII leaks
  {
    category: "pii",
    severity: "high",
    patterns: [
      /\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b/, // Phone numbers
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email addresses
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN format
      /\b4[0-9]{12}(?:[0-9]{3})?\b/, // Visa card pattern
      /\b5[1-5][0-9]{14}\b/, // MasterCard pattern
    ],
    suggestion:
      "Remove or blur personally identifiable information before publishing. Edit the transcript and re-export.",
  },

  // Copyright risk signals
  {
    category: "copyright",
    severity: "low",
    patterns: [
      /\b(playing now|now playing|this song|this track)\b/i,
      /\b(from the (movie|film|show|series|album))\b/i,
      /\b(copyright (c|\(c\))|\(tm\)|\u00AE)\b/i,
    ],
    suggestion:
      "Ensure any music, film clips, or branded content used is either licensed, royalty-free, or falls under fair use.",
  },
];

// ---------------------------------------------------------------------------
// Metadata-specific rules
// ---------------------------------------------------------------------------

interface MetadataRule {
  category: ComplianceFlag["category"];
  severity: ComplianceFlag["severity"];
  test: (title: string, description: string, tags: string[]) => string | null;
  suggestion: string;
}

const METADATA_RULES: MetadataRule[] = [
  {
    category: "clickbait",
    severity: "medium",
    test: (title) => {
      if (/^(\?+|!!+|[A-Z]{10,})/.test(title)) return title;
      if (title.endsWith("...") && !/\b(more|continued)\b/i.test(title))
        return title;
      return null;
    },
    suggestion:
      "Title appears to use aggressive clickbait formatting. Consider a more informative title structure.",
  },
  {
    category: "clickbait",
    severity: "low",
    test: (title) => {
      if (title.length > 100) return title;
      return null;
    },
    suggestion:
      "Title exceeds 100 characters. YouTube truncates titles in search results at ~70 characters.",
  },
];

// ---------------------------------------------------------------------------
// Main audit function
// ---------------------------------------------------------------------------

function extractContext(
  text: string,
  matchIndex: number,
  contextWindow = 40
): string {
  const start = Math.max(0, matchIndex - contextWindow);
  const end = Math.min(text.length, matchIndex + contextWindow);
  return `...${text.slice(start, end).trim()}...`;
}

export function auditCompliance(
  cues: TranscriptCue[],
  metadata: {
    title?: string;
    description?: string;
    tags?: string[];
  }
): ComplianceAuditResult {
  const flags: ComplianceFlag[] = [];
  const fullTranscript = cues.map((c) => c.text).join(" ");

  // Scan transcript
  for (const rule of COMPLIANCE_RULES) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(fullTranscript);
      if (match) {
        const location = `Transcript ~${Math.round((match.index / fullTranscript.length) * 100)}% in`;
        flags.push({
          severity: rule.severity,
          category: rule.category,
          text: extractContext(fullTranscript, match.index),
          suggestion: rule.suggestion,
          location,
        });
        break; // One flag per rule per source
      }
    }
  }

  // Scan metadata
  const title = metadata.title ?? "";
  const description = metadata.description ?? "";
  const tags = metadata.tags ?? [];
  const metaText = `${title} ${description} ${tags.join(" ")}`;

  for (const rule of COMPLIANCE_RULES) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(metaText);
      if (match) {
        flags.push({
          severity: rule.severity,
          category: rule.category,
          text: extractContext(metaText, match.index),
          suggestion: rule.suggestion,
          location: "Metadata",
        });
        break;
      }
    }
  }

  // Metadata-specific rules
  for (const rule of METADATA_RULES) {
    const matched = rule.test(title, description, tags);
    if (matched) {
      flags.push({
        severity: rule.severity,
        category: rule.category,
        text: matched.slice(0, 80),
        suggestion: rule.suggestion,
        location: "Title",
      });
    }
  }

  // Deduplicate flags by category+location
  const seen = new Set<string>();
  const deduped = flags.filter((f) => {
    const key = `${f.category}-${f.location ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Calculate overall risk
  const hasHigh = deduped.some((f) => f.severity === "high");
  const hasMedium = deduped.some((f) => f.severity === "medium");

  let overallRisk: ComplianceAuditResult["overallRisk"];
  if (hasHigh) overallRisk = "high";
  else if (hasMedium) overallRisk = "medium";
  else if (deduped.length > 0) overallRisk = "low";
  else overallRisk = "clear";

  const monetizationSafe =
    !deduped.some(
      (f) => f.severity === "high" || f.category === "demonetization"
    );
  const publishReady = overallRisk !== "high";

  const flagCount = deduped.length;
  const summary =
    flagCount === 0
      ? "No compliance issues found. Content appears safe to publish."
      : `Found ${flagCount} issue${flagCount !== 1 ? "s" : ""} (${deduped
          .filter((f) => f.severity === "high")
          .length} high, ${deduped.filter((f) => f.severity === "medium").length} medium, ${deduped.filter((f) => f.severity === "low").length} low). ` +
        (publishReady
          ? "Review recommendations before publishing."
          : "Address high-severity issues before publishing.");

  return {
    overallRisk,
    flags: deduped,
    monetizationSafe,
    publishReady,
    summary,
  };
}
