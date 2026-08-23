import { expect, test } from "@playwright/test";

test.describe("site health", () => {
  test("serves robots.txt and sitemap.xml", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBe(true);
    expect(await robots.text()).toContain("Sitemap");

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain("<urlset");
  });

  test("reports healthy", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBe(true);
  });

  test("sends the security headers the app sets in next.config.ts", async ({ request }) => {
    const response = await request.get("/en");
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("renders without console errors on the landing page", async ({ page }) => {
    // Telemetry endpoints only exist on Vercel, so locally they 404 and the
    // browser complains. Filter on the URL of the resource that failed rather
    // than the message text, which for load failures carries no URL at all —
    // that way a genuine 404 from the app itself is still caught.
    const THIRD_PARTY = /_vercel|posthog|sentry|speed-insights|\/favicon/i;
    const errors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const source = msg.location()?.url ?? "";
      if (THIRD_PARTY.test(source) || THIRD_PARTY.test(msg.text())) return;
      errors.push(`${msg.text()} (${source})`);
    });
    page.on("pageerror", (err) => {
      if (THIRD_PARTY.test(err.message)) return;
      errors.push(err.message);
    });

    await page.goto("/en");
    await page.waitForLoadState("networkidle");

    expect(errors).toEqual([]);
  });
});
