import { formatSecondsToTimestamp, getDurationSeconds } from "../lib/time.js";
import type { TranscriptCue, Chapter, ChapterResult } from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Spoiler guard patterns
// ---------------------------------------------------------------------------

/** Patterns that indicate a spoiler reveal in chapter titles */
const SPOILER_PATTERNS = [
  /\b(defeated|destroyed|killed|eliminated|won|lost|died|ended|revealed|discovered|solved|answered|exposed)\b/i,
  /\b(the (winner|loser|killer|murderer|culprit|answer|solution|result|ending|twist|truth) (is|was|turns out)\b)/i,
  /\b(finally|at last|it was|turns out|the twist)\b/i,
  /\b(final (boss|battle|level|round|chapter|act|scene|confrontation))\b/i,
  /\b(breaks? down|break?s? up|gives? up|fall(s)? apart|collapses?|comes? out)\b/i,
];

/** Maps reveal-indicating verbs/phrases to curiosity categories */
const SPOILER_REPLACEMENT_CATEGORIES: Record<string, string> = {
  defeated: "Strategy",
  destroyed: "Challenge",
  killed: "Conflict",
  eliminated: "Challenge",
  won: "Outcome",
  lost: "Turning Point",
  died: "Major Development",
  ended: "Resolution",
  revealed: "Discovery",
  discovered: "Discovery",
  solved: "Resolution",
  answered: "Revelation",
  exposed: "Revelation",
  winner: "Competition Climax",
  loser: "Competition Outcome",
  killer: "Story Climax",
  culprit: "Story Resolution",
  answer: "Key Insight",
  solution: "Breakthrough",
  result: "Outcome",
  ending: "Final Act",
  twist: "Major Plot Turn",
  truth: "Core Revelation",
};

// ---------------------------------------------------------------------------
// Topic shift detection
// ---------------------------------------------------------------------------

/** Signals that a new topic is beginning */
const TOPIC_SHIFT_MARKERS = [
  /^(now|next|first|second|third|finally|let('s| us)|moving on|switching to|talking about|let me (show|explain|tell|walk))/i,
  /^(chapter|part|section|step|phase|stage|the (first|second|third|next|final))/i,
  /^(so (now|let's|we're)|and (now|next|then)|with that)/i,
  /^(alright|okay|right|so|but|anyway|now that)/i,
];

const TOPIC_KEYWORDS_SHIFT_THRESHOLD = 0.35; // 35% new vocabulary signals topic shift

// ---------------------------------------------------------------------------
// Chapter title generation
// ---------------------------------------------------------------------------

/**
 * Extracts a subject noun phrase from a cue text.
 * Returns a concise, searchable subject (3–6 words ideally).
 */
function extractSubject(cues: TranscriptCue[]): string {
  const firstMeaningfulCue = cues.find((c) => c.text.split(/\s+/).length >= 4);
  if (!firstMeaningfulCue) return cues[0]?.text.slice(0, 40) ?? "Introduction";

  const text = firstMeaningfulCue.text;

  // Clean up and extract first meaningful sentence fragment
  const cleaned = text
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Take up to first 6 words as subject
  const words = cleaned.split(" ").slice(0, 6);

  // Capitalize properly
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join(" ");
}

/**
 * Determines a non-spoiling outcome category for a chapter.
 */
function inferCategory(cues: TranscriptCue[], spoilerPolicy: string): {
  category: string;
  spoilerGuarded: boolean;
} {
  const fullText = cues.map((c) => c.text).join(" ");

  // Check for spoiler content
  const hasSpoiler = SPOILER_PATTERNS.some((re) => re.test(fullText));

  if (hasSpoiler && spoilerPolicy !== "none") {
    // Find the matched spoiler word and replace with curiosity category
    for (const [word, replacement] of Object.entries(SPOILER_REPLACEMENT_CATEGORIES)) {
      const re = new RegExp(`\\b${word}\\b`, "i");
      if (re.test(fullText)) {
        return { category: replacement, spoilerGuarded: true };
      }
    }
    return { category: "Key Moment", spoilerGuarded: true };
  }

  // Infer category from content signals
  if (/\b(introduction|intro|overview|what is|what are|setting up)\b/i.test(fullText)) {
    return { category: "Introduction", spoilerGuarded: false };
  }
  if (/\b(step \d|how to|tutorial|guide|walkthrough|demo|demonstration)\b/i.test(fullText)) {
    return { category: "Walkthrough", spoilerGuarded: false };
  }
  if (/\b(problem|issue|challenge|struggle|fail|mistake|error)\b/i.test(fullText)) {
    return { category: "Challenge", spoilerGuarded: false };
  }
  if (/\b(tip|trick|hack|shortcut|secret|advice|recommend)\b/i.test(fullText)) {
    return { category: "Key Insight", spoilerGuarded: false };
  }
  if (/\b(result|outcome|conclusion|summary|recap|takeaway|lesson)\b/i.test(fullText)) {
    return { category: "Takeaways", spoilerGuarded: false };
  }
  if (/\b(question|answer|faq|explain|why|how|what)\b/i.test(fullText)) {
    return { category: "Explanation", spoilerGuarded: false };
  }

  return { category: "Discussion", spoilerGuarded: false };
}

// ---------------------------------------------------------------------------
// Topic segmentation
// ---------------------------------------------------------------------------

function detectTopicShift(
  prevCues: TranscriptCue[],
  nextCue: TranscriptCue
): boolean {
  // Check for explicit topic shift markers in the cue
  if (TOPIC_SHIFT_MARKERS.some((re) => re.test(nextCue.text))) {
    return true;
  }

  if (prevCues.length === 0) return false;

  // Vocabulary shift: if the new cue introduces >35% new words vs previous window
  const prevWords = new Set(
    prevCues
      .slice(-5)
      .flatMap((c) =>
        c.text
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 4)
      )
  );

  const newWords = nextCue.text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4);

  if (newWords.length === 0) return false;

  const novelWords = newWords.filter((w) => !prevWords.has(w));
  return novelWords.length / newWords.length > TOPIC_KEYWORDS_SHIFT_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Main chapter generation function
// ---------------------------------------------------------------------------

export function generateChapters(
  cues: TranscriptCue[],
  options: {
    minChapterDurationSec: number;
    spoilerPolicy: string;
  }
): ChapterResult {
  const { minChapterDurationSec, spoilerPolicy } = options;

  if (cues.length === 0) {
    return { chapters: [], totalDurationSec: 0, spoilerPolicy };
  }

  // Build segments by detecting topic shifts
  const segments: TranscriptCue[][] = [];
  let currentSegment: TranscriptCue[] = [cues[0]!];

  for (let i = 1; i < cues.length; i++) {
    const cue = cues[i]!;
    const segmentDuration = getDurationSeconds(
      currentSegment[0]!.startSec,
      cue.startSec
    );

    const shouldShift =
      segmentDuration >= minChapterDurationSec &&
      detectTopicShift(currentSegment, cue);

    if (shouldShift) {
      segments.push([...currentSegment]);
      currentSegment = [cue];
    } else {
      currentSegment.push(cue);
    }
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  // Merge very short trailing segments into the previous one
  const merged: TranscriptCue[][] = [];
  for (const seg of segments) {
    const duration = getDurationSeconds(
      seg[0]!.startSec,
      seg[seg.length - 1]!.endSec
    );
    if (duration < minChapterDurationSec && merged.length > 0) {
      // Merge into previous segment
      merged[merged.length - 1]!.push(...seg);
    } else {
      merged.push(seg);
    }
  }

  // Build Chapter objects
  const chapters: Chapter[] = merged.map((seg, idx) => {
    const firstCue = seg[0]!;
    const subject = extractSubject(seg);
    const { category, spoilerGuarded } = inferCategory(seg, spoilerPolicy);

    return {
      index: idx + 1,
      startSec: idx === 0 ? 0 : firstCue.startSec, // First chapter ALWAYS at 00:00
      startTimestamp: idx === 0 ? "00:00:00" : formatSecondsToTimestamp(firstCue.startSec),
      title: `${subject} — ${category}`,
      subject,
      category,
      spoilerGuarded,
    };
  });

  // Ensure first chapter starts at exactly 00:00 per YouTube requirements
  if (chapters.length > 0) {
    chapters[0]!.startSec = 0;
    chapters[0]!.startTimestamp = "00:00:00";
  }

  const totalDurationSec =
    (cues[cues.length - 1]?.endSec ?? 0) - (cues[0]?.startSec ?? 0);

  return { chapters, totalDurationSec, spoilerPolicy };
}
