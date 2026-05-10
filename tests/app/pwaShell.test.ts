/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("PWA shell", () => {
  it("does not precache dynamic HTML pages like /today", () => {
    const swPath = path.join(process.cwd(), "public/sw.js");
    const sw = readFileSync(swPath, "utf8");

    expect(sw).not.toContain('"/today"');
    expect(sw).toContain('"/offline.html"');
    expect(sw).toContain('"/manifest.webmanifest"');
    expect(sw).not.toContain('"/manifest.json"');
    expect(sw).not.toContain('"/favicon.ico"');
  });

  it("pre-caches shell assets independently so one miss cannot reject the batch", () => {
    const swPath = path.join(process.cwd(), "public/sw.js");
    const sw = readFileSync(swPath, "utf8");

    expect(sw).toContain("PRECACHE_URLS.map");
    expect(sw).not.toContain("cache.addAll(PRECACHE_URLS)");
  });

  it("ships an offline fallback page", () => {
    const offlinePath = path.join(process.cwd(), "public/offline.html");
    const html = readFileSync(offlinePath, "utf8");

    expect(html).toContain("You are offline.");
  });
});
