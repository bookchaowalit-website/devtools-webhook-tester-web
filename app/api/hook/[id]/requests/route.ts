import { NextRequest, NextResponse } from "next/server";
import { getRequests, clearRequests, MAX_CLEAR_IDS } from "@/lib/webhook-store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ requests: getRequests(id) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A JSON body {"ids": [...]} clears only those requests: the page sends the ids it had on screen when Clear was
  // pressed. Only a truly empty body clears the whole queue; whitespace counts as a body and must be valid JSON. Anything else (bad JSON, ids that are not a list of non-empty
  // strings, or the retired ?upTo= parameter) is refused with 400 and nothing is cleared.
  if (req.nextUrl.searchParams.has("upTo")) {
    return NextResponse.json({ error: "upTo is no longer supported; send {\"ids\": [...]}" }, { status: 400 });
  }
  const text = await req.text();
  if (text === "") {
    clearRequests(id);
    return NextResponse.json({ cleared: true });
  }
  let ids: unknown;
  try {
    ids = (JSON.parse(text) as { ids?: unknown } | null)?.ids;
  } catch {
    ids = undefined;
  }
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_CLEAR_IDS || !ids.every((value) => typeof value === "string" && value !== "")) {
    return NextResponse.json({ error: "ids must be a non-empty list of request ids" }, { status: 400 });
  }
  clearRequests(id, ids);
  return NextResponse.json({ cleared: true });
}
