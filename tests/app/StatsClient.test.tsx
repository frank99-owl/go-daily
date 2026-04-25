import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";

import { StatsClient } from "@/app/[locale]/stats/StatsClient";
import { LocaleProvider } from "@/lib/i18n";

function createStorage() {
  return {
    store: {} as Record<string, string>,
    getItem(key: string) {
      return this.store[key] ?? null;
    },
    setItem(key: string, value: string) {
      this.store[key] = value;
    },
    removeItem(key: string) {
      delete this.store[key];
    },
    clear() {
      this.store = {};
    },
    get length() {
      return Object.keys(this.store).length;
    },
    key(index: number) {
      return Object.keys(this.store)[index] ?? null;
    },
  };
}

describe("StatsClient", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: createStorage(),
      writable: true,
    });
  });

  it("shows backup controls even when there are no records", async () => {
    render(
      <LocaleProvider initialLocale="en">
        <StatsClient />
      </LocaleProvider>,
    );

    expect(await screen.findByText("Backup & restore")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export records" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import records" })).toBeInTheDocument();
  });

  it("imports a backup file and refreshes the stats view", async () => {
    const { container } = render(
      <LocaleProvider initialLocale="en">
        <StatsClient />
      </LocaleProvider>,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    const file = new File(
      [
        JSON.stringify({
          version: 1,
          app: "go-daily",
          exportedAt: "2026-04-21T00:00:00.000Z",
          data: {
            attempts: [
              {
                puzzleId: "cld-001",
                date: "2026-04-21",
                userMove: { x: 18, y: 0 },
                correct: true,
                solvedAtMs: 123,
              },
            ],
          },
        }),
      ],
      "backup.json",
      { type: "application/json" },
    );

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Imported 1 new record(s). 1 total saved.")).toBeInTheDocument();
    });

    expect(screen.getByText("Puzzles solved")).toBeInTheDocument();
  });
});
