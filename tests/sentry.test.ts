import assert from "node:assert/strict";
import { test } from "vitest";
import { scrubEvent, sentryOptions } from "@/lib/sentry";

test("Sentry stays disabled when no DSN is configured", () => {
  assert.equal(sentryOptions(undefined).enabled, false);
  assert.equal(sentryOptions("").enabled, false);
});

test("Sentry reports errors only: no PII, tracing, trace headers or breadcrumbs", () => {
  const options = sentryOptions("https://key@o0.ingest.sentry.io/1");
  assert.equal(options.enabled, true);
  assert.equal(options.sendDefaultPii, false);
  assert.equal(options.tracesSampleRate, undefined);
  assert.deepEqual(options.tracePropagationTargets, []);
  assert.equal(options.maxBreadcrumbs, 0);
  assert.equal(options.beforeSendTransaction(), null);
});

test("scrubEvent drops request data, user, breadcrumbs and extra context", () => {
  const event = scrubEvent({
    message: "boom",
    request: { url: "https://webhook-tester.bookchaowalit.com/?token=secret", headers: { cookie: "a=b" } },
    user: { ip_address: "1.2.3.4", email: "x@example.com" },
    breadcrumbs: [{ message: "clicked" }],
    extra: { body: "secret" },
  });
  assert.equal(event.message, "boom");
  assert.equal(event.request, undefined);
  assert.equal(event.user, undefined);
  assert.equal(event.breadcrumbs, undefined);
  assert.equal(event.extra, undefined);
});

test("scrubEvent removes local variables from stack frames", () => {
  const event = scrubEvent({
    exception: { values: [{ type: "Error", stacktrace: { frames: [{ function: "f", vars: { password: "p" } }] } }] },
  });
  const frame = event.exception?.values?.[0]?.stacktrace?.frames?.[0] as { function?: string; vars?: unknown } | undefined;
  assert.equal(frame?.function, "f");
  assert.equal(frame?.vars, undefined);
});

test("scrubEvent drops a captured webhook payload and its headers wherever Sentry would carry them", () => {
  const payload = '{"card":"4242424242424242"}';
  const event = scrubEvent({
    message: "capture failed",
    request: { method: "POST", url: "https://webhook-tester.bookchaowalit.com/api/hook/abc", data: payload, headers: { authorization: "Bearer t" } },
    extra: { body: payload },
    breadcrumbs: [{ category: "fetch", data: { body: payload } }],
    exception: { values: [{ stacktrace: { frames: [{ function: "handle", vars: { body: payload } }] } }] },
  });
  assert.ok(!JSON.stringify(event).includes("4242424242424242"));
  assert.ok(!JSON.stringify(event).includes("Bearer"));
});
