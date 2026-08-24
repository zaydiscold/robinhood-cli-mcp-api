const SENSITIVE_KEY =
  /(?:balance|buying[_-]?power|cash|equity|order(?:[_-]?id)?|document(?:[_-]?url)?|private[_-]?(?:note|key)|password|passcode|secret|credential|api[_-]?key|access[_-]?key|token|authorization|bearer|cookie|session[_-]?(?:id|key|token)|mfa|otp|challenge|device[_-]?id|ssn|tax[_-]?id)/i;
const URL_KEY = /(?:url|uri|href|download|document|link)/i;
const SIGNED_URL =
  /(?:X-(?:Amz|Goog)-(?:Signature|Credential)|signature=|token=|jwt=|download_url=)/i;

function normalizedKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isScalar(value: unknown): value is string | number | bigint {
  return ["string", "number", "bigint"].includes(typeof value);
}

function isAccountIdentifierKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return (
    [
      "account",
      "account_number",
      "account_id",
      "account_uuid",
      "acct",
      "acct_number",
      "acct_id",
      "acct_uuid",
    ].includes(normalized) ||
    /_(?:account|acct)_(?:number|id|uuid)$/.test(normalized)
  );
}

function isAccountReferenceKey(key: string): boolean {
  return /(?:^|_)(?:account|acct)_(?:url|uri|href|link)$/.test(normalizedKey(key));
}

function shouldMaskKey(key: string, value: unknown): boolean {
  if (isAccountIdentifierKey(key)) return isScalar(value);
  return isAccountReferenceKey(key) || SENSITIVE_KEY.test(normalizedKey(key));
}

function masked(value: unknown, key = ""): string {
  const text = String(value ?? "");
  if (isAccountIdentifierKey(key) && isScalar(value)) {
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
      if (shouldMaskKey(key, current)) return masked(current, key);
      if (URL_KEY.test(key) && SIGNED_URL.test(current)) return "[REDACTED_URL]";
      return current;
    }
    if (typeof current === "number" || typeof current === "bigint") {
      return shouldMaskKey(key, current) ? masked(current, key) : current;
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
      output[childKey] = shouldMaskKey(childKey, child)
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
