/**
 * Domain error hierarchy with machine-readable codes for creator-ops-mcp.
 */

export type ErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_FILE"
  | "TRANSCRIPT_UNAVAILABLE"
  | "PARSE_ERROR"
  | "ANALYSIS_ERROR"
  | "FILE_NOT_FOUND"
  | "NETWORK_ERROR";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly detail?: unknown;

  constructor(code: ErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.detail = detail;
    // Maintains proper prototype chain in ES5 transpilation
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      detail: this.detail,
    };
  }
}

export class InvalidInputError extends AppError {
  constructor(message: string, detail?: unknown) {
    super("INVALID_INPUT", message, detail);
    this.name = "InvalidInputError";
  }
}

export class UnsupportedFileError extends AppError {
  constructor(message: string, detail?: unknown) {
    super("UNSUPPORTED_FILE", message, detail);
    this.name = "UnsupportedFileError";
  }
}

export class TranscriptUnavailableError extends AppError {
  constructor(message: string, detail?: unknown) {
    super("TRANSCRIPT_UNAVAILABLE", message, detail);
    this.name = "TranscriptUnavailableError";
  }
}

export class ParseError extends AppError {
  constructor(message: string, detail?: unknown) {
    super("PARSE_ERROR", message, detail);
    this.name = "ParseError";
  }
}

export class AnalysisError extends AppError {
  constructor(message: string, detail?: unknown) {
    super("ANALYSIS_ERROR", message, detail);
    this.name = "AnalysisError";
  }
}

/**
 * Converts any thrown value into a structured error message string.
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof AppError) {
    return `[${err.code}] ${err.message}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
