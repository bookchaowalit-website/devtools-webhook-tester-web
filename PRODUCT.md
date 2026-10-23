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
