/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("puzzle detail page rendering mode", () => {
  it("stays dynamic so production puzzle routes do not fail on request headers", () => {
    const pagePath = path.join(process.cwd(), "app/[locale]/puzzles/[id]/page.tsx");
    const source = readFileSync(pagePath, "utf8");

    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).not.toContain("export async function generateStaticParams");
    expect(source).not.toContain("export const revalidate");
  });
});
