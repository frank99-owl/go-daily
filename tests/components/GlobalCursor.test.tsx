import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalCursor } from "@/components/GlobalCursor";

function mockMatchMedia(matches: boolean) {
  const mql = {
    matches,
    media: "(hover: hover) and (pointer: fine)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  return mql;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GlobalCursor", () => {
  it("renders the custom cursor on fine-pointer devices", () => {
    mockMatchMedia(true);
    const { container } = render(<GlobalCursor />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders nothing on coarse-pointer (touch) devices", () => {
    mockMatchMedia(false);
    const { container } = render(<GlobalCursor />);
    expect(container.firstChild).toBeNull();
  });

  it("falls back to rendering the cursor when matchMedia is unavailable", () => {
    // Matches the pre-gating behavior: only a confirmed coarse pointer hides it.
    vi.stubGlobal("matchMedia", undefined);
    const { container } = render(<GlobalCursor />);
    expect(container.firstChild).not.toBeNull();
  });

  it("unsubscribes from the media query on unmount", () => {
    const mql = mockMatchMedia(true);
    const { unmount } = render(<GlobalCursor />);
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
