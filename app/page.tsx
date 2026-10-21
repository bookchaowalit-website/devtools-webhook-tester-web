"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface CapturedRequest {
  id: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  receivedAt: number;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function tryPrettyJson(body: string) {
  if (!body.trim()) return { pretty: "(empty payload)", isJson: false };
  try {
    return { pretty: JSON.stringify(JSON.parse(body), null, 2), isJson: true };
  } catch {
    return { pretty: body, isJson: false };
  }
}

export default function Home() {
  const [hookId, setHookId] = useState<string | null>(null);
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const existing = localStorage.getItem("webhook-tester-hook-id");
    const id = existing ?? crypto.randomUUID();
    if (!existing) localStorage.setItem("webhook-tester-hook-id", id);
    setHookId(id);
  }, []);

  const refresh = useCallback(async (id: string) => {
    try {
      const response = await fetch("/api/hook/" + id + "/requests", { cache: "no-store" });
      const data = await response.json();
      setRequests(data.requests ?? []);
    } catch {
      // The next polling tick retries without discarding the current queue.
    }
  }, []);

  useEffect(() => {
    if (!hookId) return;
    refresh(hookId);
    pollRef.current = setInterval(() => refresh(hookId), 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [hookId, refresh]);

  const hookUrl = hookId && typeof window !== "undefined" ? window.location.origin + "/api/hook/" + hookId : "";
  const selected = requests.find((request) => request.id === selectedId) ?? requests[0] ?? null;

  const handleCopy = async () => {
    if (!hookUrl) return;
    await navigator.clipboard.writeText(hookUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const handleSendTest = async () => {
    if (!hookId) return;
    setSending(true);
    try {
      await fetch("/api/hook/" + hookId, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Test-Source": "webhook-tester-ui" },
        body: JSON.stringify({ event: "test.ping", sentAt: new Date().toISOString(), payload: { hello: "world" } }),
      });
      await refresh(hookId);
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    if (!hookId) return;
    await fetch("/api/hook/" + hookId + "/requests", { method: "DELETE" });
    setRequests([]);
    setSelectedId(null);
  };

  return (
    <main className="intake-room">
      <span className="contract-mark" dangerouslySetInnerHTML={{ __html: "<!-- THESIS: requests arrive as registered envelopes; FINISH: capture URL, queue, header and body inspection -->" }} />
      <div className="intake-shell">
        <header className="intake-topbar">
          <Link href="/" className="intake-wordmark">INTAKE / WEBHOOK</Link>
          <span className="intake-status"><i aria-hidden="true" /> Listening for envelopes</span>
        </header>

        <section className="intake-intro">
          <div>
            <p className="intake-overline">registered request room</p>
            <h1>See what arrives before you trust the payload.</h1>
          </div>
          <p className="intake-deck">A temporary capture desk for debugging webhooks. Give a sender the address, send a test, then inspect the envelope without a tunnel or an account.</p>
        </section>

        <section className="address-slip" aria-labelledby="address-heading">
          <div className="slip-label"><span className="slip-index">01</span><h2 id="address-heading">Your capture address</h2></div>
          <div className="address-row">
            <code>{hookUrl || "generating address…"}</code>
            <button type="button" className="slip-button" onClick={handleCopy} disabled={!hookUrl}>{copied ? "Copied" : "Copy address"}</button>
            <button type="button" className="slip-button dark" onClick={handleSendTest} disabled={!hookId || sending}>{sending ? "Sending…" : "Send test"}</button>
          </div>
          <p className="slip-footnote">Requests stay in server memory for up to an hour and can disappear on restart. This is a debugging desk, not a durable event archive. Authorization, Cookie, API-key and token headers are saved as “redacted” and sender IPs are dropped, because anyone with the address can read the queue.</p>
        </section>

        <section className="mailroom" aria-labelledby="mailroom-heading">
          <div className="queue">
            <header className="queue-heading"><div><span className="slip-index">02</span><h2 id="mailroom-heading">Incoming queue</h2></div><span>{requests.length} captured</span></header>
            {requests.length === 0 ? (
              <div className="queue-empty"><span className="empty-stamp">OPEN</span><p>Send a request to the address above. It will appear here as soon as the desk receives it.</p></div>
            ) : (
              <ul className="request-list">
                {requests.map((request) => (
                  <li key={request.id}>
                    <button type="button" className={"request-slip " + (selected?.id === request.id ? "is-selected" : "")} onClick={() => setSelectedId(request.id)}>
                      <span className="request-method">{request.method}</span>
                      <span className="request-time">{formatTime(request.receivedAt)}</span>
                      <span className="request-id">{request.id.slice(0, 8)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="clear-button" onClick={handleClear} disabled={requests.length === 0}>Clear queue</button>
          </div>

          <article className="inspection-sheet" aria-label="Request inspection">
            <header className="inspection-heading"><div><span className="slip-index">03</span><h2>Open envelope</h2></div><span>{selected ? selected.method + " / received" : "no letter selected"}</span></header>
            {!selected ? (
              <div className="inspection-empty"><p>Select a captured request to inspect its headers, body, and delivery time.</p></div>
            ) : (
              <div className="inspection-body">
                <div className="inspection-meta"><span>Received</span><strong>{new Date(selected.receivedAt).toLocaleString()}</strong></div>
                <section><h3>Headers</h3><pre>{Object.entries(selected.headers).map(([key, value]) => key + ": " + value).join("\n")}</pre></section>
                <section><h3>Payload <small>{tryPrettyJson(selected.body).isJson ? "JSON" : "text"}</small></h3><pre>{tryPrettyJson(selected.body).pretty}</pre></section>
              </div>
            )}
          </article>
        </section>

        <footer className="intake-footer">The capture route accepts GET, POST, PUT, PATCH, and DELETE. No request is presented as permanent evidence.</footer>
      </div>
    </main>
  );
}
