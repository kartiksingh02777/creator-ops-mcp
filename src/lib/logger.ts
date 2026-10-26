/**
 * Strict stderr logger — never writes to stdout to preserve MCP JSON-RPC hygiene.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env["LOG_LEVEL"] as LogLevel | undefined) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_RANK[level] >= LOG_LEVEL_RANK[currentLevel];
}

function format(level: LogLevel, message: string, data?: unknown): string {
  const ts = new Date().toISOString();
  const prefix = `[creator-ops-mcp] ${ts} ${level.toUpperCase()}`;
  if (data !== undefined) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

export const logger = {
  debug(message: string, data?: unknown): void {
    if (shouldLog("debug")) {
      console.error(format("debug", message, data));
    }
  },

  info(message: string, data?: unknown): void {
    if (shouldLog("info")) {
      console.error(format("info", message, data));
    }
  },

  warn(message: string, data?: unknown): void {
    if (shouldLog("warn")) {
      console.error(format("warn", message, data));
    }
  },

  error(message: string, data?: unknown): void {
    if (shouldLog("error")) {
      console.error(format("error", message, data));
    }
  },
};
