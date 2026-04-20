import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom 未实现 scrollTo
if (typeof Element !== "undefined") {
  Element.prototype.scrollTo = vi.fn();
}

// jsdom 未实现 ResizeObserver
if (typeof ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  } as unknown as typeof ResizeObserver;
}

// jsdom 未完整实现 localStorage / sessionStorage
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
}
