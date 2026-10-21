// Captured requests are readable by anyone who knows the hook URL, so
// credentials and the sender's IP must never reach the store. Header names
// stay visible (with a placeholder value) so users can still see what was sent.

export const REDACTED = "[redacted]";

const SENSITIVE_EXACT = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
]);

// Token-like names: x-api-key, x-auth-token, x-client-secret, x-session-id, ...
const SENSITIVE_PATTERN = /(api[-_]?key|token|secret|passw(or)?d|session|credential|auth)/i;

// Sender IP / geo headers added by proxies and the hosting edge.
const DROPPED_EXACT = new Set([
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "cf-connecting-ip",
  "true-client-ip",
]);
const DROPPED_PATTERN = /^x-vercel-(forwarded-for|ip-)/i;

export function isSensitiveHeader(name: string): boolean {
  const key = name.toLowerCase();
  return SENSITIVE_EXACT.has(key) || SENSITIVE_PATTERN.test(key);
}

export function sanitizeHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    const key = name.toLowerCase();
    if (DROPPED_EXACT.has(key) || DROPPED_PATTERN.test(key)) return;
    out[key] = isSensitiveHeader(key) ? REDACTED : value;
  });
  return out;
}
