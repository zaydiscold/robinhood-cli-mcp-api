const SENSITIVE_KEY = /(?:account(?:_number)?|balance|buying_power|cash|equity|order(?:_id)?|document(?:_url)?|private(?:_note)?|token|authorization|cookie|ssn|tax_id)/i;
const URL_KEY = /(?:url|uri|href|download|document)/i;
const SIGNED_URL = /(?:X-Amz-(?:Signature|Credential)|signature=|token=|jwt=|download_url=)/i;

function masked(value: unknown): string {
  const text = String(value ?? "");
  if (/account/i.test(text) || /^\d{6,}$/.test(text)) return text.length >= 4 ? `…${text.slice(-4)}` : "[REDACTED]";
  return "[REDACTED]";
}

/** Recursively prepare brokerage output for sharing with a model or another person. */
export function redactShareSafe<T>(value: T): T {
  const seen = new WeakMap<object, unknown>();
  const visit = (current: unknown, key = ""): unknown => {
    if (current === null || current === undefined) return current;
    if (typeof current === "string") {
      if (SENSITIVE_KEY.test(key)) return masked(current);
      if (URL_KEY.test(key) && SIGNED_URL.test(current)) return "[REDACTED_URL]";
      return current;
    }
    if (typeof current === "number" || typeof current === "bigint") {
      return SENSITIVE_KEY.test(key) ? "[REDACTED]" : current;
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
        ? masked(child)
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
