/**
 * Bidirectional timestamp converters for SRT, VTT, and display formats.
 */

/**
 * Parses SRT/VTT timestamp strings to total seconds.
 * Supports: "01:24:30,500", "01:24:30.500", "24:30,500", "24:30.500"
 */
export function parseTimestampToSeconds(ts: string): number {
  // Normalize comma to dot for milliseconds
  const normalized = ts.replace(",", ".");
  const parts = normalized.split(":");

  if (parts.length === 3) {
    // HH:MM:SS.mmm
    const hours = parseInt(parts[0]!, 10);
    const minutes = parseInt(parts[1]!, 10);
    const seconds = parseFloat(parts[2]!);
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    // MM:SS.mmm
    const minutes = parseInt(parts[0]!, 10);
    const seconds = parseFloat(parts[1]!);
    return minutes * 60 + seconds;
  }

  throw new Error(`Invalid timestamp format: "${ts}"`);
}

/**
 * Formats seconds to "HH:MM:SS" (YouTube chapter format).
 */
export function formatSecondsToTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return `${hh}:${mm}:${ss}`;
}

/**
 * Formats seconds to "MM:SS" (compact Shorts display format).
 * For durations under 1 hour — drops the hours component.
 */
export function formatSecondsToShortTimestamp(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return `${mm}:${ss}`;
}

/**
 * Returns the duration between two timestamps in seconds.
 */
export function getDurationSeconds(startSec: number, endSec: number): number {
  return Math.max(0, endSec - startSec);
}
