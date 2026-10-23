import { NextRequest, NextResponse } from "next/server";
import { captureRequest, isValidHookId } from "@/lib/webhook-store";
import { sanitizeHeaders } from "@/lib/redact-headers";

async function handle(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidHookId(id)) {
    return NextResponse.json({ error: "Hook id must be 1-64 letters, digits, '-' or '_'." }, { status: 400 });
  }
  const headers = sanitizeHeaders(req.headers);
  const body = await req.text();

  const stored = captureRequest(id, {
    method: req.method,
    headers,
    body,
    receivedAt: Date.now(),
  });

  return NextResponse.json(stored.truncated ? { captured: true, hookId: id, truncated: true } : { captured: true, hookId: id });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
