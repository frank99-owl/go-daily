import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HeroSection } from "@/components/HeroSection";
import { useCurrentUser } from "@/lib/auth/auth";
import { LocaleProvider } from "@/lib/i18n/i18n";
import { loadAttempts } from "@/lib/storage/storage";
import { createSyncStorage } from "@/lib/storage/syncStorage";
import type { AttemptRecord } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={String(src)} {...props} />
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
  },
  useScroll: () => ({ scrollYProgress: 0 }),
  useTransform: () => undefined,
}));

vi.mock("@/lib/auth/auth", () => ({
  useCurrentUser: vi.fn(),
}));

vi.mock("@/lib/storage/storage", () => ({
  loadAttempts: vi.fn(),
}));

vi.mock("@/lib/storage/syncStorage", () => ({
  createSyncStorage: vi.fn(),
}));

const attempt: AttemptRecord = {
  puzzleId: "p-00001",
  date: "2026-05-07",
  userMove: { x: 4, y: 4 },
  correct: true,
  solvedAtMs: 1_777_757_200_000,
};

function renderHero(initialLocale: "zh" | "en" = "zh") {
  return render(
    <LocaleProvider initialLocale={initialLocale}>
      <HeroSection />
    </LocaleProvider>,
  );
}

describe("HeroSection onboarding CTA", () => {
  const push = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(useCurrentUser).mockReturnValue({ user: null, loading: false, error: null });
    vi.mocked(loadAttempts).mockReturnValue([]);
    vi.mocked(createSyncStorage).mockReturnValue({
      getAttempts: vi.fn(async () => []),
      saveAttempt: vi.fn(async () => {}),
      sync: vi.fn(async () => ({ pushed: 0, pulled: 0 })),
    });
  });

  it("keeps the previous hero title and routes first-time visitors to onboarding", async () => {
    renderHero("zh");

    expect(screen.getByText("围棋智慧")).toBeInTheDocument();
    expect(screen.getByText("纵横之间")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "开始今日题目" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/zh/onboarding"));
  });

  it("routes visitors with local training history to today's puzzle", async () => {
    vi.mocked(loadAttempts).mockReturnValue([attempt]);
    renderHero("zh");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "开始今日题目" })).toHaveAttribute(
        "data-onboarding-target",
        "/today",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "开始今日题目" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/zh/today"));
  });

  it("pulls signed-in attempt history before deciding the hero target", async () => {
    let history: AttemptRecord[] = [];
    const sync = vi.fn(async () => {
      history = [attempt];
      return { pushed: 0, pulled: 1 };
    });
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { id: "user-1" } as ReturnType<typeof useCurrentUser>["user"],
      loading: false,
      error: null,
    });
    vi.mocked(loadAttempts).mockImplementation(() => history);
    vi.mocked(createSyncStorage).mockReturnValue({
      getAttempts: vi.fn(async () => history),
      saveAttempt: vi.fn(async () => {}),
      sync,
    });

    renderHero("en");

    await waitFor(() => expect(sync).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Today's Puzzle" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/today"));
  });
});
