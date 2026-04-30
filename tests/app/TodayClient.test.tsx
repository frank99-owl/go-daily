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
});
