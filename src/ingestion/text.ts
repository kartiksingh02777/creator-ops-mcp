import type { TranscriptCue } from "../schemas/index.js";
import { ParseError } from "../lib/errors.js";

/** Average spoken words per minute */
const WORDS_PER_MINUTE = 150;
const WORDS_PER_SECOND = WORDS_PER_MINUTE / 60;

/** Target words per synthetic cue (≈ 8 seconds of speech) */
const WORDS_PER_CUE = Math.round(WORDS_PER_SECOND * 8);

/**
 * Converts plain text into TranscriptCue[] with synthetic timecodes.
 * Splits on sentence boundaries first, then word-count windows.
 * Approximates 150 words/minute speech rate.
 */
export function parsePlainText(content: string): TranscriptCue[] {
  const cleaned = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (cleaned.length < 10) {
    throw new ParseError("Plain text transcript is too short to process (< 10 chars).");
  }

  // Split into sentences first for natural cue boundaries
  const sentences = splitIntoSentences(cleaned);

  const cues: TranscriptCue[] = [];
  let currentWords: string[] = [];
  let currentSentences: string[] = [];
  let currentStartSec = 0;
  let wordCount = 0;
  let cueIndex = 1;

  function flushCue(): void {
    if (currentSentences.length === 0 && currentWords.length === 0) return;
    const text = [...currentSentences, currentWords.join(" ")]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!text) return;

    const cueDurationSec = wordCount / WORDS_PER_SECOND;
    const endSec = currentStartSec + cueDurationSec;

    cues.push({
      index: cueIndex++,
      startSec: Math.round(currentStartSec * 10) / 10,
      endSec: Math.round(endSec * 10) / 10,
      text,
    });

    currentStartSec = endSec;
    wordCount = 0;
    currentSentences = [];
    currentWords = [];
  }

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    // If adding this sentence would exceed the cue window, flush first
    if (wordCount + words.length > WORDS_PER_CUE && wordCount > 0) {
      // Move partial words to sentence buffer, then flush
      currentSentences.push(currentWords.join(" "));
      currentWords = [];
      flushCue();
    }

    currentSentences.push(sentence);
    wordCount += words.length;

    // Flush if over window
    if (wordCount >= WORDS_PER_CUE) {
      flushCue();
    }
  }

  // Flush any remainder
  if (wordCount > 0 || currentSentences.length > 0) {
    flushCue();
  }

  if (cues.length === 0) {
    throw new ParseError("Could not extract any cues from plain text content.");
  }

  return cues;
}

/**
 * Splits text into sentence-level chunks using punctuation heuristics.
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace or end-of-string
  const raw = text.split(/(?<=[.!?])\s+(?=[A-Z"'(])/);
  return raw
    .flatMap((s) => {
      // Further split very long segments (> 50 words) on commas or semicolons
      const wordCount = s.split(/\s+/).length;
      if (wordCount > 50) {
        return s.split(/(?<=[,;:])\s+/);
      }
      return [s];
    })
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
