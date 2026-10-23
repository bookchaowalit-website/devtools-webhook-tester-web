import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/hook/[id]/route";
import { DELETE as clearRoute, GET as listRoute } from "@/app/api/hook/[id]/requests/route";
import {
  MAX_BODY_CHARS,
  MAX_REQUESTS_PER_HOOK,
  captureRequest,
  clearRequests,
  getRequests,
  isValidHookId,
} from "@/lib/webhook-store";

const HOOK = "store-test-hook";

function send(id: string, body: string) {
  return POST(new NextRequest(`https://webhook-tester.example/api/hook/${id}`, { method: "POST", body }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => clearRequests(HOOK));
afterEach(() => vi.useRealTimers());

describe("webhook store", () => {
  it("keeps the newest requests first and caps each hook", () => {
    for (let i = 0; i < MAX_REQUESTS_PER_HOOK + 5; i++) {
      captureRequest(HOOK, { method: "POST", headers: {}, body: String(i), receivedAt: i });
    }
    const stored = getRequests(HOOK);
    expect(stored).toHaveLength(MAX_REQUESTS_PER_HOOK);
    expect(stored[0].body).toBe(String(MAX_REQUESTS_PER_HOOK + 4));
  });

  it("forgets a hook after an hour without access", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    captureRequest(HOOK, { method: "GET", headers: {}, body: "", receivedAt: 0 });
    vi.setSystemTime(61 * 60 * 1000);
    captureRequest("other-hook", { method: "GET", headers: {}, body: "", receivedAt: 0 });
    expect(getRequests(HOOK)).toEqual([]);
    clearRequests("other-hook");
  });

  it("truncates an oversized body instead of holding it all in memory", () => {
    captureRequest(HOOK, { method: "POST", headers: {}, body: "x".repeat(MAX_BODY_CHARS + 10), receivedAt: 1 });
    const [stored] = getRequests(HOOK);
    expect(stored.body).toHaveLength(MAX_BODY_CHARS);
    expect(stored.truncated).toBe(true);
  });

  it("does not mark a normal body as truncated", () => {
    captureRequest(HOOK, { method: "POST", headers: {}, body: "{}", receivedAt: 1 });
    expect(getRequests(HOOK)[0].truncated).toBeUndefined();
  });

  it("accepts only short URL-safe hook ids", () => {
    expect(isValidHookId("0b6f3a9e-1c2d-4e5f-8a9b-0c1d2e3f4a5b")).toBe(true);
    expect(isValidHookId("")).toBe(false);
    expect(isValidHookId("a".repeat(65))).toBe(false);
    expect(isValidHookId("../etc")).toBe(false);
  });
});

describe("POST /api/hook/[id]", () => {
  it("rejects an invalid hook id without storing anything", async () => {
    const id = "x".repeat(200);
    const res = await send(id, "{}");
    expect(res.status).toBe(400);
    expect(getRequests(id)).toEqual([]);
  });

  it("captures the body and reports truncation to the sender", async () => {
    const res = await send(HOOK, "y".repeat(MAX_BODY_CHARS + 1));
    expect(await res.json()).toEqual({ captured: true, hookId: HOOK, truncated: true });
    expect(getRequests(HOOK)[0].body).toHaveLength(MAX_BODY_CHARS);
  });
});

describe("/api/hook/[id]/requests", () => {
  const ctx = { params: Promise.resolve({ id: HOOK }) };
  const url = `https://webhook-tester.example/api/hook/${HOOK}/requests`;

  it("lists what the hook captured and clears it on DELETE", async () => {
    await send(HOOK, '{"n":1}');
    const listed = await (await listRoute(new NextRequest(url), ctx)).json();
    expect(listed.requests.map((r: { body: string }) => r.body)).toEqual(['{"n":1}']);
    expect(await (await clearRoute(new NextRequest(url, { method: "DELETE" }), ctx)).json()).toEqual({ cleared: true });
    expect(getRequests(HOOK)).toEqual([]);
  });
});
