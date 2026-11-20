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
