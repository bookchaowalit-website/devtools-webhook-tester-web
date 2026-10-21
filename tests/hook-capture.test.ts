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
      "x-vercel-oidc-token": "oidc-should-not-be-stored",
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
