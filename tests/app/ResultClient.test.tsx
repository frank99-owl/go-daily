import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import type { AttemptRecord, PublicPuzzle } from "@/types";

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
const getAllSummariesMock = vi.hoisted(() => vi.fn());

vi.mock("@/content/puzzleSummaries", () => ({
  getAllSummaries: getAllSummariesMock,
}));

vi.mock("@/lib/posthog/events", () => ({
  track: trackMock,
}));

vi.mock("@/lib/auth/auth", () => ({
  useCurrentUser: () => ({ user: null, loading: false, error: null }),
}));

vi.mock("@/components/CoachDialogue", () => ({
  CoachDialogue: ({
    coachAccess,
  }: {
    coachAccess?: { contentTier?: string; capabilities?: { fullCoach?: boolean } };
  }) => (
    <div data-testid="coach-dialogue">
      {coachAccess?.capabilities?.fullCoach ? null : coachAccess?.contentTier}
    </div>
  ),
}));

vi.mock("@/components/ShareCard", () => ({
  ShareCard: () => <div data-testid="share-card" />,
}));

const recommendationPuzzle: PublicPuzzle = {
  id: "cld-001",
  date: "2026-04-21",
  boardSize: 19,
  stones: [],
  toPlay: "black",
  tag: "life-death",
  difficulty: 2,
  prompt: { zh: "黑先活", en: "Black to live", ja: "黒先活", ko: "흑선활" },
  source: "Classical",
  coachAvailable: false,
};

function prepareCorrectResult(earlierAttempts: AttemptRecord[] = []) {
  const current: AttemptRecord = {
    puzzleId: recommendationPuzzle.id,
    date: "2026-04-21",
    userMove: { x: 4, y: 4 },
    correct: true,
    solvedAtMs: 1000,
    revealToken: "reveal-token",
  };
  vi.mocked(getAttemptFor).mockReturnValue(current);
  vi.mocked(getAttemptsFor).mockReturnValue([current]);
  vi.mocked(loadAttempts).mockReturnValue([...earlierAttempts, current]);
  return current;
}

function renderRecommendationResult() {
  return render(
    <LocaleProvider initialLocale="en">
      <ResultClient initialPuzzle={recommendationPuzzle} todayPuzzleId="cld-999" />
    </LocaleProvider>,
  );
}

describe("ResultClient keyboard support", () => {
  const push = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    trackMock.mockClear();
    getAllSummariesMock.mockResolvedValue([]);
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
          onboardingLevel="intermediate"
        />
      </LocaleProvider>,
    );

    expect(screen.getByText("First puzzle complete")).toBeInTheDocument();
    expect(screen.getByText("Keep this training session")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Take the vital point.")).toBeInTheDocument();
    });
    expect(screen.getByText("Likely mistake pattern")).toBeInTheDocument();
    expect(screen.getByText("Stay on this training path")).toBeInTheDocument();

    const saveLink = screen.getByRole("link", { name: "Sign in and save" });
    expect(saveLink.getAttribute("href")).toContain("/en/login");
    expect(saveLink.getAttribute("href")).toContain(
      encodeURIComponent("/en/result?id=cld-001&source=onboarding&level=intermediate"),
    );
    expect(trackMock).toHaveBeenCalledWith("result_signup_prompt_view", {
      locale: "en",
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

    fireEvent.click(await screen.findByRole("button", { name: "Continue same level" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/puzzle/random",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            attemptedPuzzleIds: ["already-done", "cld-001"],
            level: "intermediate",
            difficulty: 1,
          }),
        }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/en/puzzles/next-001");
    expect(trackMock).toHaveBeenCalledWith("next_recommendation_clicked", {
      locale: "en",
      source: "onboarding_result",
      recommendationType: "same-level",
      level: "intermediate",
    });
  });

  it("shows a conservative mistake reason after a wrong result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          correct: [{ x: 4, y: 5 }],
          solutionSequence: [{ x: 4, y: 5, color: "black" }],
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
      expect(screen.getByText("Likely mistake pattern")).toBeInTheDocument();
    });
    expect(screen.getByText("Missed vital point")).toBeInTheDocument();
    expect(screen.getByText(/not on the point that changes liberties/)).toBeInTheDocument();
    expect(screen.getByText("Practice this mistake pattern again")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open review" })).toBeInTheDocument();
  });

  it("offers same-topic next practice after a wrong result", async () => {
    vi.mocked(loadAttempts).mockReturnValue([
      {
        puzzleId: "cld-001",
        date: "2026-04-21",
        userMove: { x: 4, y: 4 },
        correct: false,
        solvedAtMs: 123,
        revealToken: "reveal-token",
      },
    ]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/puzzle/random") {
        return Response.json({ puzzleId: "next-life-death" });
      }
      return Response.json({
        correct: [{ x: 4, y: 5 }],
        solutionSequence: [{ x: 4, y: 5, color: "black" }],
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
        />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Practice same topic" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Practice same topic" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/puzzle/random",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            attemptedPuzzleIds: ["cld-001"],
            level: "beginner",
            difficulty: 1,
            tag: "life-death",
          }),
        }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/en/puzzles/next-life-death");
    expect(trackMock).toHaveBeenCalledWith("next_recommendation_clicked", {
      locale: "en",
      source: "result",
      recommendationType: "same-topic",
      level: "beginner",
      tag: "life-death",
    });
  });

  it("uses recent mistakes to recommend a different topic and sends its exact difficulty", async () => {
    const mistakes: AttemptRecord[] = Array.from({ length: 3 }, (_, index) => ({
      puzzleId: `weak-${index}`,
      date: "2026-04-20",
      userMove: { x: 3, y: 3 },
      correct: false,
      solvedAtMs: index + 1,
    }));
    prepareCorrectResult(mistakes);
    getAllSummariesMock.mockResolvedValue([
      recommendationPuzzle,
      ...mistakes.map((attempt) => ({
        ...recommendationPuzzle,
        id: attempt.puzzleId,
        tag: "tesuji",
      })),
    ]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/api/puzzle/random"
        ? Response.json({ puzzleId: "next-tesuji" })
        : Response.json({
            correct: [{ x: 4, y: 4 }],
            solutionNote: { zh: "占住急所。", en: "Take the vital point.", ja: "急所", ko: "급소" },
          }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderRecommendationResult();

    expect(await screen.findByText("Strengthen your weak spot")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Practice same topic" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/puzzles/next-tesuji"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/puzzle/random",
      expect.objectContaining({
        body: JSON.stringify({
          attemptedPuzzleIds: ["weak-0", "weak-1", "weak-2", "cld-001"],
          level: "intermediate",
          difficulty: 2,
          tag: "tesuji",
        }),
      }),
    );
  });

  it("requests the harder difficulty even when it belongs to the same training level", async () => {
    prepareCorrectResult();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/api/puzzle/random"
        ? Response.json({ puzzleId: "next-difficulty-3" })
        : Response.json({
            correct: [{ x: 4, y: 4 }],
            solutionNote: { zh: "占住急所。", en: "Take the vital point.", ja: "急所", ko: "급소" },
          }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderRecommendationResult();
    fireEvent.click(await screen.findByRole("button", { name: "Try slightly harder" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/puzzles/next-difficulty-3"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/puzzle/random",
      expect.objectContaining({
        body: JSON.stringify({
          attemptedPuzzleIds: ["cld-001"],
          level: "intermediate",
          difficulty: 3,
        }),
      }),
    );
  });

  it("sends the primary action to review when unresolved mistakes take priority", async () => {
    prepareCorrectResult(
      Array.from({ length: 5 }, (_, index) => ({
        puzzleId: `wrong-${index}`,
        date: "2026-04-20",
        userMove: { x: 3, y: 3 },
        correct: false,
        solvedAtMs: index + 1,
      })),
    );
    const fetchMock = vi.mocked(fetch);

    renderRecommendationResult();

    expect(await screen.findByText("Clear your review backlog first")).toBeInTheDocument();
    const reviewLink = screen.getByRole("link", { name: "Open review" });
    expect(reviewLink).toHaveAttribute("href", "/en/review");
    reviewLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(reviewLink);
    expect(trackMock).toHaveBeenCalledWith("next_recommendation_clicked", {
      locale: "en",
      source: "result",
      recommendationType: "review",
    });
    expect(fetchMock.mock.calls.some(([input]) => input === "/api/puzzle/random")).toBe(false);
    expect(screen.queryByRole("button", { name: "Continue same level" })).not.toBeInTheDocument();
  });

  it("waits for summaries before allowing a next puzzle and recovers when loading fails", async () => {
    prepareCorrectResult();
    let rejectSummaries!: (error: Error) => void;
    getAllSummariesMock.mockReturnValue(
      new Promise((_, reject) => {
        rejectSummaries = reject;
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderRecommendationResult();

    expect(screen.getByRole("button", { name: "Finding next puzzle…" })).toBeDisabled();
    await act(async () => rejectSummaries(new Error("Index unavailable")));
    expect(await screen.findByRole("button", { name: "Try slightly harder" })).toBeEnabled();
    expect(warn).toHaveBeenCalledWith(
      "[result] failed to load recommendation summaries",
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it("shows a training focus instead of a mistake reason after a correct result", async () => {
    vi.mocked(getAttemptFor).mockReturnValue({
      puzzleId: "cld-001",
      date: "2026-04-21",
      userMove: { x: 4, y: 4 },
      correct: true,
      solvedAtMs: 123,
      revealToken: "reveal-token",
    });
    vi.mocked(getAttemptsFor).mockReturnValue([
      {
        puzzleId: "cld-001",
        date: "2026-04-21",
        userMove: { x: 4, y: 4 },
        correct: true,
        solvedAtMs: 123,
        revealToken: "reveal-token",
      },
    ]);

    render(
      <LocaleProvider initialLocale="en">
        <ResultClient
          initialPuzzle={{
            id: "cld-001",
            date: "2026-04-21",
            boardSize: 19,
            stones: [],
            toPlay: "black",
            tag: "opening",
            difficulty: 2,
            prompt: {
              zh: "黑先",
              en: "Black to play",
              ja: "黒番",
              ko: "흑 차례",
            },
            source: "2026-04-21",
            coachAvailable: false,
          }}
          todayPuzzleId="cld-999"
        />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Training focus")).toBeInTheDocument();
    });
    expect(screen.getByText("Opening direction")).toBeInTheDocument();
    expect(screen.getByText(/whole-board relationship/)).toBeInTheDocument();
    expect(screen.getByText("Try a slightly harder puzzle")).toBeInTheDocument();
    expect(screen.queryByText("Likely mistake pattern")).not.toBeInTheDocument();
  });

  it("passes the coach-eligible boundary into CoachDialogue", async () => {
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
    expect(screen.getByTestId("coach-dialogue")).toBeInTheDocument();
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
