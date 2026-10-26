import { readFile } from "fs/promises";
import { extname } from "path";
import { parseSrt } from "./srt.js";
import { parseVtt } from "./vtt.js";
import { parsePlainText } from "./text.js";
import { fetchYouTubeTranscript } from "./youtube.js";
import {
  InvalidInputError,
  UnsupportedFileError,
  TranscriptUnavailableError,
} from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { TranscriptInput, TranscriptCue } from "../schemas/index.js";

/**
 * Resolves any TranscriptInput into a normalized TranscriptCue[].
 * Dispatches to format-specific parsers based on source type and file extension.
 */
export async function resolveTranscript(
  input: TranscriptInput
): Promise<TranscriptCue[]> {
  if (input.rawTranscript) {
    logger.debug("Resolving transcript from rawTranscript");
    return parsePlainText(input.rawTranscript);
  }

  if (input.youtubeUrl) {
    logger.debug("Resolving transcript from YouTube URL", {
      url: input.youtubeUrl,
    });
    return fetchYouTubeTranscript(input.youtubeUrl);
  }

  if (input.filePath) {
    logger.debug("Resolving transcript from file", { path: input.filePath });
    return resolveFromFile(input.filePath);
  }

  // Should never reach here due to Zod refinement, but TypeScript wants the check
  throw new InvalidInputError(
    "No transcript source provided. Pass one of: youtubeUrl, filePath, or rawTranscript."
  );
}

async function resolveFromFile(filePath: string): Promise<TranscriptCue[]> {
  let content: string;

  try {
    content = await readFile(filePath, "utf-8");
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      throw new TranscriptUnavailableError(
        `File not found: "${filePath}". Check the path and ensure the file exists.`
      );
    }
    throw new TranscriptUnavailableError(
      `Could not read file "${filePath}": ${String(err)}`
    );
  }

  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".srt":
      logger.debug("Parsing SRT file");
      return parseSrt(content);

    case ".vtt":
      logger.debug("Parsing VTT file");
      return parseVtt(content);

    case ".txt":
      logger.debug("Parsing plain text file");
      return parsePlainText(content);

    default:
      // Auto-detect from content when extension is unknown
      logger.debug(`Unknown extension "${ext}", auto-detecting format`);
      return autoDetectAndParse(content, filePath);
  }
}

/**
 * Attempts to auto-detect transcript format from content.
 */
function autoDetectAndParse(
  content: string,
  filePath: string
): TranscriptCue[] {
  const trimmed = content.trimStart();

  if (trimmed.startsWith("WEBVTT")) {
    logger.debug("Auto-detected WebVTT format");
    return parseVtt(content);
  }

  if (/^\d+\s*\n\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->/m.test(trimmed)) {
    logger.debug("Auto-detected SRT format");
    return parseSrt(content);
  }

  if (/\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->/m.test(trimmed)) {
    logger.debug("Auto-detected SRT format (no index)");
    return parseSrt(content);
  }

  // Default to plain text
  logger.debug("Defaulting to plain text parsing");
  const ext = extname(filePath).toLowerCase();
  if ([".md", ".rst", ".csv", ".json", ".xml"].includes(ext)) {
    throw new UnsupportedFileError(
      `File format "${ext}" is not supported. Use .srt, .vtt, or .txt transcripts.`
    );
  }

  return parsePlainText(content);
}
