/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { Nav } from "@/components/Nav";
import { pickRandomPuzzle } from "@/lib/random";
import { loadAttempts } from "@/lib/storage";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

// Mock i18n
vi.mock("@/lib/i18n", () => ({
  useLocale: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: {
      nav: {
        home: "Home",
        today: "Today",
        random: "Random",
        puzzles: "Puzzles",
        review: "Review",
        stats: "Stats",
        developer: "Developer",
      },
    },
  }),
}));

// Mock LanguageToggle since it might have its own complex logic
vi.mock("@/components/LanguageToggle", () => ({
  LanguageToggle: () => <div data-testid="language-toggle" />,
}));

// Mock storage and random logic
vi.mock("@/lib/storage", () => ({
  loadAttempts: vi.fn(),
}));
vi.mock("@/lib/random", () => ({
  pickRandomPuzzle: vi.fn(),
}));

describe("Nav", () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
    (loadAttempts as any).mockReturnValue([]);
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

  it("handles random button click", () => {
    (pickRandomPuzzle as any).mockReturnValue({ id: "random_id" });

    render(<Nav puzzleIds={["p1", "p2"]} />);

    // There might be multiple elements with "Random" (e.g. icon and text), but we can find by title/aria-label
    const randomBtn = screen.getByLabelText("Random");
    fireEvent.click(randomBtn);

    expect(loadAttempts).toHaveBeenCalled();
    expect(pickRandomPuzzle).toHaveBeenCalledWith([{ id: "p1" }, { id: "p2" }], [], "all");
    expect(mockPush).toHaveBeenCalledWith("/puzzles/random_id");
  });

  it("does nothing on random button click if no puzzle is picked", () => {
    (pickRandomPuzzle as any).mockReturnValue(null);

    render(<Nav puzzleIds={[]} />);

    const randomBtn = screen.getByLabelText("Random");
    fireEvent.click(randomBtn);

    expect(mockPush).not.toHaveBeenCalled();
  });
});
