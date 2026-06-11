import { fireEvent, render, screen } from "@testing-library/react";
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
        menu: "Menu",
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

  it("keeps the mobile menu closed by default", () => {
    render(<Nav />);
    const toggle = screen.getByRole("button", { name: "Menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText("Home")).toHaveLength(1);
  });

  it("opens the mobile menu and closes it when a link is clicked", () => {
    render(<Nav />);
    const toggle = screen.getByRole("button", { name: "Menu" });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // Desktop nav + mobile panel both render the links now.
    const homeLinks = screen.getAllByText("Home");
    expect(homeLinks).toHaveLength(2);

    fireEvent.click(homeLinks[1]);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText("Home")).toHaveLength(1);
  });
});
