/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { Nav } from "@/components/Nav";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

// Mock i18n
vi.mock("@/lib/i18n/i18n", () => ({
  useLocale: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: {
      nav: {
        home: "Home",
        today: "Today",
        mentors: "Mentors",
        random: "Random",
        puzzles: "Puzzles",
        review: "Review",
        stats: "Stats",
        about: "About",
      },
    },
  }),
}));

// Mock LanguageToggle since it might have its own complex logic
vi.mock("@/components/LanguageToggle", () => ({
  LanguageToggle: () => <div data-testid="language-toggle" />,
}));

// Mock UserMenu so we don't need a Supabase client / auth listener
// (and so we don't have to mock next/navigation's usePathname here).
vi.mock("@/components/UserMenu", () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

describe("Nav", () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          puzzleId: "random_id",
        }),
      ),
    );
  });

  it("renders navigation links", () => {
    render(<Nav />);
    expect(screen.getByText("GO-DAILY")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Puzzles")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
  });

  it("handles random button click", async () => {
    render(<Nav />);

    // There might be multiple elements with "Random" (e.g. icon and text), but we can find by title/aria-label
    const randomBtn = screen.getByLabelText("Random");
    fireEvent.click(randomBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/puzzle/random", { method: "POST" });
    });
    expect(mockPush).toHaveBeenCalledWith("/en/puzzles/random_id");
  });

  it("does nothing on random button click if no puzzle is picked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "No puzzles" }, { status: 404 })),
    );

    render(<Nav />);

    const randomBtn = screen.getByLabelText("Random");
    fireEvent.click(randomBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/puzzle/random", { method: "POST" });
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
