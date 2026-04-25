import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PuzzleStatusBadge } from "@/components/PuzzleStatusBadge";

describe("PuzzleStatusBadge", () => {
  it("renders 'solved' status with check icon", () => {
    render(<PuzzleStatusBadge status="solved" title="Solved puzzle" />);
    const badge = screen.getByLabelText("Solved puzzle");
    expect(badge).toBeInTheDocument();
    // It should have the accent background
    expect(badge).toHaveClass("bg-[color:var(--color-accent)]");
    expect(badge).toHaveClass("text-white");
  });

  it("renders 'attempted' status", () => {
    render(<PuzzleStatusBadge status="attempted" />);
    const badge = screen.getByLabelText("attempted");
    expect(badge).toBeInTheDocument();
    // It should be a hollow ring
    expect(badge).toHaveClass("border-[color:var(--color-accent)]");
    expect(badge).toHaveClass("border-2");
  });

  it("renders 'unattempted' status", () => {
    render(<PuzzleStatusBadge status="unattempted" />);
    const badge = screen.getByLabelText("unattempted");
    expect(badge).toBeInTheDocument();
    // It should be a faint dot
    expect(badge).toHaveClass("bg-[color:var(--color-line)]");
  });

  it("applies 'sm' size classes", () => {
    render(<PuzzleStatusBadge status="unattempted" size="sm" title="Small badge" />);
    const badge = screen.getByLabelText("Small badge");
    expect(badge).toHaveClass("h-3.5");
    expect(badge).toHaveClass("w-3.5");
  });

  it("applies 'md' size classes by default", () => {
    render(<PuzzleStatusBadge status="unattempted" title="Medium badge" />);
    const badge = screen.getByLabelText("Medium badge");
    expect(badge).toHaveClass("h-5");
    expect(badge).toHaveClass("w-5");
  });
});
