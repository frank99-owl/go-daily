import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MentorsPage from "@/app/[locale]/mentors/page";
import { LocaleProvider } from "@/lib/i18n/i18n";

function renderMentorsPage() {
  render(
    <LocaleProvider initialLocale="en">
      <MentorsPage />
    </LocaleProvider>,
  );
}

// Each mentor card renders twice: once in the mobile stacked list and once
// in the desktop quincunx layout (visibility is toggled via CSS).
describe("MentorsPage", () => {
  it("opens mentor details from keyboard focus and closes with Escape", () => {
    renderMentorsPage();

    const cards = screen.getAllByRole("button", {
      name: /Deep Current: The Deep Reader/i,
    });
    expect(cards).toHaveLength(2);
    const [mobileCard, desktopCard] = cards;
    expect(desktopCard).toHaveAttribute("aria-expanded", "false");

    fireEvent.focus(desktopCard);
    expect(desktopCard).toHaveAttribute("aria-expanded", "true");
    expect(mobileCard).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(desktopCard, { key: "Escape" });
    expect(desktopCard).toHaveAttribute("aria-expanded", "false");
  });

  it("opens mentor details from click or tap", () => {
    renderMentorsPage();

    const [mobileCard] = screen.getAllByRole("button", {
      name: /Still Water: The Balanced Eye/i,
    });

    fireEvent.click(mobileCard);
    expect(mobileCard).toHaveAttribute("aria-expanded", "true");
  });

  it("closes mentor details with the mobile close button", () => {
    renderMentorsPage();

    const [mobileCard] = screen.getAllByRole("button", {
      name: /Still Water: The Balanced Eye/i,
    });
    fireEvent.click(mobileCard);
    expect(mobileCard).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mobileCard).toHaveAttribute("aria-expanded", "false");
  });

  // The mentors are fictional characters, and this page is where a visitor
  // could most easily take one for a real player. The disclosure must render
  // in both layouts — the mobile list and the desktop quincunx are separate
  // trees, so dropping it from one would not be caught by checking the other.
  it("discloses that the mentors are fictional in both layouts", () => {
    renderMentorsPage();

    const disclosures = screen.getAllByText(/fictional characters/i);
    expect(disclosures).toHaveLength(2);
  });
});
