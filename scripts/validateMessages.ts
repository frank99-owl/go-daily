/**
 * Build-time messages validator — run via `npm run validate:messages`.
 *
 * Walks every key path in each locale JSON file under content/messages/
 * and asserts the four locales (zh / en / ja / ko) share the exact same
 * set. A missing translation key would otherwise show up only at runtime
 * as an undefined property lookup or a blank UI string.
 *
 * Wired into `prebuild` so `npm run build` fails if the locales drift.
 *
 * Exits 0 on success; exits 1 with a readable report on failure.
 */
import fs from "fs";
import path from "path";

import type { Locale } from "../types";

const LOCALES: Locale[] = ["zh", "en", "ja", "ko"];
const MESSAGES_DIR = path.join(process.cwd(), "content/messages");

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function isPlainObject(value: unknown): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectKeyPaths(value: Json, prefix = ""): Set<string> {
  const paths = new Set<string>();
  if (!isPlainObject(value)) return paths;
  for (const [key, child] of Object.entries(value)) {
    const here = prefix ? `${prefix}.${key}` : key;
    paths.add(here);
    if (isPlainObject(child)) {
      for (const childPath of collectKeyPaths(child, here)) {
        paths.add(childPath);
      }
    }
  }
  return paths;
}

function loadMessages(locale: Locale): Json {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  return JSON.parse(fs.readFileSync(file, "utf-8")) as Json;
}

function main(): void {
  const localePaths = new Map<Locale, Set<string>>();
  for (const locale of LOCALES) {
    localePaths.set(locale, collectKeyPaths(loadMessages(locale)));
  }

  const union = new Set<string>();
  for (const paths of localePaths.values()) {
    for (const p of paths) union.add(p);
  }

  let hasIssue = false;
  for (const locale of LOCALES) {
    const paths = localePaths.get(locale)!;
    const missing = [...union].filter((p) => !paths.has(p)).sort();
    if (missing.length > 0) {
      hasIssue = true;
      console.error(`\n[${locale}] missing ${missing.length} key path(s):`);
      for (const m of missing) console.error(`  - ${m}`);
    }
  }

  if (hasIssue) {
    console.error(`\n✗ Locale message files are out of sync.`);
    console.error(`  Add the missing keys (or remove them from the others) and re-run.\n`);
    process.exit(1);
  }

  console.log(`✓ Validated ${LOCALES.length} locales × ${union.size} key paths — all consistent.`);
}

main();
