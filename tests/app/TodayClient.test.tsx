import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { TodayClient } from "@/app/[locale]/TodayClient";
import { useCurrentUser } from "@/lib/auth/auth";
import { LocaleProvider } from "@/lib/i18n/i18n";
import { createSyncStorage } from "@/lib/storage/syncStorage";
import type { PublicPuzzle } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  useCurrentUser: vi.fn(),
}));

const trackMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/posthog/events", () => ({
  track: trackMock,
}));

const saveAttempt = vi.fn(async () => {});

vi.mock("@/lib/storage/syncStorage", () => ({
  createSyncStorage: vi.fn(() => ({
    saveAttempt,
  })),
}));

const puzzle: PublicPuzzle = {
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
};

describe("TodayClient keyboard support", () => {
  const push = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    trackMock.mockClear();
    vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(useCurrentUser).mockReturnValue({ user: null, loading: false, error: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          puzzleId: "cld-001",
          userMove: { x: 4, y: 4 },
          correct: true,
          revealToken: "reveal-token",
        }),
      ),
    );
  });

  it("lets the board select a move with Enter and clears it with R", async () => {
    const { container } = render(
      <LocaleProvider initialLocale="en">
        <TodayClient puzzle={puzzle} />
      </LocaleProvider>,
    );

    const boardWrapper = container.querySelector('[tabindex="0"]') as HTMLDivElement | null;
    expect(boardWrapper).not.toBeNull();

    fireEvent.keyDown(boardWrapper!, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Confirm move" })).toBeEnabled();

    fireEvent.keyDown(boardWrapper!, { key: "r" });
    expect(screen.getByRole("button", { name: "Confirm move" })).toBeDisabled();
  });

  it("saves anonymous attempts through the sync storage facade", async () => {
    const { container } = render(
      <LocaleProvider initialLocale="en">
        <TodayClient puzzle={puzzle} />
      </LocaleProvider>,
    );

    const boardWrapper = container.querySelector('[tabindex="0"]') as HTMLDivElement | null;
    fireEvent.keyDown(boardWrapper!, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Confirm move" }));

    await waitFor(() => expect(saveAttempt).toHaveBeenCalledTimes(1));
    expect(createSyncStorage).toHaveBeenCalledWith(null);
    expect(fetch).toHaveBeenCalledWith(
      "/api/puzzle/attempt",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ puzzleId: "cld-001", userMove: { x: 4, y: 4 } }),
      }),
    );
    expect(saveAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        puzzleId: "cld-001",
        userMove: { x: 4, y: 4 },
        correct: true,
        revealToken: "reveal-token",
      }),
    );
    expect(push).toHaveBeenCalledWith("/en/result?id=cld-001");
  });

  it("queues logged-in attempts for the current user", async () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { id: "user-123" } as ReturnType<typeof useCurrentUser>["user"],
      loading: false,
      error: null,
    });

    const { container } = render(
      <LocaleProvider initialLocale="en">
        <TodayClient puzzle={puzzle} />
      </LocaleProvider>,
    );

    const boardWrapper = container.querySelector('[tabindex="0"]') as HTMLDivElement | null;
    fireEvent.keyDown(boardWrapper!, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Confirm move" }));

    await waitFor(() => expect(saveAttempt).toHaveBeenCalledTimes(1));
    expect(createSyncStorage).toHaveBeenCalledWith("user-123");
  });

  it("renders onboarding guidance and routes the first submission as onboarding", async () => {
    const { container } = render(
      <LocaleProvider initialLocale="en">
        <TodayClient puzzle={puzzle} mode="onboarding" onboardingLevel="intermediate" />
      </LocaleProvider>,
    );

    expect(screen.getByText("Solve one puzzle, then let AI explain why")).toBeInTheDocument();
    expect(screen.getByText("1 kyu / 2 kyu / 1 dan / 2 dan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Intermediate/ })).toHaveAttribute(
      "href",
      "/en/onboarding?level=intermediate",
    );

    fireEvent.click(screen.getByRole("button", { name: "Give me another hint" }));
    expect(screen.getByText(/Then inspect liberties/)).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith("puzzle_hint_requested", {
      puzzleId: "cld-001",
      source: "onboarding",
      hintIndex: 1,
    });

    const boardWrapper = container.querySelector('[tabindex="0"]') as HTMLDivElement | null;
    fireEvent.keyDown(boardWrapper!, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Submit first move" }));

    await waitFor(() => expect(saveAttempt).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/en/result?id=cld-001&source=onboarding&level=intermediate");
    expect(trackMock).toHaveBeenCalledWith("first_puzzle_submitted", {
      puzzleId: "cld-001",
      level: "intermediate",
      correct: true,
    });
  });

  it("saves logged-in onboarding level to the account profile", async () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { id: "user-123" } as ReturnType<typeof useCurrentUser>["user"],
      loading: false,
      error: null,
    });

    render(
      <LocaleProvider initialLocale="en">
        <TodayClient puzzle={puzzle} mode="onboarding" onboardingLevel="advanced" />
      </LocaleProvider>,
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/profile/training-level",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ level: "advanced" }),
        }),
      ),
    );
  });

  it("offers random practice from today's puzzle and requests unattempted puzzles by level", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/puzzle/random") {
          return Response.json({ puzzleId: "p-random", level: "advanced" });
        }
        return Response.json({
          puzzleId: "cld-001",
          userMove: { x: 4, y: 4 },
          correct: true,
          revealToken: "reveal-token",
        });
      }),
    );

    render(
      <LocaleProvider initialLocale="en">
        <TodayClient
          puzzle={puzzle}
          metaLabel="2026-05-08"
          dailyLevel="advanced"
          showRandomAction
        />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Practice a random puzzle" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/puzzle/random",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ attemptedPuzzleIds: ["cld-001"], level: "advanced" }),
        }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/en/puzzles/p-random");
    expect(trackMock).toHaveBeenCalledWith("random_puzzle_picked", {
      puzzleId: "p-random",
      source: "today",
      level: "advanced",
    });
  });
});
