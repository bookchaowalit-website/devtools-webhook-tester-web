import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("home page", () => {
  it("renders the capture desk with its memory and redaction notice before a hook id exists", () => {
    const html = renderToString(<Home />);
    expect(html).toContain("See what arrives before you trust the payload.");
    expect(html).toContain("generating address…");
    expect(html).toContain("Requests stay in server memory for up to an hour");
    expect(html).toContain("sender IPs are dropped");
    expect(html).toContain("Send a request to the address above.");
  });
});
