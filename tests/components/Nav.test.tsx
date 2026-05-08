import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { Nav } from "@/components/Nav";

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
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders navigation links", () => {
    render(<Nav />);
    expect(screen.getByText("GO-DAILY")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Puzzles")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.queryByLabelText("Random")).toBeNull();
  });
});
