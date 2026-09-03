type LogLevel = "info" | "warn" | "error";

const REDACTED_KEYS = new Set(["authorization", "cookie", "cf-access-jwt-assertion", "x-api-key", "token"]);

function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      REDACTED_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : redact(nested)
    ])
  );
}

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const safeFields = redact(fields) as Record<string, unknown>;
  console[level](JSON.stringify({ level, event, ...safeFields, timestamp: new Date().toISOString() }));
}
