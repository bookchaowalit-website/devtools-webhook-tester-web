import { NextRequest, NextResponse } from "next/server";
import { getRequests, isValidHookId } from "@/lib/webhook-store";

// Stateless JSON-RPC MCP endpoint over the same in-memory capture store the page reads.
// Read-only: it shows what a hook captured (headers already redacted), the same data
// GET /api/hook/<id>/requests returns to anyone who knows the hook id.

type RpcId = number | string | null;
type RpcRequest = { id?: RpcId; method?: string; params?: { name?: unknown; arguments?: Record<string, unknown> } };

const TOOLS = [
  {
    name: "list_requests",
    description: "List the requests a hook captured, newest first (credential headers redacted, sender IPs dropped)",
    inputSchema: { type: "object", properties: { hookId: { type: "string" } }, required: ["hookId"] },
  },
  {
    name: "get_request",
    description: "Get one captured request by id",
    inputSchema: {
      type: "object",
      properties: { hookId: { type: "string" }, requestId: { type: "string" } },
      required: ["hookId", "requestId"],
    },
  },
];

class RpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

function hookIdArg(args: Record<string, unknown>): string {
  if (!isValidHookId(args.hookId)) throw new RpcError(-32602, "hookId must be 1-64 letters, digits, '-' or '_'");
  return args.hookId;
}

function callTool(name: unknown, args: Record<string, unknown> = {}) {
  switch (name) {
    case "list_requests":
      return { requests: getRequests(hookIdArg(args)) };
    case "get_request": {
      const request = getRequests(hookIdArg(args)).find((entry) => entry.id === args.requestId);
      if (!request) throw new RpcError(-32602, `No captured request with id ${String(args.requestId)}`);
      return { request };
    }
    default:
      throw new RpcError(-32602, `Unknown tool: ${String(name)}`);
  }
}

export async function POST(request: NextRequest) {
  let id: RpcId = null;
  try {
    let body: RpcRequest;
    try {
      body = (await request.json()) as RpcRequest;
    } catch {
      throw new RpcError(-32700, "Parse error");
    }
    if (!body || typeof body !== "object") throw new RpcError(-32600, "Invalid request");
    id = body.id ?? null;
    let result: unknown;
    switch (body.method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "Webhook Tester", version: "1.0.0" },
        };
        break;
      case "tools/list":
        result = { tools: TOOLS };
        break;
      case "tools/call":
        result = callTool(body.params?.name, body.params?.arguments);
        break;
      default:
        throw new RpcError(-32601, `Unknown method: ${String(body.method)}`);
    }
    return NextResponse.json({ jsonrpc: "2.0", id, result });
  } catch (error) {
    const code = error instanceof RpcError ? error.code : -32603;
    const message = error instanceof RpcError ? error.message : "Internal error";
    return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: code === -32700 || code === -32600 ? 400 : 200 });
  }
}
