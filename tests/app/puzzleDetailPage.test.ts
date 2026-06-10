/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("puzzle detail page rendering mode", () => {
  it("renders statically (on-demand ISR) so content pages are CDN-cacheable", () => {
    const pagePath = path.join(process.cwd(), "app/[locale]/puzzles/[id]/page.tsx");
    const source = readFileSync(pagePath, "utf8");

    // The locale layout derives <html lang> from params (not request
    // headers), so puzzle pages must NOT opt back into per-request
    // rendering: that would put ~12k sitemap URLs on serverless renders.
    expect(source).not.toContain('export const dynamic = "force-dynamic"');
    expect(source).toContain("export async function generateStaticParams");
  });

  it("does not read request-scoped APIs that would force dynamic rendering", () => {
    const pagePath = path.join(process.cwd(), "app/[locale]/puzzles/[id]/page.tsx");
    const source = readFileSync(pagePath, "utf8");

    expect(source).not.toContain("next/headers");
  });
});
