import { NextRequest, NextResponse } from "next/server";
import { getRequests, clearRequests } from "@/lib/webhook-store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ requests: getRequests(id) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ?upTo=<ms timestamp> clears only what the page had on screen when Clear was pressed. Without the parameter
  // the whole queue is cleared; a parameter that is empty or not a positive timestamp is refused (400) and
  // nothing is cleared, so a malformed request can never wipe the queue.
  const raw = req.nextUrl.searchParams.get("upTo");
  if (raw === null) {
    clearRequests(id);
    return NextResponse.json({ cleared: true });
  }
  const upTo = raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(upTo) || upTo <= 0) {
    return NextResponse.json({ error: "upTo must be a positive millisecond timestamp" }, { status: 400 });
  }
  clearRequests(id, upTo);
  return NextResponse.json({ cleared: true });
}
