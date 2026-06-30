/**
 * Structured logger for KutumbKosh admin server.
 *
 * Replaces raw console.log/error/warn with consistent JSON-structured output.
 * In development, outputs human-readable format.
 * In production, outputs JSON for log aggregation.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  msg: string;
  timestamp: string;
  ctx?: string;
  [key: string]: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === "production" ? "info" : "debug");

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatEntry(entry: LogEntry): string {
  if (process.env.NODE_ENV === "production") {
    return JSON.stringify(entry);
  }

  // Human-readable format for development
  const prefix = entry.ctx ? `[${entry.ctx}]` : "";
  const ts = entry.timestamp.split("T")[1]?.split(".")[0] ?? "";
  const { level, msg, timestamp: _, ctx: __, ...rest } = entry;
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  return `${ts} ${level.toUpperCase().padEnd(5)} ${prefix} ${msg}${extra}`;
}

function log(level: LogLevel, msg: string, ctx?: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...(ctx ? { ctx } : {}),
    ...(meta ?? {}),
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

/**
 * Create a scoped logger with a context tag.
 *
 * @example
 * const log = createLogger("auth");
 * log.info("Login successful", { userId: "abc" });
 */
export function createLogger(ctx: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) =>
      log("debug", msg, ctx, meta),
    info: (msg: string, meta?: Record<string, unknown>) =>
      log("info", msg, ctx, meta),
    warn: (msg: string, meta?: Record<string, unknown>) =>
      log("warn", msg, ctx, meta),
    error: (msg: string, meta?: Record<string, unknown>) =>
      log("error", msg, ctx, meta),
  };
}

/**
 * Root-level logger (no context).
 */
export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) =>
    log("debug", msg, undefined, meta),
  info: (msg: string, meta?: Record<string, unknown>) =>
    log("info", msg, undefined, meta),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    log("warn", msg, undefined, meta),
  error: (msg: string, meta?: Record<string, unknown>) =>
    log("error", msg, undefined, meta),
};
