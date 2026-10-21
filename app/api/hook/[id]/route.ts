import { NextRequest, NextResponse } from "next/server";
import { captureRequest } from "@/lib/webhook-store";
import { sanitizeHeaders } from "@/lib/redact-headers";

async function handle(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = sanitizeHeaders(req.headers);
  const body = await req.text();

  captureRequest(id, {
    method: req.method,
    headers,
    body,
    receivedAt: Date.now(),
  });

  return NextResponse.json({ captured: true, hookId: id });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
