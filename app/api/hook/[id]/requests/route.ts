import { NextRequest, NextResponse } from "next/server";
import { getRequests, clearRequests } from "@/lib/webhook-store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ requests: getRequests(id) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ?upTo=<ms timestamp> clears only what the page had on screen when Clear was pressed.
  const upTo = Number(req.nextUrl.searchParams.get("upTo"));
  clearRequests(id, Number.isFinite(upTo) && upTo > 0 ? upTo : undefined);
  return NextResponse.json({ cleared: true });
}
