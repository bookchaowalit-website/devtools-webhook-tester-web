// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home, { UNDO_MS, resetHookIdCache } from "@/app/page";
import { HOOK_ID_STORAGE } from "@/lib/webhook-view";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HOOK = "hook-under-test";
type Req = { id: string; method: string; headers: Record<string, string>; body: string; receivedAt: number; truncated?: boolean };
let server: Req[];
let failList: boolean;
let calls: { url: string; method: string }[];
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
  server = [
    { id: "aaaaaaaa-1", method: "POST", headers: { "content-type": "application/json" }, body: '{"a":1}', receivedAt: 2000 },
    { id: "bbbbbbbb-2", method: "GET", headers: {}, body: "plain", receivedAt: 1000, truncated: true },
  ];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.endsWith("/requests") && method === "GET") {
      if (failList) throw new Error("offline");
      return new Response(JSON.stringify({ requests: server }));
    }
    if (url.includes("/requests?upTo=") && method === "DELETE") {
      const upTo = Number(url.split("upTo=")[1]);
      server = server.filter((r) => r.receivedAt > upTo);
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
    expect(calls.find((c) => c.method === "DELETE")!.url).toContain("?upTo=2000");
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
    expect(calls.find((c) => c.method === "DELETE")!.url).toContain("?upTo=2000");
    expect(document.activeElement?.id).toBe("queue-heading");
  });
});
