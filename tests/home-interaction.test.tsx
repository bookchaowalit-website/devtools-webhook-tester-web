// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home, { UNDO_MS, resetHookIdCache } from "@/app/page";
import { HOOK_ID_STORAGE } from "@/lib/webhook-view";
import { MAX_CLEAR_IDS } from "@/lib/webhook-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HOOK = "hook-under-test";
type Req = { id: string; method: string; headers: Record<string, string>; body: string; receivedAt: number; truncated?: boolean };
let server: Req[];
let failList: boolean;
let calls: { url: string; method: string; keepalive?: boolean }[];
// When set, DELETE waits for this promise and answers with deleteStatus.
let deleteGate: Promise<void> | null;
let deleteStatus: number;
let deletedIds: string[];
let root: Root;
let host: HTMLDivElement;

const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
// detail 1 = pointer click, 0 = keyboard (Enter/Space) click.
const click = (el: Element, detail = 1) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail })); });

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  localStorage.setItem(HOOK_ID_STORAGE, HOOK);
  resetHookIdCache();
  failList = false;
  calls = [];
  deleteGate = null;
  deleteStatus = 200;
  deletedIds = [];
  server = [
    { id: "aaaaaaaa-1", method: "POST", headers: { "content-type": "application/json" }, body: '{"a":1}', receivedAt: 2000 },
    { id: "bbbbbbbb-2", method: "GET", headers: {}, body: "plain", receivedAt: 1000, truncated: true },
  ];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, keepalive: init?.keepalive });
    if (url.endsWith("/requests") && method === "GET") {
      if (failList) throw new Error("offline");
      return new Response(JSON.stringify({ requests: server }));
    }
    if (url.endsWith("/requests") && method === "DELETE") {
      if (deleteGate) await deleteGate;
      if (deleteStatus !== 200) return new Response("{}", { status: deleteStatus });
      const ids: string[] = JSON.parse(init?.body as string).ids;
      // Same cap as the real route: a larger list is refused and nothing is deleted.
      if (ids.length > MAX_CLEAR_IDS) return new Response("{}", { status: 400 });
      deletedIds.push(...ids);
      server = server.filter((r) => !ids.includes(r.id));
      return new Response("{}");
    }
    if (method === "POST") {
      server = [{ id: "cccccccc-3", method: "POST", headers: {}, body: init?.body as string, receivedAt: 3000 }, ...server];
      return new Response("{}");
    }
    return new Response("{}", { status: 404 });
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Home />));
  await flush(0);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("capture desk", () => {
  it("shows the full address, lists requests and opens the newest one", () => {
    expect(host.querySelector(".wh-url")!.textContent).toBe(window.location.origin + "/api/hook/" + HOOK);
    expect(host.querySelectorAll(".wh-req")).toHaveLength(2);
    expect(host.querySelector(".wh-req[aria-current='true']")!.textContent).toContain("POST");
    expect(host.querySelector(".wh-sheet")!.textContent).toContain('"a": 1');
    expect(host.querySelector(".wh-connection")!.textContent).toBe("Listening");
  });

  it("selects another request and marks a truncated text body", () => {
    click(host.querySelectorAll(".wh-req")[1]);
    const sheet = host.querySelector(".wh-sheet")!.textContent!;
    expect(sheet).toContain("Text");
    expect(sheet).toContain("First 64 KiB only");
    expect(sheet).toContain("(no headers)");
  });

  it("ties the status dot to polling: a failed poll says so and keeps the queue", async () => {
    failList = true;
    await flush(2500);
    expect(host.querySelector(".wh-connection")!.textContent).toContain("Can't reach the server");
    expect(host.querySelectorAll(".wh-req")).toHaveLength(2);
  });

  it("sends a test request and shows it on top", async () => {
    click(button("Send test"));
    await flush(0);
    expect(host.querySelectorAll(".wh-req")).toHaveLength(3);
    expect(calls.some((c) => c.method === "POST")).toBe(true);
  });

  it("copies the address, and explains when the browser blocks copying", async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    click(button("Copy address"));
    await flush(0);
    expect(button("Copied")).toBeTruthy();
    await flush(2000);
    click(button("Copy address"));
    await flush(0);
    expect(host.textContent).toContain("Copy was blocked by the browser");
  });
});

describe("clear with undo", () => {
  it("hides the queue, offers Undo, and Undo restores it without a server call", async () => {
    click(button("Clear queue"));
    expect(host.querySelectorAll(".wh-req")).toHaveLength(0);
    expect(host.querySelector(".as-toast")!.textContent).toContain("Cleared 2 requests");
    expect(document.activeElement?.id).toBe("queue-heading");
    click(button("Undo"));
    await flush(0);
    expect(host.querySelectorAll(".wh-req")).toHaveLength(2);
    expect(document.activeElement?.textContent).toBe("Clear queue");
    await flush(UNDO_MS);
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("clears on the server after the Undo window, keeping requests that arrived meanwhile", async () => {
    click(button("Clear queue"));
    server = [{ id: "dddddddd-4", method: "PUT", headers: {}, body: "", receivedAt: 5000 }, ...server];
    await flush(2500);
    expect(host.querySelectorAll(".wh-req")).toHaveLength(1);
    await flush(UNDO_MS);
    expect(deletedIds).toEqual(["aaaaaaaa-1", "bbbbbbbb-2"]);
    expect(host.querySelector(".as-toast")).toBeNull();
    expect(server.map((r) => r.id)).toEqual(["dddddddd-4"]);
  });
});

describe("batch Undo", () => {
  it("consecutive clears restore together with one Undo", async () => {
    click(button("Clear queue"));
    server = [{ id: "dddddddd-4", method: "PUT", headers: {}, body: "", receivedAt: 5000 }, ...server];
    await flush(2500);
    expect(host.querySelectorAll(".wh-req")).toHaveLength(1);
    click(button("Clear queue"));
    expect(host.querySelectorAll(".wh-req")).toHaveLength(0);
    expect(host.querySelector(".as-toast span")!.textContent).toBe("Cleared 3 requests");
    // The second Clear restarted the window and sent nothing to the server yet.
    await flush(4000);
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    click(button("Undo"));
    await flush(0);
    expect(host.querySelectorAll(".wh-req")).toHaveLength(3);
    expect(host.querySelector('.as-sr[role="status"]')!.textContent).toBe("Restored 3 requests.");
    await flush(UNDO_MS);
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("keyboard remove focuses Undo; the toast stays while focused, Escape clears now and returns to the queue", async () => {
    click(button("Clear queue"), 0);
    expect(document.activeElement).toBe(button("Undo"));
    await flush(UNDO_MS * 2);
    expect(host.querySelector(".as-toast")).not.toBeNull();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    act(() => { host.querySelector(".as-toast")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await flush(0);
    expect(host.querySelector(".as-toast")).toBeNull();
    expect(deletedIds).toEqual(["aaaaaaaa-1", "bbbbbbbb-2"]);
    expect(document.activeElement?.id).toBe("queue-heading");
  });
});

describe("clear sent to the server", () => {
  it("keeps the cleared requests hidden until the server answers, then shows the reloaded queue", async () => {
    let open!: () => void;
    deleteGate = new Promise((resolve) => { open = resolve; });
    click(button("Clear queue"));
    await flush(UNDO_MS);
    expect(host.querySelector(".as-toast")).toBeNull();
    // DELETE is in flight: still hidden, even though the list in memory is from before the clear.
    expect(host.querySelectorAll(".wh-req")).toHaveLength(0);
    await act(async () => { open(); });
    await flush(0);
    expect(host.querySelectorAll(".wh-req")).toHaveLength(0);
    expect(host.querySelector(".wh-queue .wh-status-line")!.textContent).toBe("");
  });

  it("a refused clear brings the requests back and says so where it can be seen", async () => {
    deleteStatus = 500;
    click(button("Clear queue"));
    await flush(UNDO_MS);
    await flush(0);
    expect(host.querySelectorAll(".wh-req")).toHaveLength(2);
    expect(host.querySelector(".wh-queue .wh-status-line")!.textContent).toContain("was not cleared on the server");
  });

  it("leaving the page (pagehide) during the Undo window sends the clear with keepalive", async () => {
    click(button("Clear queue"));
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await flush(0);
    const sent = calls.filter((c) => c.method === "DELETE");
    expect(sent).toHaveLength(1);
    expect(deletedIds).toEqual(["aaaaaaaa-1", "bbbbbbbb-2"]);
    expect(sent[0].keepalive).toBe(true);
    // Sent, so it can no longer be undone: the toast is gone (a back/forward-cache restore shows no dead Undo).
    expect(host.querySelector(".as-toast")).toBeNull();
  });
});

describe("clear by id (round 2)", () => {
  it("never clears a request received in the same millisecond that the page had not listed", async () => {
    click(button("Clear queue"));
    // Arrives after the last poll, with the same receivedAt as the newest listed request.
    server = [{ id: "eeeeeeee-5", method: "POST", headers: {}, body: "", receivedAt: 2000 }, ...server];
    await flush(UNDO_MS);
    await flush(0);
    expect(deletedIds).toEqual(["aaaaaaaa-1", "bbbbbbbb-2"]);
    expect(server.map((r) => r.id)).toEqual(["eeeeeeee-5"]);
  });

  it("a failed reload after a successful clear does not show the deleted requests again", async () => {
    click(button("Clear queue"));
    failList = true;
    await flush(UNDO_MS);
    await flush(0);
    expect(deletedIds).toHaveLength(2);
    expect(host.querySelectorAll(".wh-req")).toHaveLength(0);
    expect(host.querySelector(".wh-queue .wh-status-line")!.textContent).toBe("");
  });

  it("sends a clear larger than the API cap in batches, so every request is deleted", async () => {
    server = Array.from({ length: MAX_CLEAR_IDS + 50 }, (_, i) => ({ id: "req-" + i, method: "POST", headers: {}, body: "", receivedAt: 5000 - i }));
    await flush(2500);
    click(button("Clear queue"));
    await flush(UNDO_MS);
    await flush(0);
    const sent = calls.filter((c) => c.method === "DELETE");
    expect(sent).toHaveLength(2);
    expect(deletedIds).toHaveLength(MAX_CLEAR_IDS + 50);
    expect(server).toHaveLength(0);
    expect(host.querySelector(".wh-queue .wh-status-line")!.textContent).toBe("");
  });
});
