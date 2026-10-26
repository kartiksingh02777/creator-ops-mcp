import { z } from "zod";

// ---------------------------------------------------------------------------
// Transcript input — exactly one of three sources must be provided
// ---------------------------------------------------------------------------

export const transcriptInputSchema = z
  .object({
    youtubeUrl: z
      .string()
      .url()
      .optional()
      .describe("Public YouTube video URL to extract captions from"),
    filePath: z
      .string()
      .optional()
      .describe("Local path to .srt, .vtt, or .txt transcript file"),
    rawTranscript: z
      .string()
      .min(50)
      .optional()
      .describe("Raw transcript text pasted directly (min 50 chars)"),
  })
  .refine(
    (v) =>
      [v.youtubeUrl, v.filePath, v.rawTranscript].filter(Boolean).length === 1,
    {
      message:
        "Exactly one of youtubeUrl, filePath, or rawTranscript must be provided",
    }
  );

export type TranscriptInput = z.infer<typeof transcriptInputSchema>;

// ---------------------------------------------------------------------------
// Content context
// ---------------------------------------------------------------------------

export const contentTypeSchema = z.enum([
  "tutorial",
  "podcast",
  "gaming",
  "vlog",
  "documentary",
  "review",
  "interview",
  "news",
  "entertainment",
  "education",
  "other",
]);

export const toneSchema = z.enum([
  "educational",
  "conversational",
  "hype",
  "calm",
  "comedic",
  "dramatic",
  "motivational",
  "neutral",
]);

export const spoilerPolicySchema = z.enum(["strict", "moderate", "none"]);

export const contentContextSchema = z.object({
  contentType: contentTypeSchema
    .optional()
    .default("other")
    .describe("Genre/type of the source content"),
  tone: toneSchema
    .optional()
    .default("neutral")
    .describe("Desired tone for generated titles/chapters"),
  spoilerPolicy: spoilerPolicySchema
    .optional()
    .default("strict")
    .describe("How aggressively to mask spoilers in chapter titles"),
  targetDurationSec: z
    .number()
    .int()
    .min(15)
    .max(180)
    .optional()
    .default(60)
    .describe("Target Shorts duration in seconds (15–180)"),
});

export type ContentContext = z.infer<typeof contentContextSchema>;

// ---------------------------------------------------------------------------
// Tool-specific input schemas
// ---------------------------------------------------------------------------

export const extractShortsHooksInputSchema = z.object({
  transcript: transcriptInputSchema,
  context: contentContextSchema.optional().default({}),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe("Maximum number of ranked hook candidates to return"),
});

export const generateChaptersInputSchema = z.object({
  transcript: transcriptInputSchema,
  context: contentContextSchema.optional().default({}),
  minChapterDurationSec: z
    .number()
    .int()
    .min(10)
    .max(300)
    .optional()
    .default(30)
    .describe("Minimum chapter length in seconds"),
});

export const generateSeoMetadataInputSchema = z.object({
  transcript: transcriptInputSchema,
  context: contentContextSchema.optional().default({}),
  existingTitle: z
    .string()
    .optional()
    .describe("Existing video title to improve upon"),
});

export const auditComplianceInputSchema = z.object({
  transcript: transcriptInputSchema,
  metadata: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional()
    .default({}),
});

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface TranscriptCue {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

export interface ShortCandidate {
  rank: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  startTimestamp: string;
  endTimestamp: string;
  hookText: string;
  shortScore: number;
  scoreBreakdown: {
    H: number; // Hook strength (0–20)
    R: number; // Retention arc (0–20)
    E: number; // Emotional trigger (0–20)
    P: number; // Pacing (0–15)
    C: number; // Clarity (0–10)
    S: number; // Safe-to-clip (0–5)
  };
  hookPattern: string;
  rejectionReason?: string;
}

export interface ShortHookResult {
  candidates: ShortCandidate[];
  totalAnalyzed: number;
  totalRejected: number;
  rejectionSummary: Record<string, number>;
}

export interface Chapter {
  index: number;
  startSec: number;
  startTimestamp: string;
  title: string;
  subject: string;
  category: string;
  spoilerGuarded: boolean;
}

export interface ChapterResult {
  chapters: Chapter[];
  totalDurationSec: number;
  spoilerPolicy: string;
}

export interface TitleArchetype {
  archetype:
    | "curiosity_gap"
    | "fomo"
    | "before_after"
    | "extreme_contrast"
    | "authority_proof";
  archetypeLabel: string;
  title: string;
  characterCount: number;
  psychologicalTrigger: string;
}

export interface ThumbnailBrief {
  aspectRatio: "16:9";
  resolution: "1280x720";
  composition: string;
  subjectPosition: "left-third" | "right-third" | "center";
  textOverlay: string;
  colorPalette: string[];
  promptMidjourney: string;
  promptFlux: string;
  negativePrompt: string;
}

export interface SeoMetadataResult {
  titleMatrix: TitleArchetype[];
  recommendedTitle: TitleArchetype;
  thumbnailBrief: ThumbnailBrief;
  suggestedDescription: string;
  suggestedTags: string[];
}

export interface ComplianceFlag {
  severity: "low" | "medium" | "high";
  category:
    | "clickbait"
    | "profanity"
    | "demonetization"
    | "sensitive_claim"
    | "pii"
    | "copyright";
  text: string;
  suggestion: string;
  location?: string;
}

export interface ComplianceAuditResult {
  overallRisk: "clear" | "low" | "medium" | "high";
  flags: ComplianceFlag[];
  monetizationSafe: boolean;
  publishReady: boolean;
  summary: string;
}
