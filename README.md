# Webhook Tester

A temporary capture address for debugging webhooks. Open the page to get a hook URL, point a sender at it (or press
"Send test"), and read each request's method, time, headers and body. Requests live in server memory only.

Live: https://webhook-tester.bookchaowalit.com (deployed by Vercel CLI; it can lag `main`, see `PRODUCT.md`).

## What it does not do

- No replay, response mocking or signature verification. No accounts, no durable storage, no real-time push (the
  page polls every 2.5 s).
- Captured requests vanish after an hour without access, on a cold start, or on a different server instance.

## How capture works

- `GET|POST|PUT|PATCH|DELETE /api/hook/<id>` stores the request. `<id>` must be 1-64 letters, digits, `-` or `_`
  (the page uses a UUID kept in `localStorage`); anything else gets HTTP 400.
- Credential headers (Authorization, Cookie, API-key, token, secret, session ...) are stored as `[redacted]`; sender IP
  headers and every `x-vercel-*` header are dropped (`lib/redact-headers.ts`).
- Limits (`lib/webhook-store.ts`): 50 requests per hook, 200 hooks, 1 hour idle expiry, bodies cut to the first 64 KiB
  (the answer then says `"truncated": true`).
- `GET /api/hook/<id>/requests` lists them; `DELETE` clears them. Anyone with the hook URL can read the queue.

## MCP endpoint

`POST /api/mcp` (JSON-RPC 2.0, the request `id` is echoed): `initialize`, `tools/list`, and `tools/call` with
`list_requests` (`hookId`) and `get_request` (`hookId`, `requestId`) over the same store. Unknown tools and methods
return JSON-RPC errors.

## Run

```bash
npm ci
npm run dev
```

## Checks

```bash
npm test           # Vitest: header redaction, store limits, capture + MCP routes, page helpers and render, Sentry scrubbing
npm run lint
npm run typecheck
npm run build
```

CI (`.github/workflows/ci.yml`) runs the shared Node workflow (with a line-coverage gate) and the shared security
scan on every push and PR to `main`.

## Code map

- `lib/webhook-store.ts`: in-memory store with the limits above. `lib/redact-headers.ts`: header redaction.
- `lib/webhook-view.ts`: hook id persistence and payload/header display helpers used by `app/page.tsx`.
- `app/api/hook/[id]/route.ts`, `app/api/hook/[id]/requests/route.ts`, `app/api/mcp/route.ts`: the routes above.
- `lib/sentry.ts` + `instrumentation*.ts`: error reporting to Sentry, errors only; request data, breadcrumbs, extra
  context and stack frame variables are stripped so captured payloads never reach Sentry. Off when
  `NEXT_PUBLIC_SENTRY_DSN` is unset.
- `app/more-projects/page.tsx`: shared portfolio link page (copied per repository, not a package).

## License

MIT
