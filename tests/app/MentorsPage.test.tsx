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

describe("MentorsPage", () => {
  it("opens mentor details from keyboard focus and closes with Escape", () => {
    renderMentorsPage();

    const leeSedol = screen.getByRole("button", {
      name: /Lee Sedol: The Invincible Fighter/i,
    });
    expect(leeSedol).toHaveAttribute("aria-expanded", "false");

    fireEvent.focus(leeSedol);
    expect(leeSedol).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(leeSedol, { key: "Escape" });
    expect(leeSedol).toHaveAttribute("aria-expanded", "false");
  });

  it("opens mentor details from click or tap", () => {
    renderMentorsPage();

    const goSeigen = screen.getByRole("button", {
      name: /Go Seigen: The Sage of Harmony/i,
    });

    fireEvent.click(goSeigen);
    expect(goSeigen).toHaveAttribute("aria-expanded", "true");
  });
});
