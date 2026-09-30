// @vitest-environment node
/**
 * Keeps the production preflight's expected schema in step with the migrations.
 *
 * `EXPECTED_SUPABASE_COLUMNS` is maintained by hand, and it fell behind once:
 * 0008 added `profiles.training_level`, the list never gained it, and the
 * remote preflight therefore could not report that production was missing the
 * column. This derives every table and column the migrations define and
 * requires the list to match.
 */
import fs from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

import { EXPECTED_SUPABASE_COLUMNS } from "../../scripts/supabaseSchema";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

// Table-level clauses inside `create table (...)` that are not columns.
const CONSTRAINT_KEYWORDS = new Set(["primary", "unique", "check", "constraint", "foreign"]);

function statements(sql: string): string[] {
  return sql
    .replace(/\$\$[\s\S]*?\$\$/g, "") // function bodies contain their own semicolons
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function schemaFromMigrations(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    for (const statement of statements(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"))) {
      const created = statement.match(
        /^create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*)\)$/i,
      );
      if (created) {
        const columns = new Set<string>();
        for (const line of created[2].split("\n")) {
          const name = line.trim().match(/^(\w+)\s/)?.[1];
          if (name && !CONSTRAINT_KEYWORDS.has(name.toLowerCase())) columns.add(name);
        }
        tables.set(created[1], columns);
        continue;
      }

      const altered = statement.match(/^alter table (?:if exists )?public\.(\w+)\s/i);
      if (altered) {
        for (const added of statement.matchAll(/add column (?:if not exists )?(\w+)/gi)) {
          tables.get(altered[1])?.add(added[1]);
        }
      }
    }
  }
  return tables;
}

describe("production preflight schema", () => {
  const migrated = schemaFromMigrations();

  it("reads the tables the migrations create", () => {
    // Guards the parser: a regex that silently matched nothing would pass below.
    expect(migrated.get("profiles")?.has("user_id")).toBe(true);
    expect(migrated.get("stripe_events")?.has("processed_at")).toBe(true);
    expect(migrated.size).toBeGreaterThanOrEqual(9);
  });

  it("expects exactly the tables the migrations create", () => {
    expect(Object.keys(EXPECTED_SUPABASE_COLUMNS).sort()).toEqual([...migrated.keys()].sort());
  });

  it("expects every column the migrations define, and no others", () => {
    for (const [table, columns] of migrated) {
      expect(
        [...(EXPECTED_SUPABASE_COLUMNS[table] ?? [])].sort(),
        `scripts/supabaseSchema.ts → ${table}`,
      ).toEqual([...columns].sort());
    }
  });
});
