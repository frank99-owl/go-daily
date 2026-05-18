import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewClient } from "@/app/[locale]/review/ReviewClient";
import { LocaleProvider } from "@/lib/i18n/i18n";
import { loadAttempts } from "@/lib/storage/storage";
import type { AttemptRecord, PuzzleSummary } from "@/types";

const trackMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/storage/storage", () => ({
  loadAttempts: vi.fn(),
}));

vi.mock("@/lib/posthog/events", () => ({
  track: trackMock,
}));

function summary(
  id: string,
  label: string,
  tag: PuzzleSummary["tag"] = "life-death",
): PuzzleSummary {
  return {
    id,
    difficulty: 2,
    source: "test",
    date: "2026-04-24",
    prompt: {
      zh: label,
      en: label,
      ja: label,
      ko: label,
    },
    boardSize: 9,
    tag,
  };
}

function wrongAttempt(puzzleId: string, solvedAtMs: number): AttemptRecord {
  return {
    puzzleId,
    date: "2026-04-24",
    userMove: null,
    correct: false,
    solvedAtMs,
  };
}

describe("ReviewClient", () => {
  beforeEach(() => {
    vi.mocked(loadAttempts).mockReset();
    trackMock.mockReset();
  });

  it("caps Free review at the configured limit and shows an upgrade CTA", async () => {
    const summaries = Array.from({ length: 25 }, (_, index) =>
      summary(`puzzle-${index}`, `Puzzle ${index}`),
    );
    vi.mocked(loadAttempts).mockReturnValue(
      summaries.map((item, index) => wrongAttempt(item.id, 1_000 + index)),
    );

    render(
      <LocaleProvider initialLocale="en">
        <ReviewClient summaries={summaries} viewerPlan="free" freeLimit={20} />
      </LocaleProvider>,
    );

    expect(await screen.findByText("Puzzle 24")).toBeInTheDocument();
    expect(screen.getByText("Upgrade to Pro")).toBeInTheDocument();
    expect(screen.queryByText("Puzzle 0")).toBeNull();

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith("review_page_viewed", { wrongCount: 25 });
    });
  });

  it("shows today's review summary and explains the first focus", async () => {
    const summaries = [
      summary("life-1", "Life problem", "life-death"),
      summary("tesuji-1", "Tesuji problem", "tesuji"),
    ];
    vi.mocked(loadAttempts).mockReturnValue([
      wrongAttempt("life-1", 1_000),
      wrongAttempt("tesuji-1", 2_000),
    ]);

    render(
      <LocaleProvider initialLocale="en">
        <ReviewClient summaries={summaries} viewerPlan="guest" now={new Date("2026-05-18")} />
      </LocaleProvider>,
    );

    expect(await screen.findByText("Today's review summary")).toBeInTheDocument();
    expect(screen.getByText("Due now")).toBeInTheDocument();
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText(/Start with/)).toHaveTextContent("Life & Death");
  });

  it("keeps the empty state stable with no local attempts", async () => {
    vi.mocked(loadAttempts).mockReturnValue([]);

    render(
      <LocaleProvider initialLocale="en">
        <ReviewClient summaries={[summary("life-1", "Life problem")]} viewerPlan="guest" />
      </LocaleProvider>,
    );

    expect(await screen.findByText("Today's review summary")).toBeInTheDocument();
    expect(screen.getByText("No mistakes to review — keep it up!")).toBeInTheDocument();
    expect(screen.getByText("No clear weak topic yet.")).toBeInTheDocument();
  });

  it("uses server-provided SRS cards for Pro review", async () => {
    const summaries = [summary("puzzle-1", "Local wrong"), summary("puzzle-2", "SRS due")];
    vi.mocked(loadAttempts).mockReturnValue([wrongAttempt("puzzle-1", 1_000)]);

    render(
      <LocaleProvider initialLocale="en">
        <ReviewClient
          summaries={summaries}
          viewerPlan="pro"
          srsItems={[
            {
              puzzleId: "puzzle-2",
              dueDate: "2026-04-24",
              intervalDays: 0,
              easeFactor: 2.18,
              lastReviewedAt: "2026-04-24T00:00:00.000Z",
              lastAttemptedMs: 2_000,
              attemptCount: 1,
            },
          ]}
        />
      </LocaleProvider>,
    );

    expect(await screen.findByText("SRS due")).toBeInTheDocument();
    expect(screen.getByText("Pro spaced review: puzzles due today")).toBeInTheDocument();
    expect(screen.queryByText("Local wrong")).toBeNull();
    expect(trackMock).toHaveBeenCalledWith("review_page_viewed", { wrongCount: 1 });
  });
});
