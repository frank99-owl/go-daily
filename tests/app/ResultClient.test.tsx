import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ResultClient } from "@/app/[locale]/result/ResultClient";
import { LocaleProvider } from "@/lib/i18n/i18n";
import {
  getAttemptFor,
  getAttemptsFor,
  loadAttempts,
  replaceAttempts,
} from "@/lib/storage/storage";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/lib/storage/storage", () => ({
  getAttemptFor: vi.fn(),
  getAttemptsFor: vi.fn(),
  loadAttempts: vi.fn(),
  replaceAttempts: vi.fn(),
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
      revealToken: "reveal-token",
    });
    vi.mocked(getAttemptsFor).mockReturnValue([
      {
        puzzleId: "cld-001",
        date: "2026-04-21",
        userMove: { x: 4, y: 4 },
        correct: false,
        solvedAtMs: 123,
        revealToken: "reveal-token",
      },
    ]);
    vi.mocked(loadAttempts).mockReturnValue([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          correct: [{ x: 4, y: 4 }],
          solutionSequence: [
            { x: 4, y: 4, color: "black" },
            { x: 4, y: 5, color: "white" },
          ],
          solutionNote: {
            zh: "占住急所。",
            en: "Take the vital point.",
            ja: "急所を占める。",
            ko: "급소를 차지한다.",
          },
        }),
      ),
    );
  });

  it("steps through the solution with arrows, closes with Escape, and retries with R", async () => {
    const { container } = render(
      <LocaleProvider initialLocale="en">
        <ResultClient
          initialPuzzle={{
            id: "cld-001",
            date: "2026-04-21",
            boardSize: 9,
            stones: [],
            toPlay: "black",
            tag: "life-death",
            difficulty: 1,
            prompt: {
              zh: "黑先活",
              en: "Black to live",
              ja: "黒先活",
              ko: "흑선활",
            },
            source: "2026-04-21",
            coachAvailable: false,
          }}
          todayPuzzleId="cld-999"
        />
      </LocaleProvider>,
    );

    const root = container.querySelector('[tabindex="0"]') as HTMLDivElement | null;
    expect(root).not.toBeNull();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Play solution" })).toBeInTheDocument();
    });

    fireEvent.keyDown(root!, { key: "ArrowRight" });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.keyDown(root!, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Play solution" })).toBeInTheDocument();

    fireEvent.keyDown(root!, { key: "r" });
    expect(push).toHaveBeenCalledWith("/en/puzzles/cld-001");
  });

  it("upgrades legacy attempts without reveal tokens before showing the solution", async () => {
    const legacyAttempt = {
      puzzleId: "cld-001",
      date: "2026-04-21",
      userMove: { x: 4, y: 4 },
      correct: false,
      solvedAtMs: 123,
    };
    vi.mocked(getAttemptFor).mockReturnValue(legacyAttempt);
    vi.mocked(getAttemptsFor).mockReturnValue([legacyAttempt]);
    vi.mocked(loadAttempts).mockReturnValue([legacyAttempt]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            correct: true,
            revealToken: "new-reveal-token",
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            correct: [{ x: 4, y: 4 }],
            solutionSequence: [{ x: 4, y: 4, color: "black" }],
            solutionNote: {
              zh: "占住急所。",
              en: "Take the vital point.",
              ja: "急所を占める。",
              ko: "급소를 차지한다.",
            },
          }),
        ),
    );

    render(
      <LocaleProvider initialLocale="en">
        <ResultClient
          initialPuzzle={{
            id: "cld-001",
            date: "2026-04-21",
            boardSize: 9,
            stones: [],
            toPlay: "black",
            tag: "life-death",
            difficulty: 1,
            prompt: {
              zh: "黑先活",
              en: "Black to live",
              ja: "黒先活",
              ko: "흑선활",
            },
            source: "2026-04-21",
            coachAvailable: false,
          }}
          todayPuzzleId="cld-999"
        />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(replaceAttempts).toHaveBeenCalledWith([
        expect.objectContaining({
          puzzleId: "cld-001",
          correct: true,
          revealToken: "new-reveal-token",
        }),
      ]);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Play solution" })).toBeInTheDocument();
    });
  });

  it("refreshes an expired reveal token and then shows the solution", async () => {
    const expiredAttempt = {
      puzzleId: "cld-001",
      date: "2026-04-21",
      userMove: { x: 4, y: 4 },
      correct: false,
      solvedAtMs: 123,
      revealToken: "expired-reveal-token",
    };
    vi.mocked(getAttemptFor).mockReturnValue(expiredAttempt);
    vi.mocked(getAttemptsFor).mockReturnValue([expiredAttempt]);
    vi.mocked(loadAttempts).mockReturnValue([expiredAttempt]);

    const revealBody = {
      correct: [{ x: 4, y: 4 }],
      solutionSequence: [{ x: 4, y: 4, color: "black" }],
      solutionNote: {
        zh: "占住急所。",
        en: "Take the vital point.",
        ja: "急所を占める。",
        ko: "급소를 차지한다.",
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: "Invalid reveal token." }, { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({
          correct: true,
          revealToken: "fresh-reveal-token",
        }),
      )
      .mockResolvedValueOnce(Response.json(revealBody))
      .mockResolvedValue(Response.json(revealBody));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LocaleProvider initialLocale="en">
        <ResultClient
          initialPuzzle={{
            id: "cld-001",
            date: "2026-04-21",
            boardSize: 9,
            stones: [],
            toPlay: "black",
            tag: "life-death",
            difficulty: 1,
            prompt: {
              zh: "黑先活",
              en: "Black to live",
              ja: "黒先活",
              ko: "흑선활",
            },
            source: "2026-04-21",
            coachAvailable: false,
          }}
          todayPuzzleId="cld-999"
        />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(replaceAttempts).toHaveBeenCalledWith([
        expect.objectContaining({
          puzzleId: "cld-001",
          correct: true,
          revealToken: "fresh-reveal-token",
        }),
      ]);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Play solution" })).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/puzzle/attempt",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          puzzleId: "cld-001",
          userMove: { x: 4, y: 4 },
        }),
      }),
    );
  });
});
