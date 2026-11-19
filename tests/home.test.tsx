import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";
import nextConfig from "@/next.config";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("home page", () => {
  it("renders the capture desk with its memory and redaction notice before a hook id exists", () => {
    const html = renderToString(<Home />);
    expect(html).toContain("See what arrives before you trust the payload.");
    expect(html).toContain("Creating your address…");
    expect(html).toContain("Requests stay in server memory for up to an hour");
    expect(html).toContain("sender IPs are dropped");
    expect(html).toContain("Nothing captured yet");
    expect(html).toContain('href="https://bookchaowalit.com/"');
  });
});

describe("site config", () => {
  it("sends the retired /more-projects page to the portfolio hub for good", async () => {
    expect(await nextConfig.redirects!()).toContainEqual({ source: "/more-projects", destination: "https://bookchaowalit.com/", permanent: true });
  });

  it("lists the page on its own domain and keeps crawlers off the capture API", () => {
    expect(sitemap()[0].url).toBe("https://webhook-tester.bookchaowalit.com/");
    expect(robots()).toMatchObject({ sitemap: "https://webhook-tester.bookchaowalit.com/sitemap.xml", rules: [{ disallow: "/api/" }] });
  });
});
