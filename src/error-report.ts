/** Transport-neutral error data: Rust adapters can supply this shape without a JS Error. */
export interface DiagnosticError {
  message: string;
  name?: string;
  kind?: string;
  code?: string;
  status?: number;
  stack?: string;
  backtrace?: string;
  causes?: DiagnosticError[];
}

export interface ErrorReportContext {
  application?: string;
  build?: string;
  environment?: string;
  route?: string;
  surface?: string;
  action?: string;
  session?: "anonymous" | "authenticated" | "unavailable";
  browser?: string;
  online?: boolean;
}

export interface ErrorReport {
  schemaVersion: 1;
  occurredAt: string;
  error: DiagnosticError;
  context: ErrorReportContext;
}

/** Strip URL credentials/query/fragment and common credential assignments from report text. */
export function redactDiagnosticText(text: string): string {
  return text
    .replace(/(?:https?|wss?):\/\/[^\s<>"']+/gi, (value) => {
      try {
        const url = new URL(value);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return "[redacted URL]";
      }
    })
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(
      /\bauthorization["']?\s*[:=]\s*(?:"[^"\r\n]*(?:"|$)|'[^'\r\n]*(?:'|$)|[^\r\n,;]+)/gi,
      "authorization=[redacted]",
    )
    .replace(
      /\b([\w-]*(?:password|secret|token|api[_-]?key))["']?\s*[:=]\s*(?:"[^"]*(?:"|$)|'[^']*(?:'|$)|[^\s,;]+)/gi,
      "$1=[redacted]",
    );
}

function field(value: unknown, key: string): unknown {
  try {
    return value !== null && typeof value === "object" ? Reflect.get(value, key) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Boundary adapter for JS errors, router responses, strings, and structured Rust errors.
 * Only diagnostic fields cross this boundary; arbitrary payloads and Result values do not.
 */
export function toDiagnosticError(input: unknown): DiagnosticError {
  const seen = new Set<object>();
  let remaining = 32;
  // A shared text budget bounds the whole cause tree, including stacks and backtraces.
  let textRemaining = 65536;
  const sanitize = (raw: string, limit: number) => {
    const value = redactDiagnosticText(raw.slice(0, Math.min(limit, textRemaining)));
    textRemaining = Math.max(0, textRemaining - value.length);
    return value;
  };
  function normalize(current: unknown, depth: number): DiagnosticError {
    if (--remaining < 0) return { message: "[cause count limit]" };
    if (depth >= 5) return { message: "[cause depth limit]" };
    if (current !== null && typeof current === "object") {
      if (seen.has(current)) return { message: "[circular cause]" };
      seen.add(current);
    }
    const text = (key: string, limit = 4096) => {
      const raw = field(current, key);
      return typeof raw === "string" ? sanitize(raw, limit) : undefined;
    };
    const message =
      text("message") ??
      text("data") ??
      (typeof current === "string" ? sanitize(current, 4096) : "Unknown error");
    const error: DiagnosticError = { message };
    for (const key of ["name", "kind", "code"] as const) {
      const value = text(key);
      if (value !== undefined) error[key] = value;
    }
    for (const key of ["stack", "backtrace"] as const) {
      const value = text(key, 16384);
      if (value !== undefined) error[key] = value;
    }
    const status = field(current, "status");
    if (typeof status === "number" && Number.isFinite(status)) error.status = status;
    const causes = field(current, "causes");
    const cause = field(current, "cause");
    const nested: unknown[] = [];
    if (Array.isArray(causes)) {
      const length = field(causes, "length");
      for (let i = 0; i < Math.min(typeof length === "number" ? length : 0, 8); i++)
        nested.push(field(causes, String(i)));
    } else if (cause != null) nested.push(cause);
    if (nested.length) error.causes = nested.map((entry) => normalize(entry, depth + 1));
    if (current !== null && typeof current === "object") seen.delete(current);
    return error;
  }
  return normalize(input, 0);
}

/** Add an allowlisted snapshot of UI context without changing Result's error semantics. */
export function createErrorReport(
  error: DiagnosticError,
  context: ErrorReportContext = {},
  occurredAt = new Date().toISOString(),
): ErrorReport {
  const safeContext: ErrorReportContext = {};
  for (const key of [
    "application",
    "build",
    "environment",
    "route",
    "surface",
    "action",
    "browser",
  ] as const) {
    const value = context[key];
    if (typeof value === "string") {
      safeContext[key] = redactDiagnosticText(
        (key === "route" ? value.split(/[?#]/)[0]! : value).slice(0, 1024),
      );
    }
  }
  if (["anonymous", "authenticated", "unavailable"].includes(context.session ?? ""))
    safeContext.session = context.session;
  if (typeof context.online === "boolean") safeContext.online = context.online;
  return { schemaVersion: 1, occurredAt, error: toDiagnosticError(error), context: safeContext };
}

/** The same representation is used by dialog details and toast clipboardContent. */
export function formatErrorReport(report: ErrorReport): string {
  return JSON.stringify(report, null, 2);
}
