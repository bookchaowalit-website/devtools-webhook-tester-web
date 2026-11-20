import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Codex report -afc9d4d0a7: a live region added to the accessibility tree together with its first message is not
// announced by some screen readers, so the empty status lines must stay in the tree (hidden visually only).
describe("status line live regions", () => {
  const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
  const emptyRule = /\.wh-status-line:empty\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

  it("hides an empty status line visually without removing it from the accessibility tree", () => {
    expect(emptyRule).not.toBe("");
    expect(emptyRule).not.toMatch(/display\s*:\s*none|visibility\s*:\s*hidden/);
    expect(emptyRule).toMatch(/clip-path\s*:\s*inset\(50%\)/);
  });
});
