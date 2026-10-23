import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/mcp/route";
import { captureRequest, clearRequests, getRequests } from "@/lib/webhook-store";

const HOOK = "mcp-test-hook";

async function rpc(body: unknown) {
  const res = await POST(
    new NextRequest("https://webhook-tester.example/api/mcp", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }),
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  clearRequests(HOOK);
  captureRequest(HOOK, { method: "POST", headers: { "content-type": "application/json" }, body: '{"a":1}', receivedAt: 10 });
});

describe("MCP route", () => {
  it("echoes the JSON-RPC id and lists the real tools", async () => {
    const { body } = await rpc({ jsonrpc: "2.0", id: 42, method: "tools/list" });
    expect(body.id).toBe(42);
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual(["list_requests", "get_request"]);
  });

  it("list_requests returns what the hook captured", async () => {
    const { body } = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_requests", arguments: { hookId: HOOK } } });
    expect(body.result.requests).toHaveLength(1);
    expect(body.result.requests[0].body).toBe('{"a":1}');
  });

  it("get_request returns one request and errors for an unknown one", async () => {
    const [stored] = getRequests(HOOK);
    const ok = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_request", arguments: { hookId: HOOK, requestId: stored.id } } });
    expect(ok.body.result.request.id).toBe(stored.id);
    const missing = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_request", arguments: { hookId: HOOK, requestId: "nope" } } });
    expect(missing.body).toMatchObject({ id: 3, error: { code: -32602 } });
  });

  it("rejects a missing or invalid hookId", async () => {
    const { body } = await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_requests", arguments: {} } });
    expect(body).toMatchObject({ id: 4, error: { code: -32602 } });
  });

  it("rejects an unknown tool instead of pretending to call it", async () => {
    const { body } = await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_data" } });
    expect(body).toMatchObject({ id: 5, error: { code: -32602 } });
  });

  it("returns method-not-found for an unknown method and a parse error for bad JSON", async () => {
    expect((await rpc({ jsonrpc: "2.0", id: 6, method: "resources/list" })).body).toMatchObject({ id: 6, error: { code: -32601 } });
    const bad = await rpc("{oops");
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ id: null, error: { code: -32700 } });
  });
});
