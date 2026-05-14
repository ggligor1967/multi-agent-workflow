/**
 * Centralized logging module.
 *
 * Provides prefixed console log output for server modules that adopt it
 * (currently workflow engine and agents), making logs easier to filter.
 *
 * Usage:
 *   import { createLogger } from "../_core/logger";
 *   const log = createLogger("WorkflowEngine:42");
 *   log.info("Starting workflow");
 *   log.error("Failed to save artifact", err);
 *
 * Set the LOG_LEVEL environment variable to "debug" to enable debug-level output.
 */

export interface Logger {
  /** Detailed diagnostic messages (only emitted when LOG_LEVEL=debug) */
  debug(message: string, ...args: unknown[]): void;
  /** Routine informational messages */
  info(message: string, ...args: unknown[]): void;
  /** Non-fatal warnings */
  warn(message: string, ...args: unknown[]): void;
  /** Error messages with an optional cause; Error causes preserve stack traces */
  error(message: string, cause?: unknown): void;
}

/**
 * Create a logger bound to a named prefix.
 *
 * @param prefix - Module or instance identifier that appears in every log line
 *                 as `[prefix]`, e.g. "WorkflowEngine:42" or "context_provider".
 */
export function createLogger(prefix: string): Logger {
  const tag = `[${prefix}]`;

  return {
    debug(message: string, ...args: unknown[]): void {
      if (process.env.LOG_LEVEL === "debug") {
        console.debug(tag, message, ...args);
      }
    },

    info(message: string, ...args: unknown[]): void {
      console.log(tag, message, ...args);
    },

    warn(message: string, ...args: unknown[]): void {
      console.warn(tag, message, ...args);
    },

    error(message: string, cause?: unknown): void {
      if (cause !== undefined) {
        if (cause instanceof Error) {
          console.error(tag, message, cause);
        } else {
          console.error(tag, `${message}:`, cause);
        }
      } else {
        console.error(tag, message);
      }
    },
  };
}
