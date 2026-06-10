import { render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomeShowcase } from "@/components/HomeShowcase";

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="board-showcase" />,
}));

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      media: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomeShowcase", () => {
  it("renders the board showcase at md and above", () => {
    mockMatchMedia(true);
    render(<HomeShowcase />);
    expect(screen.getByTestId("board-showcase")).toBeInTheDocument();
  });

  it("renders nothing below md (phones)", () => {
    mockMatchMedia(false);
    const { container } = render(<HomeShowcase />);
    expect(container.firstChild).toBeNull();
  });
});
