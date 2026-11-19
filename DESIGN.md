# Webhook tester — Design

Since 2026-11-19 the page uses the shared **App shell** (`APP-SHELL.md`, Geist + Geist Mono, light and dark):
top bar, capture address card (full address wraps, one tap selects it; Send test is the one filled button), the
incoming queue beside the request sheet (stacked on phones, with a Go to queue link), a status dot tied to the
last poll, and Clear queue with a 6 s Undo toast instead of an instant delete.

The notes below describe the earlier "Intake" look and are kept for history.

# Intake — Design direction

## Product surface

Webhook Tester creates a temporary capture URL, receives supported HTTP methods, polls the in-memory request queue, and exposes headers and body for inspection. The user needs to see receipt and payload detail quickly; durability is explicitly out of scope.

## Visual world

- **Seed:** \`c040e4af\`, assigned direction index \`5\` (\`operate\`)
- **World:** a registered-mail intake room: the capture URL is the address slip, incoming requests are envelopes in a queue, and the selected payload is opened on an inspection sheet.
- **Palette:** paper \`#f4eddf\`, night ink \`#17252d\`, postal blue \`#326b83\`, receipt red \`#bd4f3e\`, and soft ruled line \`#c6bca9\`.
- **Typography:** Barlow Condensed gives the operational desk its compact voice; Roboto Mono is reserved for URLs, methods, timestamps, and payloads.
- **Composition:** address first, queue beside inspection. The empty queue is a clear open desk, not a placeholder card. Request detail uses full-width code sheets rather than decorative panels.
- **Interaction:** copy address, send a test envelope, select a request, inspect headers/payload, and clear the temporary queue.
- **Responsive:** the address actions wrap before the URL becomes unreadable; queue and inspection stack on small screens.

