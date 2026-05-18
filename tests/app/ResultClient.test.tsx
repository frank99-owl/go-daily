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

const trackMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/posthog/events", () => ({
  track: trackMock,
}));

vi.mock("@/lib/auth/auth", () => ({
  useCurrentUser: () => ({ user: null, loading: false, error: null }),
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
    trackMock.mockClear();
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

  it("frames onboarding results around explanation and saved review", async () => {
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
          source="onboarding"
        />
      </LocaleProvider>,
    );

    expect(screen.getByText("First puzzle complete")).toBeInTheDocument();
    expect(screen.getByText("Keep this training session")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Take the vital point.")).toBeInTheDocument();
    });

    const saveLink = screen.getByRole("link", { name: "Sign in and save" });
    expect(saveLink.getAttribute("href")).toContain("/en/login");
    expect(saveLink.getAttribute("href")).toContain(encodeURIComponent("/en/result?id=cld-001"));
    expect(trackMock).toHaveBeenCalledWith("result_signup_prompt_view", {
      puzzleId: "cld-001",
      source: "onboarding_result",
    });
  });

  it("offers a same-level next puzzle after onboarding result", async () => {
    vi.mocked(loadAttempts).mockReturnValue([
      {
        puzzleId: "already-done",
        date: "2026-04-20",
        userMove: { x: 1, y: 1 },
        correct: true,
        solvedAtMs: 100,
      },
    ]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/puzzle/random") {
        return Response.json({ puzzleId: "next-001", level: "intermediate" });
      }
      return Response.json({
        correct: [{ x: 4, y: 4 }],
        solutionSequence: [{ x: 4, y: 4, color: "black" }],
        solutionNote: {
          zh: "占住急所。",
          en: "Take the vital point.",
          ja: "急所を占める。",
          ko: "급소를 차지한다.",
        },
      });
    });
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
          source="onboarding"
          onboardingLevel="intermediate"
        />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue same level" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/puzzle/random",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            attemptedPuzzleIds: ["already-done", "cld-001"],
            level: "intermediate",
          }),
        }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/en/puzzles/next-001");
    expect(trackMock).toHaveBeenCalledWith("random_puzzle_picked", {
      puzzleId: "next-001",
      source: "onboarding_result",
      level: "intermediate",
    });
  });

  it("shows the coach-eligible boundary instead of the chat surface", async () => {
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
            coachAccess: {
              available: false,
              reason: "restricted",
              contentTier: "coach-eligible",
              qualityTier: "explained",
              hasVariationSupport: false,
              capabilities: {
                staticExplanation: true,
                basicCoach: true,
                fullCoach: false,
                variationQuestions: false,
              },
            },
          }}
          todayPuzzleId="cld-999"
        />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("coach-eligible")).toBeInTheDocument();
    });
    expect(screen.getByText(/content backfill queue/)).toBeInTheDocument();
    expect(screen.queryByTestId("coach-dialogue")).not.toBeInTheDocument();
  });

  it("shows CoachDialogue for full coach-ready puzzles", async () => {
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
            coachAvailable: true,
            coachAccess: {
              available: true,
              reason: "approved",
              contentTier: "coach-ready",
              qualityTier: "coach-ready",
              hasVariationSupport: true,
              capabilities: {
                staticExplanation: true,
                basicCoach: true,
                fullCoach: true,
                variationQuestions: false,
              },
            },
          }}
          todayPuzzleId="cld-999"
        />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("coach-dialogue")).toBeInTheDocument();
    });
    expect(screen.queryByText("coach-ready")).not.toBeInTheDocument();
  });
});
