import { fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ResultClient } from "@/app/[locale]/result/ResultClient";
import { LocaleProvider } from "@/lib/i18n";
import { getAttemptFor, getAttemptsFor } from "@/lib/storage";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  getAttemptFor: vi.fn(),
  getAttemptsFor: vi.fn(),
}));

vi.mock("@/components/CoachDialogue", () => ({
  CoachDialogue: () => <div data-testid="coach-dialogue" />,
}));

vi.mock("@/components/ShareCard", () => ({
  ShareCard: () => <div data-testid="share-card" />,
}));

describe("ResultClient keyboard support", () => {
  const push = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(getAttemptFor).mockReturnValue({
      puzzleId: "cld-001",
      date: "2026-04-21",
      userMove: { x: 4, y: 4 },
      correct: false,
      solvedAtMs: 123,
    });
    vi.mocked(getAttemptsFor).mockReturnValue([
      {
        puzzleId: "cld-001",
        date: "2026-04-21",
        userMove: { x: 4, y: 4 },
        correct: false,
        solvedAtMs: 123,
      },
    ]);
  });

  it("steps through the solution with arrows, closes with Escape, and retries with R", () => {
    const { container } = render(
      <LocaleProvider initialLocale="en">
        <ResultClient
          initialPuzzle={{
            id: "cld-001",
            date: "2026-04-21",
            boardSize: 9,
            stones: [],
            toPlay: "black",
            correct: [{ x: 4, y: 4 }],
            solutionSequence: [
              { x: 4, y: 4, color: "black" },
              { x: 4, y: 5, color: "white" },
            ],
            tag: "life-death",
            difficulty: 1,
            prompt: {
              zh: "黑先活",
              en: "Black to live",
              ja: "黒先活",
              ko: "흑선활",
            },
            solutionNote: {
              zh: "占住急所。",
              en: "Take the vital point.",
              ja: "急所を占める。",
              ko: "급소를 차지한다.",
            },
            isCurated: true,
          }}
          todayPuzzleId="cld-999"
        />
      </LocaleProvider>,
    );

    const root = container.querySelector('[tabindex="0"]') as HTMLDivElement | null;
    expect(root).not.toBeNull();

    fireEvent.keyDown(root!, { key: "ArrowRight" });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.keyDown(root!, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Play solution" })).toBeInTheDocument();

    fireEvent.keyDown(root!, { key: "r" });
    expect(push).toHaveBeenCalledWith("/en/puzzles/cld-001");
  });
});
