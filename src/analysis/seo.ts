import type {
  TranscriptCue,
  SeoMetadataResult,
  TitleArchetype,
  ThumbnailBrief,
} from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Topic extraction helpers
// ---------------------------------------------------------------------------

/** Stop words to exclude from topic extraction */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "this", "that", "these", "those", "it", "its",
  "i", "you", "we", "they", "he", "she", "me", "him", "her", "us", "them",
  "my", "your", "our", "their", "his", "her", "its", "so", "if", "then",
  "just", "like", "well", "also", "now", "here", "there", "can", "get",
  "got", "go", "going", "about", "up", "out", "into", "more", "very",
]);

interface TopicExtracts {
  mainSubject: string;
  mainAction: string;
  keyBenefit: string;
  specificNumber?: string;
  timeframe?: string;
  targetAudience?: string;
}

function extractTopics(cues: TranscriptCue[]): TopicExtracts {
  const fullText = cues.map((c) => c.text).join(" ");
  const words = fullText.toLowerCase().split(/\W+/).filter(Boolean);

  // Word frequency (excluding stop words, min length 4)
  const freq = new Map<string, number>();
  for (const word of words) {
    if (word.length >= 4 && !STOP_WORDS.has(word)) {
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }

  const topWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w);

  const mainSubject = capitalizeWords(topWords[0] ?? "this topic");
  const mainAction = capitalizeWords(topWords[1] ?? "improve");
  const keyBenefit = topWords[2] ? `${capitalizeWords(topWords[2])} Results` : "Better Results";

  // Extract specific numbers (e.g. "3 steps", "10x", "$1000")
  const numberMatch = fullText.match(/\b(\d+(?:,\d+)*(?:\.\d+)?(?:x|%|k|\+)?)\b/);
  const specificNumber = numberMatch?.[1];

  // Extract timeframe
  const timeMatch = fullText.match(/\b(\d+\s*(days?|weeks?|months?|years?|hours?|minutes?))\b/i);
  const timeframe = timeMatch?.[1];

  // Extract audience signals
  const audiencePatterns: Array<[RegExp, string]> = [
    [/\bbeginner(s)?\b/i, "Beginners"],
    [/\badvanced\b/i, "Advanced Users"],
    [/\bprofessional(s)?\b/i, "Professionals"],
    [/\bdeveloper(s)?\b/i, "Developers"],
    [/\bcreator(s)?\b/i, "Creators"],
    [/\bentrepreneur(s)?\b/i, "Entrepreneurs"],
  ];
  let targetAudience: string | undefined;
  for (const [re, label] of audiencePatterns) {
    if (re.test(fullText)) {
      targetAudience = label;
      break;
    }
  }

  return { mainSubject, mainAction, keyBenefit, specificNumber, timeframe, targetAudience };
}

function capitalizeWords(str: string): string {
  return str
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function truncateToLimit(title: string, limit = 60): string {
  if (title.length <= limit) return title;
  // Try to cut at word boundary
  const truncated = title.slice(0, limit - 1).replace(/\s+\S*$/, "");
  return truncated.length > 30 ? truncated : title.slice(0, limit - 1);
}

// ---------------------------------------------------------------------------
// 5 Psychological title archetypes
// ---------------------------------------------------------------------------

function buildTitleMatrix(
  topics: TopicExtracts,
  _existingTitle?: string
): TitleArchetype[] {
  const { mainSubject, mainAction, keyBenefit, specificNumber, timeframe } = topics;
  const num = specificNumber ?? "3";
  const time = timeframe ?? "30 days";

  const matrix: TitleArchetype[] = [
    {
      archetype: "curiosity_gap",
      archetypeLabel: "Curiosity Gap",
      title: truncateToLimit(`Why ${mainSubject} ${mainAction}s Everything`),
      characterCount: 0,
      psychologicalTrigger:
        "Creates information asymmetry — viewer feels they're missing a key insight",
    },
    {
      archetype: "fomo",
      archetypeLabel: "Fear of Missing Out",
      title: truncateToLimit(`You're Losing ${keyBenefit} Without This`),
      characterCount: 0,
      psychologicalTrigger:
        "Activates loss aversion — not watching = leaving value on the table",
    },
    {
      archetype: "before_after",
      archetypeLabel: "Before / After",
      title: truncateToLimit(`I Tried ${mainSubject} for ${time} — Here's What Happened`),
      characterCount: 0,
      psychologicalTrigger:
        "Social proof + personal testimony — vicarious experience reduces perceived risk",
    },
    {
      archetype: "extreme_contrast",
      archetypeLabel: "Extreme Contrast",
      title: truncateToLimit(`${mainSubject} Is Wrong — Do This Instead`),
      characterCount: 0,
      psychologicalTrigger:
        "Challenges existing beliefs — cognitive dissonance compels click-through",
    },
    {
      archetype: "authority_proof",
      archetypeLabel: "Authority / Proof",
      title: truncateToLimit(`${num} ${mainSubject} ${mainAction}s That Actually ${keyBenefit}`),
      characterCount: 0,
      psychologicalTrigger:
        "Numbered specificity + outcome = perceived expertise and completeness",
    },
  ];

  // Fill character counts
  for (const t of matrix) {
    t.characterCount = t.title.length;
  }

  return matrix;
}

// ---------------------------------------------------------------------------
// Thumbnail brief builder
// ---------------------------------------------------------------------------

function buildThumbnailBrief(
  topics: TopicExtracts,
  recommendedTitle: TitleArchetype
): ThumbnailBrief {
  const { mainSubject, keyBenefit } = topics;

  // Derive concise overlay text (3–5 words, non-repeating with title)
  const titleWords = new Set(
    recommendedTitle.title.toLowerCase().split(/\W+/).filter(Boolean)
  );
  const overlayWords = `${mainSubject} ${keyBenefit}`
    .split(" ")
    .filter((w) => !titleWords.has(w.toLowerCase()))
    .slice(0, 5);

  const textOverlay =
    overlayWords.length >= 2
      ? overlayWords.join(" ").toUpperCase()
      : mainSubject.toUpperCase();

  // Color palette based on archetype
  const palettes: Record<string, string[]> = {
    curiosity_gap: ["#FF4136", "#FFDC00", "#FFFFFF", "#111111"],
    fomo: ["#FF851B", "#001F3F", "#FFFFFF", "#AAAAAA"],
    before_after: ["#2ECC40", "#0074D9", "#FFFFFF", "#111111"],
    extreme_contrast: ["#B10DC9", "#FF4136", "#FFFFFF", "#222222"],
    authority_proof: ["#0074D9", "#FFDC00", "#FFFFFF", "#111111"],
  };

  const colorPalette =
    palettes[recommendedTitle.archetype] ?? palettes["curiosity_gap"]!;

  const composition = `Subject positioned on ${
    recommendedTitle.archetype === "authority_proof" ? "right" : "left"
  }-third of frame (40–60% of frame area), occupying vertical center. Text overlay anchored to the opposing third. Background gradient from corner.`;

  const subjectPosition: "left-third" | "right-third" | "center" =
    recommendedTitle.archetype === "authority_proof" ? "right-third" : "left-third";

  const promptMidjourney =
    `${mainSubject.toLowerCase()} concept, high energy, ${
      colorPalette[0]
    } and ${colorPalette[1]} color palette, bold typography, YouTube thumbnail style, ` +
    `rule of thirds composition, ${subjectPosition} subject, 16:9 aspect ratio, ` +
    `high contrast, photorealistic, professional lighting, --ar 16:9 --style raw`;

  const promptFlux =
    `Create a YouTube thumbnail: ${mainSubject.toLowerCase()} themed, ` +
    `dominant colors ${colorPalette[0]} and ${colorPalette[1]}, ` +
    `subject on ${subjectPosition.replace("-", " ")}, center-vertical, ` +
    `bold text "${textOverlay}" on opposite third, high contrast, ` +
    `1280x720, professional quality`;

  const negativePrompt =
    "blurry, cluttered, too much text, low contrast, ugly font, watermark, logo, " +
    "border, frame, multiple subjects fighting for attention, noisy background, dark muddy colors";

  return {
    aspectRatio: "16:9",
    resolution: "1280x720",
    composition,
    subjectPosition,
    textOverlay,
    colorPalette,
    promptMidjourney,
    promptFlux,
    negativePrompt,
  };
}

// ---------------------------------------------------------------------------
// Description and tags
// ---------------------------------------------------------------------------

function buildDescription(topics: TopicExtracts, firstCueText: string): string {
  const { mainSubject, keyBenefit } = topics;
  return (
    `In this video, we explore ${mainSubject.toLowerCase()} and how it connects to ${keyBenefit.toLowerCase()}. ` +
    `${firstCueText.slice(0, 150)}...\n\n` +
    `Timestamps are in the chapters above. Like and subscribe for more content like this.`
  );
}

function buildTags(topics: TopicExtracts): string[] {
  const { mainSubject, mainAction, keyBenefit, specificNumber, targetAudience } = topics;
  const tags = [
    mainSubject.toLowerCase(),
    mainAction.toLowerCase(),
    keyBenefit.toLowerCase(),
    `${mainSubject.toLowerCase()} tutorial`,
    `how to ${mainAction.toLowerCase()}`,
    `${mainSubject.toLowerCase()} tips`,
    `${mainSubject.toLowerCase()} guide`,
  ];

  if (specificNumber) tags.push(`${specificNumber} ${mainAction.toLowerCase()}s`);
  if (targetAudience) tags.push(targetAudience.toLowerCase());

  return [...new Set(tags)].slice(0, 15);
}

// ---------------------------------------------------------------------------
// Main SEO generation function
// ---------------------------------------------------------------------------

export function generateSeoMetadata(
  cues: TranscriptCue[],
  options: { existingTitle?: string }
): SeoMetadataResult {
  const topics = extractTopics(cues);
  const titleMatrix = buildTitleMatrix(topics, options.existingTitle);

  // Recommended = highest expected CTR (curiosity_gap for most content)
  const recommendedTitle = titleMatrix[0]!;

  const thumbnailBrief = buildThumbnailBrief(topics, recommendedTitle);

  const suggestedDescription = buildDescription(
    topics,
    cues[0]?.text ?? ""
  );
  const suggestedTags = buildTags(topics);

  return {
    titleMatrix,
    recommendedTitle,
    thumbnailBrief,
    suggestedDescription,
    suggestedTags,
  };
}
