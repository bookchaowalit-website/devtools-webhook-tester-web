import { describe, expect, it } from "vitest";
import { HOOK_ID_STORAGE, ensureHookId, formatHeaders, parseRequestList, tryPrettyJson } from "@/lib/webhook-view";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe("ensureHookId", () => {
  it("reuses a saved id", () => {
    const storage = memoryStorage({ [HOOK_ID_STORAGE]: "saved-id" });
    expect(ensureHookId(storage, () => "new")).toBe("saved-id");
  });

  it("creates and saves an id on first use", () => {
    const storage = memoryStorage();
    expect(ensureHookId(storage, () => "fresh-id")).toBe("fresh-id");
    expect(storage.data.get(HOOK_ID_STORAGE)).toBe("fresh-id");
  });

  it("replaces a saved value the capture route would reject", () => {
    const storage = memoryStorage({ [HOOK_ID_STORAGE]: "../bad id" });
    expect(ensureHookId(storage, () => "fresh-id")).toBe("fresh-id");
  });

  it("returns null when storage is missing or throws", () => {
    expect(ensureHookId(undefined, () => "x")).toBeNull();
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => {} };
    expect(ensureHookId(blocked, () => "x")).toBeNull();
  });
});

describe("payload display", () => {
  it("pretty-prints JSON and marks it as JSON", () => {
    expect(tryPrettyJson('{"a":1}')).toEqual({ pretty: '{\n  "a": 1\n}', isJson: true });
  });

  it("shows non-JSON text as-is and labels an empty body", () => {
    expect(tryPrettyJson("a=1&b=2")).toEqual({ pretty: "a=1&b=2", isJson: false });
    expect(tryPrettyJson("   ")).toEqual({ pretty: "(empty payload)", isJson: false });
  });

  it("formats headers one per line", () => {
    expect(formatHeaders({ "content-type": "text/plain", authorization: "[redacted]" })).toBe("content-type: text/plain\nauthorization: [redacted]");
  });
});

describe("parseRequestList", () => {
  it("returns the requests array, or [] for anything malformed", () => {
    expect(parseRequestList({ requests: [{ id: "1" }] })).toEqual([{ id: "1" }]);
    expect(parseRequestList({ requests: "nope" })).toEqual([]);
    expect(parseRequestList(null)).toEqual([]);
  });
});
