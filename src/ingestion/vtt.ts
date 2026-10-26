import { parseTimestampToSeconds } from "../lib/time.js";
import { ParseError } from "../lib/errors.js";
import type { TranscriptCue } from "../schemas/index.js";

/**
 * Strips WebVTT cue payload tags and position metadata.
 */
function stripVttTags(text: string): string {
  return text
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, "") // Timestamp tags
    .replace(/<[^>]+>/g, "") // HTML tags (b, i, ruby, etc.)
    .replace(/::cue[^}]*}/g, "") // CSS cue styling
    .replace(/\{[^}]+\}/g, "") // Brace blocks
    .replace(/^\s*NOTE\s.*$/gm, "") // NOTE comments
    .trim();
}

/**
 * Parses WebVTT (.vtt) format into normalized TranscriptCue[].
 *
 * VTT formats supported:
 * - Standard: "00:00:01.000 --> 00:00:04.000"
 * - Short: "00:01.000 --> 00:04.000"
 * - With settings: "00:01.000 --> 00:04.000 align:start position:0%"
 */
export function parseVtt(content: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];

  // Validate WebVTT header
  const firstLine = content.trimStart().split("\n")[0]?.trim() ?? "";
  if (!firstLine.startsWith("WEBVTT")) {
    throw new ParseError(
      'VTT file must begin with "WEBVTT". Content does not appear to be WebVTT format.'
    );
  }

  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n\s*\n/).filter((b) => b.trim().length > 0);

  let cueIndex = 1;

  for (const block of blocks) {
    const lines = block.trim().split("\n");

    // Skip WEBVTT header block, STYLE blocks, REGION blocks, NOTE blocks
    const firstBlockLine = lines[0]?.trim() ?? "";
    if (
      firstBlockLine.startsWith("WEBVTT") ||
      firstBlockLine.startsWith("STYLE") ||
      firstBlockLine.startsWith("REGION") ||
      firstBlockLine.startsWith("NOTE")
    ) {
      continue;
    }

    // Find timecode line
    let timecodeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.includes("-->")) {
        timecodeLineIdx = i;
        break;
      }
    }

    if (timecodeLineIdx === -1) continue;

    const timecodeLine = lines[timecodeLineIdx]!;

    // VTT timestamps can be HH:MM:SS.mmm or MM:SS.mmm
    const timecodeMatch = timecodeLine.match(
      /(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})/
    );

    if (!timecodeMatch) continue;

    let startSec: number;
    let endSec: number;
    try {
      startSec = parseTimestampToSeconds(timecodeMatch[1]!);
      endSec = parseTimestampToSeconds(timecodeMatch[2]!);
    } catch {
      continue;
    }

    const rawText = lines.slice(timecodeLineIdx + 1).join(" ");
    const text = stripVttTags(rawText);

    if (text.length > 0) {
      cues.push({ index: cueIndex++, startSec, endSec, text });
    }
  }

  if (cues.length === 0) {
    throw new ParseError(
      "No valid cues found in VTT content. Ensure the file has proper WEBVTT header and cue blocks."
    );
  }

  cues.sort((a, b) => a.startSec - b.startSec);

  return cues;
}
