import { parseTimestampToSeconds } from "../lib/time.js";
import { ParseError } from "../lib/errors.js";
import type { TranscriptCue } from "../schemas/index.js";

/**
 * Parses SubRip (.srt) format into normalized TranscriptCue[].
 *
 * SRT block format:
 * ```
 * 1
 * 00:00:01,000 --> 00:00:04,000
 * Hello world
 * ```
 */
export function parseSrt(content: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];

  // Normalize line endings and split into blocks by blank lines
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n\s*\n/).filter((b) => b.trim().length > 0);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;

    // Find the timecode line (contains " --> ")
    let timecodeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.includes("-->")) {
        timecodeLineIdx = i;
        break;
      }
    }

    if (timecodeLineIdx === -1) continue;

    // Parse index (line before timecode, or use cue array length)
    const indexLine = timecodeLineIdx > 0 ? lines[timecodeLineIdx - 1]!.trim() : "";
    const index = /^\d+$/.test(indexLine)
      ? parseInt(indexLine, 10)
      : cues.length + 1;

    // Parse timecodes
    const timecodeLine = lines[timecodeLineIdx]!;
    const timecodeMatch = timecodeLine.match(
      /(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,\.]\d{1,3})/
    );

    if (!timecodeMatch) {
      throw new ParseError(`Invalid SRT timecode line: "${timecodeLine}"`);
    }

    let startSec: number;
    let endSec: number;
    try {
      startSec = parseTimestampToSeconds(timecodeMatch[1]!);
      endSec = parseTimestampToSeconds(timecodeMatch[2]!);
    } catch {
      throw new ParseError(`Could not parse timestamps in: "${timecodeLine}"`);
    }

    // Text is everything after the timecode line
    const textLines = lines.slice(timecodeLineIdx + 1);
    const text = textLines
      .join(" ")
      .replace(/<[^>]+>/g, "") // Strip HTML/styling tags
      .replace(/\{[^}]+\}/g, "") // Strip ASS override blocks
      .trim();

    if (text.length > 0) {
      cues.push({ index, startSec, endSec, text });
    }
  }

  if (cues.length === 0) {
    throw new ParseError(
      "No valid cues found in SRT content. Ensure the file has proper index, timecode, and text blocks."
    );
  }

  // Sort by start time to guarantee ascending order
  cues.sort((a, b) => a.startSec - b.startSec);

  return cues;
}
