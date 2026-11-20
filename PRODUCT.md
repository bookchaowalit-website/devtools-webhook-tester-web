# Webhook Tester — Product truth

> Inferred from the code and copy (no user interview). Checked against the portfolio card claims review
> (`portfolio-site-web/docs/audits/CARD-CLAIMS-REVIEW-2026-10.md`, row `webhook-tester`) on 2026-10-23.

## What it is

A temporary, account-free capture address for debugging webhooks, backed by an in-memory store on the server.

## Who it is for

A developer wiring up a webhook sender who wants to see exactly what arrives (method, headers, body) without a tunnel.

## What works today

1. The page creates a hook id (UUID in `localStorage`), shows its capture URL with Copy and "Send test", and polls the
   queue every 2.5 s. Select a request to read its time, headers and pretty-printed JSON (or raw text) body; "Clear
   queue" empties it.
2. The capture route accepts GET, POST, PUT, PATCH and DELETE. Credential headers are stored as `[redacted]`, sender
   IPs and `x-vercel-*` headers are dropped. Limits: 50 requests per hook, 200 hooks, 1 hour idle expiry, bodies cut
   to 64 KiB (marked as truncated), hook ids 1-64 URL-safe characters.
3. `/api/mcp` answers JSON-RPC with `list_requests` and `get_request` over the same store and echoes the request id.
4. Front-end and server errors go to Sentry (errors only; request, user, breadcrumbs, extra context and stack frame
   variables stripped, so webhook payloads and headers are never sent) when `NEXT_PUBLIC_SENTRY_DSN` is set.

## What does not work (and must not be claimed)

- No payload replay, response mocking or signature verification, and no real-time push (claims removed in the 2026-10
  card review). The page polls.
- Not durable: requests disappear after an hour idle, on a cold start, or when another serverless instance answers.
- No privacy beyond the hook id: anyone who knows the URL can read and clear that queue.

## Known limits

- Undo after the queue overflowed: the queue keeps the newest 50 requests per hook, and requests waiting in the 6 s
  Undo window are still part of it. If new webhooks push the oldest cleared ones out during that window, Undo cannot
  bring those back, although the toast counted them. Keeping a separate pending set on the server would fix it; not
  done for a demo tool (Codex report -061cdf0ee4).
- Leaving the page during the Undo window sends the clear on `pagehide` with `keepalive`; a browser that kills the
  page without `pagehide` (a crash, a force-quit) leaves the queue uncleared.
- Two clears in flight at once share one failure note: if one fails, the note says the queue was not cleared even
  if the other succeeded (each batch's hidden ids are tracked separately). Codex report -4e65497351, P3.
- A clear split into several batches (more than 200 ids) un-hides all of its ids as soon as any batch fails, so
  requests another batch is still deleting can show briefly until the next reload. Codex report -afc9d4d0a7, P3.
- Every batch is sent with `keepalive`, and browsers cap in-flight keepalive bodies at 64 KiB in total; a very large
  accumulated clear (thousands of ids) can have batches refused and leave part of the queue. Codex report
  -afc9d4d0a7, P3.
- Queue reloads are not ordered: if the reload after one Clear answers later than the reload after the next Clear,
  the older snapshot can show already-deleted requests until the next successful poll (or longer if polling fails).
  Codex report -932c694930, P2.
- `app/page.tsx` also exports `UNDO_MS` and `resetHookIdCache` for tests; `next build --webpack` type-checks page
  exports and would refuse them. The default Turbopack build (CI, Vercel) accepts them. Codex report -932c694930, P3.
- Frozen 2026-11-20: later review findings are recorded here, not fixed.

## Live URL and deploy state

- Live: https://webhook-tester.bookchaowalit.com (HTTP 200 on 2026-10-23).
- The Vercel project `bookchaowalit-webhook-tester-frontend` is deployed only by CLI. Last production deployment:
  2026-10-21, CLI, commit 38d2883 (Wave 1 header redaction). The CVE patch (Next 16.4.2) and this L2 pass are not
  live yet: Vercel's daily deployment limit was reached on 2026-10-23 and the coordinator deploys the latest green
  `main` later. The Git link names the old repository `bookchaowalit/bookchaowalit-webhook-tester-frontend`, so a
  push to `main` does not deploy (owner action D9).
- `NEXT_PUBLIC_SENTRY_DSN` is set on the Vercel project (Sentry project `devtools-webhook-tester-web`, org
  `personal-yu0`).

## Boundaries

- Stateless apart from the in-memory capture store, which is per server instance. Nothing is written to disk or a
  database.
