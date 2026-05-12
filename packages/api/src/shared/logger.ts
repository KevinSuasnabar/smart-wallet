/**
 * Minimal structured logger for Lambda functions.
 *
 * Writes JSON lines to stdout — compatible with CloudWatch Logs Insights and
 * local development. Each log entry includes `level`, `msg`, and `ts` fields,
 * plus any caller-supplied fields.
 *
 * Does NOT wrap `console.error` — callers decide which level to use.
 */

type LogFields = Record<string, unknown>;

const write = (level: 'info' | 'warn' | 'error', msg: string, fields?: LogFields): void => {
  console.log(
    JSON.stringify({
      level,
      msg,
      ts: new Date().toISOString(),
      ...fields,
    }),
  );
};

export const log = {
  info: (msg: string, fields?: LogFields): void => write('info', msg, fields),
  warn: (msg: string, fields?: LogFields): void => write('warn', msg, fields),
  /**
   * Logs an error with a serialised error object for CloudWatch structured search.
   * `err` is serialised to `{ message, stack }` when it is an `Error` instance.
   */
  error: (msg: string, err?: unknown, fields?: LogFields): void =>
    write('error', msg, {
      ...fields,
      ...(err instanceof Error
        ? { error: { message: err.message, stack: err.stack } }
        : err !== undefined
          ? { error: err }
          : {}),
    }),
} as const;
