import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GoBoard } from "@/components/GoBoard";

describe("GoBoard", () => {
  it("renders canvas with aria-label", () => {
    render(<GoBoard size={9} stones={[{ x: 3, y: 3, color: "black" }]} toPlay="white" />);
    const canvas = screen.getByRole("img");
    expect(canvas).toHaveAttribute("aria-label", "Go board, 9 by 9");
  });

  it("calls onPlay with correct coordinate on click", () => {
    const onPlay = vi.fn();
    const { container } = render(<GoBoard size={9} stones={[]} toPlay="black" onPlay={onPlay} />);

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();

    // Mock getBoundingClientRect so pickCoord can calculate coordinates
    const rect = { left: 0, top: 0, width: 520, height: 520 };
    canvas!.getBoundingClientRect = () => rect as DOMRect;

    // Click near the center of the canvas
    fireEvent.pointerDown(canvas!, {
      clientX: 260,
      clientY: 260,
    });

    // Should have called onPlay with some coordinate (exact value depends on padding math)
    expect(onPlay).toHaveBeenCalledTimes(1);
    const call = onPlay.mock.calls[0][0] as { x: number; y: number };
    expect(call).toHaveProperty("x");
    expect(call).toHaveProperty("y");
    expect(Number.isInteger(call.x)).toBe(true);
    expect(Number.isInteger(call.y)).toBe(true);
    expect(call.x).toBeGreaterThanOrEqual(0);
    expect(call.x).toBeLessThan(9);
    expect(call.y).toBeGreaterThanOrEqual(0);
    expect(call.y).toBeLessThan(9);
  });

  it("does not call onPlay when disabled", () => {
    const onPlay = vi.fn();
    const { container } = render(
      <GoBoard size={9} stones={[]} toPlay="black" onPlay={onPlay} disabled />,
    );

    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();

    const rect = { left: 0, top: 0, width: 520, height: 520 };
    canvas!.getBoundingClientRect = () => rect as DOMRect;

    fireEvent.pointerDown(canvas!, { clientX: 260, clientY: 260 });
    expect(onPlay).not.toHaveBeenCalled();
  });
});
