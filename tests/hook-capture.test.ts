import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/hook/[id]/route";
import { clearRequests, getRequests } from "@/lib/webhook-store";

const HOOK_ID = "test-hook";

async function capture(headers: Record<string, string>) {
  const req = new NextRequest(`https://webhook-tester.example/api/hook/${HOOK_ID}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ok: true }),
  });
  await POST(req, { params: Promise.resolve({ id: HOOK_ID }) });
  return getRequests(HOOK_ID)[0];
}

describe("POST /api/hook/[id] header capture", () => {
  beforeEach(() => clearRequests(HOOK_ID));

  it("never stores credential header values", async () => {
    const secrets: Record<string, string> = {
      authorization: "Bearer sk-live-should-not-be-stored",
      "proxy-authorization": "Basic dXNlcjpwYXNz",
      cookie: "session=abc123",
      "x-api-key": "key-should-not-be-stored",
      "x-api-key-secondary": "key2-should-not-be-stored",
      "x-auth-token": "tok-should-not-be-stored",
      "x-access-token": "tok2-should-not-be-stored",
      "x-client-secret": "secret-should-not-be-stored",
      "x-session-id": "sess-should-not-be-stored",
    };
    const stored = await capture({ "content-type": "application/json", ...secrets });

    const serialized = JSON.stringify(stored);
    for (const value of Object.values(secrets)) {
      expect(serialized).not.toContain(value);
    }
    for (const name of Object.keys(secrets)) {
      expect(stored.headers[name]).toBe("[redacted]");
    }
  });

  it("does not store the sender's IP address", async () => {
    const stored = await capture({
      "x-forwarded-for": "203.0.113.7",
      "x-real-ip": "203.0.113.7",
      "x-vercel-forwarded-for": "203.0.113.7",
    });
    expect(JSON.stringify(stored)).not.toContain("203.0.113.7");
  });

  it("drops hosting-platform internals the sender never sent", async () => {
    const stored = await capture({
      "x-vercel-oidc-token": "eyJ-oidc-should-not-be-stored",
      "x-vercel-sc-headers": '{"Authorization":"Bearer sc-should-not-be-stored"}',
      "x-vercel-proxy-signature": "Bearer proxy-sig-should-not-be-stored",
      "x-vercel-proxied-for": "203.0.113.8",
      "x-vercel-ja4-digest": "ja4-fingerprint",
      "x-vercel-ip-city": "Bangkok",
    });
    const serialized = JSON.stringify(stored);
    for (const leaked of ["oidc-should", "sc-should", "proxy-sig-should", "203.0.113.8", "ja4-fingerprint", "Bangkok"]) {
      expect(serialized).not.toContain(leaked);
    }
    expect(Object.keys(stored.headers).filter((name) => name.startsWith("x-vercel-"))).toEqual([]);
  });

  it("keeps ordinary headers so the tester stays useful", async () => {
    const stored = await capture({
      "content-type": "application/json",
      "user-agent": "GitHub-Hookshot/abc",
      "x-github-event": "push",
      "x-hub-signature-256": "sha256=deadbeef",
    });
    expect(stored.headers["content-type"]).toBe("application/json");
    expect(stored.headers["user-agent"]).toBe("GitHub-Hookshot/abc");
    expect(stored.headers["x-github-event"]).toBe("push");
    expect(stored.headers["x-hub-signature-256"]).toBe("sha256=deadbeef");
  });
});

describe("DELETE /api/hook/[id]/requests", () => {
  beforeEach(() => clearRequests(HOOK_ID));

  async function del(query: string, body?: string) {
    const { DELETE } = await import("@/app/api/hook/[id]/requests/route");
    const req = new NextRequest(`https://webhook-tester.example/api/hook/${HOOK_ID}/requests${query}`, { method: "DELETE", body });
    return DELETE(req, { params: Promise.resolve({ id: HOOK_ID }) });
  }

  it.each([
    ["?upTo=", undefined],
    ["?upTo=123", undefined],
    ["", "not json"],
    ["", "{}"],
    ["", '{"ids": []}'],
    ["", '{"ids": "abc"}'],
    ["", '{"ids": [1, 2]}'],
    ["", '{"ids": [""]}'],
    ["", "null"],
    ["", " "],
    ["", "\n\t "],
    ["", "\uFEFF"],
  ])("refuses %s %s with 400 and clears nothing", async (query, body) => {
    await capture({ "content-type": "text/plain" });
    const response = await del(query, body);
    expect(response.status).toBe(400);
    expect(getRequests(HOOK_ID)).toHaveLength(1);
  });

  it("refuses a body over 64 KiB with 413, by Content-Length or while streaming, and clears nothing", async () => {
    await capture({ "content-type": "text/plain" });
    const { DELETE } = await import("@/app/api/hook/[id]/requests/route");
    const url = `https://webhook-tester.example/api/hook/${HOOK_ID}/requests`;
    const big = JSON.stringify({ ids: ["x".repeat(70 * 1024)] });
    const declared = new NextRequest(url, { method: "DELETE", body: big, headers: { "content-length": String(big.length) } });
    expect((await DELETE(declared, { params: Promise.resolve({ id: HOOK_ID }) })).status).toBe(413);
    // No Content-Length (a chunked stream): the read stops at the cap.
    const encoder = new TextEncoder();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 100) controller.close();
        else controller.enqueue(encoder.encode("x".repeat(16 * 1024)));
      },
    });
    const chunked = new NextRequest(url, { method: "DELETE", body: stream, duplex: "half" } as unknown as ConstructorParameters<typeof NextRequest>[1]);
    chunked.headers.delete("content-length");
    expect((await DELETE(chunked, { params: Promise.resolve({ id: HOOK_ID }) })).status).toBe(413);
    expect(pulls).toBeLessThan(100);
    expect(getRequests(HOOK_ID)).toHaveLength(1);
  });

  it("never clears the queue when the body read is aborted, errors, or comes up short of Content-Length", async () => {
    await capture({ "content-type": "text/plain" });
    const { DELETE } = await import("@/app/api/hook/[id]/requests/route");
    const url = `https://webhook-tester.example/api/hook/${HOOK_ID}/requests`;
    const run = (req: NextRequest) => DELETE(req, { params: Promise.resolve({ id: HOOK_ID }) });
    type Init = ConstructorParameters<typeof NextRequest>[1];
    // Connection dropped before the handler: no body reaches it, only an aborted signal.
    const controller = new AbortController();
    controller.abort();
    expect((await run(new NextRequest(url, { method: "DELETE", signal: controller.signal }))).status).toBe(400);
    // The stream errors before any byte arrives.
    const failing = new ReadableStream<Uint8Array>({ pull(c) { c.error(new Error("socket reset")); } });
    expect((await run(new NextRequest(url, { method: "DELETE", body: failing, duplex: "half" } as unknown as Init))).status).toBe(400);
    // Content-Length promised bytes that never came.
    const short = new NextRequest(url, { method: "DELETE", body: "", headers: { "content-length": "14" } });
    expect((await run(short)).status).toBe(400);
    expect(getRequests(HOOK_ID)).toHaveLength(1);
    // A truly empty body still clears everything.
    expect((await run(new NextRequest(url, { method: "DELETE", headers: { "content-length": "0" } }))).status).toBe(200);
    expect(getRequests(HOOK_ID)).toHaveLength(0);
  });

  it("clears only the listed ids, and everything without a body", async () => {
    const first = await capture({ "content-type": "text/plain" });
    expect((await del("", JSON.stringify({ ids: ["someone-else"] }))).status).toBe(200);
    expect(getRequests(HOOK_ID)).toHaveLength(1);
    expect((await del("", JSON.stringify({ ids: [first.id] }))).status).toBe(200);
    expect(getRequests(HOOK_ID)).toHaveLength(0);
    await capture({ "content-type": "text/plain" });
    expect((await del("")).status).toBe(200);
    expect(getRequests(HOOK_ID)).toHaveLength(0);
  });
});
