// Pure helpers for the capture page: hook id persistence, payload display, request list fetch.

export const HOOK_ID_STORAGE = "webhook-tester-hook-id";

type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

/** The hook id saved in this browser, creating and saving one on first use. Null when storage is unavailable. */
export function ensureHookId(storage: KeyValueStore | undefined, makeId: () => string): string | null {
  if (!storage) return null;
  try {
    const existing = storage.getItem(HOOK_ID_STORAGE);
    if (existing && /^[A-Za-z0-9_-]{1,64}$/.test(existing)) return existing;
    const id = makeId();
    storage.setItem(HOOK_ID_STORAGE, id);
    return id;
  } catch {
    return null;
  }
}

export function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Pretty-print a JSON body; anything else is shown as-is. */
export function tryPrettyJson(body: string) {
  if (!body.trim()) return { pretty: "(empty payload)", isJson: false };
  try {
    return { pretty: JSON.stringify(JSON.parse(body), null, 2), isJson: true };
  } catch {
    return { pretty: body, isJson: false };
  }
}

export function formatHeaders(headers: Record<string, string>) {
  return Object.entries(headers)
    .map(([key, value]) => key + ": " + value)
    .join("\n");
}

/** The `requests` array from a GET /api/hook/<id>/requests answer, or [] for anything malformed. */
export function parseRequestList<T>(data: unknown): T[] {
  if (data && typeof data === "object" && Array.isArray((data as { requests?: unknown }).requests)) {
    return (data as { requests: T[] }).requests;
  }
  return [];
}
