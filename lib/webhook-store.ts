export interface CapturedRequest {
  id: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  receivedAt: number;
  /** Set when the body was longer than MAX_BODY_CHARS and only its start was kept. */
  truncated?: boolean;
}

export const MAX_REQUESTS_PER_HOOK = 50;
// Bounds memory: 200 hooks x 50 requests x 64 KiB at most, instead of whatever senders post.
export const MAX_BODY_CHARS = 64 * 1024;
const HOOK_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_HOOKS = 200;
const HOOK_TTL_MS = 60 * 60 * 1000; // 1 hour

interface HookBucket {
  requests: CapturedRequest[];
  lastAccess: number;
}

// `globalThis` survives Next.js dev-server HMR reloads and keeps requests
// visible across warm serverless invocations. It does not survive a cold
// start or a new instance being spun up — captured requests are ephemeral
// by design, not a permanent archive.
const globalForStore = globalThis as unknown as {
  __webhookStore?: Map<string, HookBucket>;
};

function getStore(): Map<string, HookBucket> {
  if (!globalForStore.__webhookStore) {
    globalForStore.__webhookStore = new Map();
  }
  return globalForStore.__webhookStore;
}

function pruneExpired(store: Map<string, HookBucket>) {
  const now = Date.now();
  for (const [id, bucket] of store) {
    if (now - bucket.lastAccess > HOOK_TTL_MS) {
      store.delete(id);
    }
  }
  if (store.size > MAX_HOOKS) {
    const oldest = [...store.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    for (const [id] of oldest.slice(0, store.size - MAX_HOOKS)) {
      store.delete(id);
    }
  }
}

/** Hook ids are short URL-safe strings (the page uses UUIDs). */
export function isValidHookId(id: unknown): id is string {
  return typeof id === "string" && HOOK_ID_PATTERN.test(id);
}

export function captureRequest(hookId: string, req: Omit<CapturedRequest, "id" | "truncated">): CapturedRequest {
  const store = getStore();
  pruneExpired(store);
  const bucket = store.get(hookId) ?? { requests: [], lastAccess: Date.now() };
  const entry: CapturedRequest = { id: crypto.randomUUID(), ...req };
  if (req.body.length > MAX_BODY_CHARS) {
    entry.body = req.body.slice(0, MAX_BODY_CHARS);
    entry.truncated = true;
  }
  bucket.requests.unshift(entry);
  if (bucket.requests.length > MAX_REQUESTS_PER_HOOK) {
    bucket.requests.length = MAX_REQUESTS_PER_HOOK;
  }
  bucket.lastAccess = Date.now();
  store.set(hookId, bucket);
  return entry;
}

export function getRequests(hookId: string): CapturedRequest[] {
  const store = getStore();
  const bucket = store.get(hookId);
  if (!bucket) return [];
  bucket.lastAccess = Date.now();
  return bucket.requests;
}

export function clearRequests(hookId: string) {
  getStore().delete(hookId);
}
