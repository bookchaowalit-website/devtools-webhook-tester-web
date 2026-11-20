"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppFoot, AppTop, Pill } from "@/components/app-shell";
import { ensureHookId, formatHeaders, formatTime, parseRequestList, tryPrettyJson } from "@/lib/webhook-view";

interface CapturedRequest {
  id: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  receivedAt: number;
  truncated?: boolean;
}

type Connection = "starting" | "live" | "error";

const SOURCE = "https://github.com/bookchaowalit-website/devtools-webhook-tester-web";
/** How long Undo stays on offer before the queue is cleared on the server. */
export const UNDO_MS = 6000;
const POLL_MS = 2500;

const noSubscribe = () => () => {};
let cachedHookId: string | null = null;

function clientHookId() {
  cachedHookId ??= ensureHookId(window.localStorage, () => crypto.randomUUID());
  return cachedHookId;
}

/** Test hook: forget the cached id so the next mount reads storage again. */
export function resetHookIdCache() {
  cachedHookId = null;
}

const CONNECTION_TEXT: Record<Connection, { tone: "green" | "amber" | "grey"; text: string }> = {
  starting: { tone: "grey", text: "Connecting…" },
  live: { tone: "green", text: "Listening" },
  error: { tone: "amber", text: "Can't reach the server, retrying" },
};

export default function Home() {
  // Read from localStorage on the client only; the server snapshot is null, so hydration matches.
  const hookId = useSyncExternalStore(noSubscribe, clientHookId, () => null);
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [connection, setConnection] = useState<Connection>("starting");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  // While Undo is on offer, requests received up to `upTo` are hidden but still on the server. Every Clear inside
  // the window joins one batch (upTo moves forward, count adds up), so one Undo brings all of them back.
  const [pendingClear, setPendingClear] = useState<{ upTo: number; count: number; viaKeyboard: boolean } | null>(null);
  const pendingRef = useRef<{ hookId: string; upTo: number; count: number } | null>(null);
  // A clear sent to the server and not answered yet: requests up to here stay hidden meanwhile.
  const [committingUpTo, setCommittingUpTo] = useState<number | null>(null);
  const [clearFailed, setClearFailed] = useState(false);
  const [toastFocused, setToastFocused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const queueHeading = useRef<HTMLHeadingElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  // Where focus goes once the toast has closed and the queue has re-rendered.
  const focusAfterClose = useRef<"clear" | "queue" | null>(null);

  const refresh = useCallback(async (id: string) => {
    try {
      const response = await fetch("/api/hook/" + id + "/requests", { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      setRequests(parseRequestList<CapturedRequest>(await response.json()));
      setConnection("live");
    } catch {
      // Keep the current queue; the next polling tick retries.
      setConnection("error");
    }
  }, []);

  useEffect(() => {
    if (!hookId) return;
    // First load on the next tick, then every 2.5 s; state is set only when a response arrives.
    const first = setTimeout(() => refresh(hookId), 0);
    const poll = setInterval(() => refresh(hookId), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [hookId, refresh]);

  // Sends the clear. The cleared requests stay hidden until the server answers: on success the queue is
  // reloaded, on failure they come back with a note to try again. `keepalive` lets the request finish when it
  // is sent while the page is being left.
  const commitClear = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    setCommittingUpTo(pending.upTo);
    setClearFailed(false);
    fetch("/api/hook/" + pending.hookId + "/requests?upTo=" + pending.upTo, { method: "DELETE", keepalive: true })
      .then(async (response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        await refresh(pending.hookId);
      })
      .catch(() => setClearFailed(true))
      .finally(() => setCommittingUpTo((current) => (current === pending.upTo ? null : current)));
  }, [refresh]);

  // Leaving the page while Undo is on offer still clears the queue: on unmount, and on pagehide (reload, close,
  // navigation), where React cleanup does not run.
  useEffect(() => commitClear, [commitClear]);
  useEffect(() => {
    window.addEventListener("pagehide", commitClear);
    return () => window.removeEventListener("pagehide", commitClear);
  }, [commitClear]);

  // A Clear made from the keyboard moves focus to Undo (the Clear button is about to be disabled).
  useEffect(() => { if (pendingClear?.viaKeyboard) undoButton.current?.focus(); }, [pendingClear]);
  // The Undo window closes 6 s after the latest Clear (each Clear restarts it), but never while the toast holds focus.
  useEffect(() => {
    if (!pendingClear || toastFocused) return;
    const timer = setTimeout(() => {
      commitClear();
      setPendingClear(null);
    }, UNDO_MS);
    return () => clearTimeout(timer);
  }, [pendingClear, toastFocused, commitClear]);
  // After Undo, back to Clear queue (enabled again); after Escape, to the queue heading.
  useEffect(() => {
    const target = focusAfterClose.current;
    if (pendingClear || !target) return;
    focusAfterClose.current = null;
    const button = clearButton.current;
    (target === "clear" && button && !button.disabled ? button : queueHeading.current)?.focus();
  }, [pendingClear, requests]);

  // Reserve room for the toast so it never covers the last focusable control.
  useEffect(() => {
    if (!pendingClear) return;
    document.documentElement.style.setProperty("--as-toast-space", "72px");
    return () => {
      document.documentElement.style.removeProperty("--as-toast-space");
    };
  }, [pendingClear]);

  const hiddenUpTo = Math.max(pendingClear?.upTo ?? 0, committingUpTo ?? 0);
  const visible = hiddenUpTo ? requests.filter((request) => request.receivedAt > hiddenUpTo) : requests;
  const selected = visible.find((request) => request.id === selectedId) ?? visible[0] ?? null;
  const hookUrl = hookId && typeof window !== "undefined" ? window.location.origin + "/api/hook/" + hookId : "";
  const status = CONNECTION_TEXT[connection];

  const handleCopy = async () => {
    if (!hookUrl) return;
    try {
      await navigator.clipboard.writeText(hookUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  const handleSendTest = async () => {
    if (!hookId) return;
    setSending(true);
    setSendFailed(false);
    try {
      const response = await fetch("/api/hook/" + hookId, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Test-Source": "webhook-tester-ui" },
        body: JSON.stringify({ event: "test.ping", sentAt: new Date().toISOString(), payload: { hello: "world" } }),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      await refresh(hookId);
    } catch {
      setSendFailed(true);
    } finally {
      setSending(false);
    }
  };

  const handleClear = (viaKeyboard: boolean) => {
    if (!hookId || visible.length === 0) return;
    // A second Clear while Undo is still on offer joins the first: one Undo restores both.
    const earlier = pendingRef.current;
    const upTo = Math.max(earlier?.upTo ?? 0, ...visible.map((request) => request.receivedAt));
    const count = (earlier?.count ?? 0) + visible.length;
    pendingRef.current = { hookId, upTo, count };
    setClearFailed(false);
    setPendingClear({ upTo, count, viaKeyboard });
    setSelectedId(null);
    setAnnouncement(`Cleared ${count} ${count === 1 ? "request" : "requests"}. Undo is available for a few seconds.`);
    // The Clear button is about to be disabled: a pointer user's focus stays on the queue.
    if (!viaKeyboard) queueHeading.current?.focus();
  };

  const handleUndo = () => {
    const count = pendingRef.current?.count ?? 0;
    pendingRef.current = null;
    focusAfterClose.current = "clear";
    setPendingClear(null);
    setToastFocused(false);
    setAnnouncement(`Restored ${count} ${count === 1 ? "request" : "requests"}.`);
  };

  // Escape: keep the clear (it is sent to the server now) and close the toast.
  const dismissToast = () => {
    commitClear();
    focusAfterClose.current = "queue";
    setPendingClear(null);
    setToastFocused(false);
  };

  const payload = selected ? tryPrettyJson(selected.body) : null;

  return (
    <div className="as">
      <a className="as-skip" href="#queue">Skip to the queue</a>
      <AppTop name="Webhook tester" tagline="Inspect incoming requests" />

      <main className="as-page wh-page">
        <div className="as-intro">
          <p className="as-eyebrow">Temporary capture address</p>
          <h1>See what arrives before you trust the payload.</h1>
          <p>Give a sender the address below, or send a test, then read each request&apos;s headers and body. No tunnel, no account.</p>
        </div>

        <section className="as-composer wh-address" aria-labelledby="address-heading">
          <h2 id="address-heading" className="wh-label">Your capture address</h2>
          <code className="wh-url">{hookUrl || "Creating your address…"}</code>
          <div className="wh-actions">
            <button type="button" className="as-button" onClick={handleSendTest} disabled={!hookId || sending}>{sending ? "Sending…" : "Send test"}</button>
            <button type="button" className="as-plain" onClick={handleCopy} disabled={!hookUrl}>{copyState === "copied" ? "Copied" : "Copy address"}</button>
            <a className="as-plain wh-jump" href="#queue">Go to queue ({visible.length})</a>
          </div>
          <p className="wh-status-line" role="status">
            {copyState === "failed" ? "Copy was blocked by the browser. Select the address above and copy it by hand." : sendFailed ? "The test request did not reach the server. Try again." : ""}
          </p>
          <p className="wh-footnote">
            Requests stay in server memory for up to an hour and can disappear on restart. Authorization, Cookie, API-key and token headers are saved as
            &ldquo;redacted&rdquo; and sender IPs are dropped, because anyone with the address can read the queue.
          </p>
        </section>

        <div className="wh-grid">
          <section id="queue" className="wh-queue" aria-labelledby="queue-heading">
            <div className="as-section-head">
              <h2 id="queue-heading" className="as-section-title" tabIndex={-1} ref={queueHeading}>Incoming queue</h2>
              <span className="wh-count">{visible.length} captured</span>
            </div>
            <p className="wh-connection" role="status"><span className="as-dot" data-tone={status.tone} aria-hidden="true" />{status.text}</p>
            <p className="wh-status-line" role="alert">{clearFailed ? "The queue was not cleared on the server, so the requests are back. Press Clear queue to try again." : ""}</p>
            {visible.length === 0 ? (
              <div className="as-list"><p className="as-empty"><strong>Nothing captured yet</strong>Send a request to the address above, or press Send test. It shows up here within a few seconds.</p></div>
            ) : (
              <ul className="as-list" aria-label="Captured requests">
                {visible.map((request) => (
                  <li key={request.id}>
                    <button type="button" className="wh-req" aria-current={selected?.id === request.id ? "true" : undefined} onClick={() => setSelectedId(request.id)}>
                      <span className="wh-method">{request.method}</span>
                      <span className="wh-time">{formatTime(request.receivedAt)}</span>
                      <span className="wh-id">{request.id.slice(0, 8)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="as-actions-row">
              <button type="button" ref={clearButton} className="as-plain as-danger" onClick={(event) => handleClear(event.detail === 0)} disabled={visible.length === 0}>Clear queue</button>
            </div>
          </section>

          <section className="wh-inspect" aria-labelledby="inspect-heading">
            <div className="as-section-head">
              <h2 id="inspect-heading" className="as-section-title">Request</h2>
              {selected ? <span className="wh-count">{selected.method} · {formatTime(selected.receivedAt)}</span> : null}
            </div>
            {!selected || !payload ? (
              <div className="as-list"><p className="as-empty"><strong>No request selected</strong>Pick a request in the queue to read its headers, body and delivery time.</p></div>
            ) : (
              <div className="wh-sheet">
                <dl className="wh-meta">
                  <div><dt>Method</dt><dd>{selected.method}</dd></div>
                  <div><dt>Received</dt><dd>{new Date(selected.receivedAt).toLocaleString()}</dd></div>
                  <div><dt>Request id</dt><dd className="wh-mono">{selected.id}</dd></div>
                </dl>
                <h3>Headers</h3>
                <pre>{formatHeaders(selected.headers) || "(no headers)"}</pre>
                <h3 className="wh-payload-head">
                  Payload <Pill tone="grey">{payload.isJson ? "JSON" : "Text"}</Pill>
                  {selected.truncated ? <span className="wh-trunc">First 64 KiB only</span> : null}
                </h3>
                <pre>{payload.pretty}</pre>
              </div>
            )}
          </section>
        </div>

        <p className="as-note">The capture route accepts GET, POST, PUT, PATCH and DELETE. Nothing here is a permanent record: treat it as a debugging aid.</p>
      </main>

      <AppFoot source={SOURCE} />

      <p className="as-sr" role="status" aria-live="polite">{announcement}</p>
      {pendingClear ? (
        <div
          className="as-toast"
          role="group"
          aria-label="Undo clear"
          onFocus={() => setToastFocused(true)}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setToastFocused(false); }}
          onKeyDown={(event) => { if (event.key === "Escape") dismissToast(); }}
        >
          <span>Cleared {pendingClear.count} {pendingClear.count === 1 ? "request" : "requests"}</span>
          <button ref={undoButton} type="button" className="as-plain" onClick={handleUndo}>Undo</button>
        </div>
      ) : null}
    </div>
  );
}
