import { exec } from "child_process";
import { promisify } from "util";
import { parseVtt } from "./vtt.js";
import { parseSrt } from "./srt.js";
import { TranscriptUnavailableError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { TranscriptCue } from "../schemas/index.js";

const execAsync = promisify(exec);

/**
 * Extracts the YouTube video ID from various URL formats.
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/v\/([A-Za-z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Attempts to fetch public captions from YouTube's timedtext API (keyless).
 * Falls back to yt-dlp if installed.
 */
export async function fetchYouTubeTranscript(
  url: string
): Promise<TranscriptCue[]> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new TranscriptUnavailableError(
      `Could not extract video ID from URL: "${url}". ` +
        "Ensure the URL is a valid YouTube video URL."
    );
  }

  logger.info(`Fetching transcript for YouTube video: ${videoId}`);

  // Attempt 1: YouTube timedtext API (keyless, works for videos with auto-captions)
  try {
    const cues = await fetchViaTimedtextApi(videoId);
    logger.info(`Successfully fetched ${cues.length} cues via timedtext API`);
    return cues;
  } catch (err) {
    logger.warn("Timedtext API failed, trying yt-dlp fallback", err);
  }

  // Attempt 2: yt-dlp local binary
  try {
    const cues = await fetchViaYtDlp(videoId);
    logger.info(`Successfully fetched ${cues.length} cues via yt-dlp`);
    return cues;
  } catch (err) {
    logger.warn("yt-dlp fallback also failed", err);
  }

  throw new TranscriptUnavailableError(
    `Could not retrieve captions for YouTube video "${videoId}".\n\n` +
      "Possible reasons:\n" +
      "  1. The video has no captions/subtitles enabled\n" +
      "  2. The video is age-restricted or private\n" +
      "  3. Auto-generated captions are disabled by the creator\n\n" +
      "Alternatives:\n" +
      "  • Download the SRT/VTT from YouTube Studio and pass it via filePath\n" +
      "  • Install yt-dlp (https://github.com/yt-dlp/yt-dlp) for more robust extraction\n" +
      "  • Paste the transcript text via rawTranscript"
  );
}

/**
 * Fetches captions via YouTube's public timedtext API endpoint.
 */
async function fetchViaTimedtextApi(videoId: string): Promise<TranscriptCue[]> {
  // First, fetch the video page to find caption track URLs
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const response = await fetch(pageUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; creator-ops-mcp/0.1; +https://npmjs.com/package/creator-ops-mcp)",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`YouTube page returned HTTP ${response.status}`);
  }

  const html = await response.text();

  // Extract caption tracks from ytInitialPlayerResponse
  const captionTrackMatch = html.match(/"captionTracks":(\[.*?\])/s);
  if (!captionTrackMatch) {
    throw new Error("No captionTracks found in page source");
  }

  let tracks: Array<{ baseUrl: string; languageCode: string; kind?: string }>;
  try {
    tracks = JSON.parse(captionTrackMatch[1]!);
  } catch {
    throw new Error("Failed to parse captionTracks JSON");
  }

  if (!tracks.length) {
    throw new Error("captionTracks array is empty");
  }

  // Prefer English, then ASR (auto-generated), then first available
  const preferred =
    tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode === "en") ??
    tracks[0]!;

  // Fetch the caption XML
  const captionUrl = preferred.baseUrl + "&fmt=vtt";
  const captionResponse = await fetch(captionUrl, {
    signal: AbortSignal.timeout(10000),
  });

  if (!captionResponse.ok) {
    throw new Error(`Caption fetch returned HTTP ${captionResponse.status}`);
  }

  const vttContent = await captionResponse.text();
  return parseVtt(vttContent);
}

/**
 * Fetches captions using locally-installed yt-dlp binary.
 */
async function fetchViaYtDlp(videoId: string): Promise<TranscriptCue[]> {
  const { tmpdir } = await import("os");
  const { join } = await import("path");
  const { readFile, unlink } = await import("fs/promises");

  const tmpFile = join(tmpdir(), `creator-ops-${videoId}`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    await execAsync(
      `yt-dlp --write-auto-sub --sub-lang en --sub-format vtt --skip-download -o "${tmpFile}" "${url}"`,
      { timeout: 30000 }
    );
  } catch (err) {
    throw new Error(`yt-dlp failed: ${String(err)}`);
  }

  // yt-dlp appends language code to filename
  const vttPath = `${tmpFile}.en.vtt`;
  const srtPath = `${tmpFile}.en.srt`;

  for (const path of [vttPath, srtPath]) {
    try {
      const content = await readFile(path, "utf-8");
      await unlink(path).catch(() => {});

      if (path.endsWith(".vtt")) return parseVtt(content);
      return parseSrt(content);
    } catch {
      // Try next format
    }
  }

  throw new Error("yt-dlp ran but no caption file was produced");
}
