// @vitest-environment node
/**
 * The stripe_events claim is what makes webhook processing idempotent, and
 * until 2026-10 nothing tested it directly: the webhook route tests mocked it.
 * Mutation testing showed that treating every insert error as a duplicate,
 * reclaiming a fresh claim, swallowing a database error, or never releasing a
 * failed claim all left the suite green.
 *
 * The fake below answers the way Postgres does for the chains the store uses:
 * the primary key rejects a second insert with 23505, `eq` / `is` / `lt`
 * filter real rows (`lt` never matches null), and updates change them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimStripeEvent,
  markStripeEventFailed,
  markStripeEventProcessed,
  truncateErrorMessage,
} from "@/lib/stripe/stripeEventStore";

type Row = {
  id: string;
  event_type: string;
  processed_at: string | null;
  processing_started_at: string | null;
  last_error: string | null;
};
type DbError = { message: string; code?: string };
type Failures = Partial<Record<"insert" | "lookup" | "claim" | "update", DbError>>;
type Admin = Parameters<typeof claimStripeEvent>[0];
type Filter = (row: Row) => boolean;

const NOW = new Date("2026-10-26T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

function stripeEventsTable(initial: Partial<Row>[] = [], failures: Failures = {}) {
  const rows = new Map<string, Row>();
  for (const row of initial) {
    rows.set(row.id!, {
      event_type: "invoice.paid",
      processed_at: null,
      processing_started_at: null,
      last_error: null,
      ...row,
    } as Row);
  }
  const matching = (filters: Filter[]) =>
    [...rows.values()].filter((r) => filters.every((f) => f(r)));
  const column = (name: string) => (row: Row) => (row as Record<string, unknown>)[name];

  function from(table: string) {
    if (table !== "stripe_events") throw new Error(`unexpected table ${table}`);
    return {
      insert: async (row: Partial<Row>) => {
        if (failures.insert) return { error: failures.insert };
        if (rows.has(row.id!)) return { error: { code: "23505", message: "duplicate key" } };
        rows.set(row.id!, { processed_at: null, ...row } as Row);
        return { error: null };
      },
      select: (_columns: string) => {
        const filters: Filter[] = [];
        const query = {
          eq: (name: string, value: unknown) => {
            filters.push((r) => column(name)(r) === value);
            return query;
          },
          maybeSingle: async () =>
            failures.lookup
              ? { data: null, error: failures.lookup }
              : { data: matching(filters)[0] ?? null, error: null },
        };
        return query;
      },
      update: (patch: Partial<Row>) => {
        const filters: Filter[] = [];
        const apply = () => {
          const hit = matching(filters);
          for (const row of hit) Object.assign(row, patch);
          return hit;
        };
        const query = {
          eq: (name: string, value: unknown) => {
            filters.push((r) => column(name)(r) === value);
            return query;
          },
          is: (name: string, value: null) => {
            filters.push((r) => column(name)(r) === value);
            return query;
          },
          lt: (name: string, value: string) => {
            filters.push((r) => {
              const current = column(name)(r);
              return typeof current === "string" && current < value;
            });
            return query;
          },
          select: (_columns: string) => ({
            maybeSingle: async () => {
              if (failures.claim) return { data: null, error: failures.claim };
              const hit = apply();
              return { data: hit[0] ? { id: hit[0].id } : null, error: null };
            },
          }),
          then: (resolve: (value: { error: DbError | null }) => unknown) => {
            if (failures.update) return Promise.resolve({ error: failures.update }).then(resolve);
            apply();
            return Promise.resolve({ error: null }).then(resolve);
          },
        };
        return query;
      },
    };
  }

  return { admin: { from } as unknown as Admin, rows };
}

const event = (id = "evt_1") =>
  ({ id, type: "invoice.paid" }) as Parameters<typeof claimStripeEvent>[1];

describe("claimStripeEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("claims an event it has never seen", async () => {
    const { admin, rows } = stripeEventsTable();

    expect(await claimStripeEvent(admin, event())).toBe("claimed");
    expect(rows.get("evt_1")).toMatchObject({
      event_type: "invoice.paid",
      processing_started_at: NOW.toISOString(),
      processed_at: null,
    });
  });

  it("reports an event that was already processed as a duplicate and leaves it alone", async () => {
    const processed = { id: "evt_1", processed_at: minutesAgo(30), processing_started_at: null };
    const { admin, rows } = stripeEventsTable([processed]);

    expect(await claimStripeEvent(admin, event())).toBe("duplicate");
    expect(rows.get("evt_1")).toMatchObject(processed);
  });

  it("leaves an event another delivery claimed nine minutes ago in progress", async () => {
    const { admin, rows } = stripeEventsTable([
      { id: "evt_1", processing_started_at: minutesAgo(9) },
    ]);

    expect(await claimStripeEvent(admin, event())).toBe("in_progress");
    expect(rows.get("evt_1")!.processing_started_at).toBe(minutesAgo(9));
  });

  it("reclaims an event whose claim is more than ten minutes old", async () => {
    const { admin, rows } = stripeEventsTable([
      { id: "evt_1", processing_started_at: minutesAgo(11), last_error: "worker died" },
    ]);

    expect(await claimStripeEvent(admin, event())).toBe("claimed");
    expect(rows.get("evt_1")).toMatchObject({
      processing_started_at: NOW.toISOString(),
      last_error: null,
    });
  });

  it("claims an unprocessed event whose claim was released after a failure", async () => {
    const { admin, rows } = stripeEventsTable([
      { id: "evt_1", processing_started_at: null, last_error: "handler threw" },
    ]);

    expect(await claimStripeEvent(admin, event())).toBe("claimed");
    expect(rows.get("evt_1")!.processing_started_at).toBe(NOW.toISOString());
  });

  it("throws on an insert error that is not a duplicate instead of skipping the event", async () => {
    const { admin } = stripeEventsTable([], {
      insert: { code: "42P01", message: 'relation "stripe_events" does not exist' },
    });

    await expect(claimStripeEvent(admin, event())).rejects.toThrow(/failed to claim stripe event/);
  });

  it("throws when the duplicate cannot be inspected", async () => {
    const { admin } = stripeEventsTable([{ id: "evt_1" }], { lookup: { message: "timeout" } });

    await expect(claimStripeEvent(admin, event())).rejects.toThrow(/inspect duplicate/);
  });

  it("throws when reclaiming an existing event fails", async () => {
    const { admin } = stripeEventsTable([{ id: "evt_1", processing_started_at: minutesAgo(11) }], {
      claim: { message: "timeout" },
    });

    await expect(claimStripeEvent(admin, event())).rejects.toThrow(/claim existing/);
  });
});

describe("markStripeEventProcessed", () => {
  it("records completion and clears the claim", async () => {
    const { admin, rows } = stripeEventsTable([
      { id: "evt_1", processing_started_at: minutesAgo(1), last_error: "earlier attempt" },
      { id: "evt_2", processing_started_at: minutesAgo(1) },
    ]);

    await markStripeEventProcessed(admin, "evt_1");

    expect(rows.get("evt_1")).toMatchObject({ processing_started_at: null, last_error: null });
    expect(rows.get("evt_1")!.processed_at).toEqual(expect.any(String));
    expect(rows.get("evt_2")!.processed_at).toBeNull();
  });

  it("throws when the update fails, so the event is not acknowledged as done", async () => {
    const { admin } = stripeEventsTable([{ id: "evt_1" }], { update: { message: "timeout" } });

    await expect(markStripeEventProcessed(admin, "evt_1")).rejects.toThrow(
      /mark stripe event processed/,
    );
  });
});

describe("markStripeEventFailed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("releases the claim so Stripe's next delivery processes the event", async () => {
    const { admin, rows } = stripeEventsTable();
    expect(await claimStripeEvent(admin, event())).toBe("claimed");

    await markStripeEventFailed(admin, "evt_1", "handler threw");
    expect(rows.get("evt_1")).toMatchObject({
      processing_started_at: null,
      last_error: "handler threw",
    });

    expect(await claimStripeEvent(admin, event())).toBe("claimed");
  });

  it("does not reopen an event that was already processed", async () => {
    const processed = { id: "evt_1", processed_at: minutesAgo(5), processing_started_at: null };
    const { admin, rows } = stripeEventsTable([processed]);

    await markStripeEventFailed(admin, "evt_1", "late failure");

    expect(rows.get("evt_1")).toMatchObject({ ...processed, last_error: null });
  });

  it("stores a long error message truncated", async () => {
    const { admin, rows } = stripeEventsTable([
      { id: "evt_1", processing_started_at: minutesAgo(1) },
    ]);

    await markStripeEventFailed(admin, "evt_1", "x".repeat(5000));

    expect(rows.get("evt_1")!.last_error).toHaveLength(1000);
  });

  it("warns instead of throwing when the release fails, so the original error still surfaces", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin } = stripeEventsTable([{ id: "evt_1" }], { update: { message: "timeout" } });

    await expect(markStripeEventFailed(admin, "evt_1", "handler threw")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "[stripe/webhook] failed to release failed stripe event claim",
      { eventId: "evt_1", message: "timeout" },
    );
  });
});

describe("truncateErrorMessage", () => {
  it("keeps a message of up to 1000 characters as it is", () => {
    const message = "x".repeat(1000);
    expect(truncateErrorMessage(message)).toBe(message);
  });

  it("cuts a longer message to 1000 characters ending in an ellipsis", () => {
    const truncated = truncateErrorMessage("y".repeat(1001));
    expect(truncated).toHaveLength(1000);
    expect(truncated.endsWith("y...")).toBe(true);
  });
});
