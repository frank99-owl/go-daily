import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom does not implement scrollTo
if (typeof Element !== "undefined") {
  Element.prototype.scrollTo = vi.fn();
}

// jsdom does not implement ResizeObserver
if (typeof ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  } as unknown as typeof ResizeObserver;
}

if (typeof HTMLCanvasElement !== "undefined") {
  const gradient = { addColorStop: vi.fn() };
  const mockContext = {
    scale: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 42 })),
    setLineDash: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
    createLinearGradient: vi.fn(() => gradient),
  };

  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => mockContext as unknown as CanvasRenderingContext2D,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

// jsdom does not fully implement localStorage / sessionStorage
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
    writable: true,
  });

  Object.defineProperty(window, "sessionStorage", {
    value: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
    writable: true,
  });

  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn(() => "blob:go-daily-test"),
    writable: true,
  });

  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    writable: true,
  });
}

if (typeof HTMLAnchorElement !== "undefined") {
  HTMLAnchorElement.prototype.click = vi.fn();
}
