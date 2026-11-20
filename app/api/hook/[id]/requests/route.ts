import { NextRequest, NextResponse } from "next/server";
import { getRequests, clearRequests, MAX_CLEAR_IDS } from "@/lib/webhook-store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ requests: getRequests(id) });
}

/** The largest DELETE body read (200 ids fit in well under 16 KiB); anything bigger gets 413 unread. */
const MAX_DELETE_BODY_BYTES = 64 * 1024;

type BodyRead = { kind: "ok"; bytes: Uint8Array } | { kind: "too-large" } | { kind: "broken" };

/**
 * Reads the body up to `limit` bytes, so a huge body is never buffered whole. A read that errors or is aborted is
 * "broken", never an empty body: an empty body clears the whole queue, so it must be one that truly arrived empty.
 */
async function readCapped(req: NextRequest, limit: number): Promise<BodyRead> {
  if (req.signal?.aborted) return { kind: "broken" };
  if (!req.body) return { kind: "ok", bytes: new Uint8Array(0) };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        return { kind: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: "broken" };
  }
  if (req.signal?.aborted) return { kind: "broken" };
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: "ok", bytes };
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A JSON body {"ids": [...]} clears only those requests: the page sends the ids it had on screen when Clear was
  // pressed. Only a body of zero bytes clears the whole queue: the byte count is checked before decoding, because
  // decoding drops a UTF-8 BOM, so whitespace or a lone BOM counts as a body and must be valid JSON. Anything else
  // (bad JSON, ids that are not a list of non-empty strings, or the retired ?upTo= parameter) is refused with 400
  // and nothing is cleared.
  if (req.nextUrl.searchParams.has("upTo")) {
    return NextResponse.json({ error: "upTo is no longer supported; send {\"ids\": [...]}" }, { status: 400 });
  }
  // Bounded read: a declared Content-Length over the cap is refused before reading, and the stream is cut off at
  // the cap too, because Content-Length can be absent (chunked) or wrong.
  const tooLarge = () => NextResponse.json({ error: "body too large" }, { status: 413 });
  // An aborted or failed read, or fewer bytes than Content-Length declared, is refused: it must never fall
  // through to the clear-everything path of an empty body.
  const broken = () => NextResponse.json({ error: "the request body did not arrive complete" }, { status: 400 });
  const lengthHeader = req.headers.get("content-length");
  const declared = lengthHeader === null ? null : Number(lengthHeader);
  if (declared !== null && !(Number.isInteger(declared) && declared >= 0)) return broken();
  if (declared !== null && declared > MAX_DELETE_BODY_BYTES) return tooLarge();
  const read = await readCapped(req, MAX_DELETE_BODY_BYTES);
  if (read.kind === "too-large") return tooLarge();
  if (read.kind === "broken") return broken();
  const bytes = read.bytes;
  if (declared !== null && bytes.byteLength !== declared) return broken();
  if (bytes.byteLength === 0) {
    clearRequests(id);
    return NextResponse.json({ cleared: true });
  }
  const text = new TextDecoder().decode(bytes);
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
