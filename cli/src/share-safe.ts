const SENSITIVE_KEY = /(?:account(?:[_-]?(?:number|id))?|balance|buying[_-]?power|cash|equity|order(?:[_-]?id)?|document(?:[_-]?url)?|private(?:[_-]?note)?|password|passcode|secret|api[_-]?key|token|authorization|credential|cookie|mfa|otp|challenge|device[_-]?id|ssn|tax[_-]?id)/i;
const URL_KEY = /(?:url|uri|href|download|document|link)/i;
const SIGNED_URL = /(?:X-Amz-(?:Signature|Credential)|signature=|token=|jwt=|download_url=)/i;

function normalizedKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
}

function isAccountIdentifierKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return (
    normalized === "account_number" ||
    normalized.endsWith("_account_number") ||
    normalized === "account_id" ||
    normalized.endsWith("_account_id")
  );
}

function masked(value: unknown, key = ""): string {
  const text = String(value ?? "");
  const scalar = ["string", "number", "bigint"].includes(typeof value);
  if (isAccountIdentifierKey(key) && scalar) {
    return text.length >= 4 ? `…${text.slice(-4)}` : "[REDACTED]";
  }
  return "[REDACTED]";
}

/** Recursively prepare brokerage output for sharing with a model or another person. */
export function redactShareSafe<T>(value: T): T {
  const seen = new WeakMap<object, unknown>();
  const visit = (current: unknown, key = ""): unknown => {
    if (current === null || current === undefined) return current;
    if (typeof current === "string") {
      if (SENSITIVE_KEY.test(key)) return masked(current, key);
      if (URL_KEY.test(key) && SIGNED_URL.test(current)) return "[REDACTED_URL]";
      return current;
    }
    if (typeof current === "number" || typeof current === "bigint") {
      return SENSITIVE_KEY.test(key) ? masked(current, key) : current;
    }
    if (typeof current !== "object") return current;
    if (seen.has(current)) return "[CIRCULAR]";
    if (Array.isArray(current)) {
      const output: unknown[] = [];
      seen.set(current, output);
      for (const item of current) output.push(visit(item));
      return output;
    }
    const output: Record<string, unknown> = {};
    seen.set(current, output);
    for (const [childKey, child] of Object.entries(current as Record<string, unknown>)) {
      output[childKey] = SENSITIVE_KEY.test(childKey)
        ? masked(child, childKey)
        : visit(child, childKey);
    }
    return output;
  };
  return visit(value) as T;
}

export function shareSafeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ROBINHOOD_SHARE_SAFE === "1";
}

export function maybeShareSafe<T>(value: T, env: NodeJS.ProcessEnv = process.env): T {
  return shareSafeEnabled(env) ? redactShareSafe(value) : value;
}
