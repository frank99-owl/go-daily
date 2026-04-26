import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClientInit } from "@/components/ClientInit";
import { useCurrentUser } from "@/lib/auth/auth";
import { initGlobalErrorHandlers } from "@/lib/errorReporting";
import { createSyncStorage, flushSyncQueue } from "@/lib/storage/syncStorage";

vi.mock("@/lib/auth/auth", () => ({
  useCurrentUser: vi.fn(),
}));

vi.mock("@/lib/errorReporting", () => ({
  initGlobalErrorHandlers: vi.fn(),
}));

const sync = vi.fn(async () => ({ pushed: 0, pulled: 0 }));

vi.mock("@/lib/storage/syncStorage", () => ({
  createSyncStorage: vi.fn(() => ({ sync })),
  flushSyncQueue: vi.fn(async () => 0),
}));

describe("ClientInit", () => {
  let originalServiceWorker: ServiceWorkerContainer | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    sync.mockResolvedValue({ pushed: 0, pulled: 0 });
    vi.mocked(flushSyncQueue).mockResolvedValue(0);
    vi.mocked(useCurrentUser).mockReturnValue({ user: null, loading: false });
    originalServiceWorker = navigator.serviceWorker;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: originalServiceWorker,
      configurable: true,
    });
  });

  it("initializes global client handlers", () => {
    render(<ClientInit />);

    expect(initGlobalErrorHandlers).toHaveBeenCalledTimes(1);
  });

  it("runs one initial sync for a logged-in user", async () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { id: "user-1" } as ReturnType<typeof useCurrentUser>["user"],
      loading: false,
    });

    render(<ClientInit />);

    await waitFor(() => {
      expect(createSyncStorage).toHaveBeenCalledWith("user-1");
      expect(sync).toHaveBeenCalledTimes(1);
    });
  });

  it("flushes the sync queue when a logged-in browser comes back online", async () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { id: "user-1" } as ReturnType<typeof useCurrentUser>["user"],
      loading: false,
    });

    render(<ClientInit />);
    window.dispatchEvent(new Event("online"));

    await waitFor(() => {
      expect(flushSyncQueue).toHaveBeenCalledWith("user-1");
    });
  });

  it("asks the service worker to fan out online flushes to other windows", async () => {
    const postMessage = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        controller: { postMessage },
      },
      configurable: true,
    });
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { id: "user-1" } as ReturnType<typeof useCurrentUser>["user"],
      loading: false,
    });

    render(<ClientInit />);
    window.dispatchEvent(new Event("online"));

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({ type: "go-daily.client-online" });
    });
  });

  it("flushes when the service worker broadcasts a sync message", async () => {
    let messageHandler: ((event: MessageEvent) => void) | undefined;
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        addEventListener: vi.fn((type: string, handler: (event: MessageEvent) => void) => {
          if (type === "message") messageHandler = handler;
        }),
        removeEventListener: vi.fn(),
        controller: null,
      },
      configurable: true,
    });
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { id: "user-1" } as ReturnType<typeof useCurrentUser>["user"],
      loading: false,
    });

    render(<ClientInit />);
    messageHandler?.(new MessageEvent("message", { data: { type: "go-daily.flush-sync-queue" } }));

    await waitFor(() => {
      expect(flushSyncQueue).toHaveBeenCalledWith("user-1");
    });
  });

  it("does not flush sync queue for anonymous users", () => {
    render(<ClientInit />);
    window.dispatchEvent(new Event("online"));

    expect(createSyncStorage).not.toHaveBeenCalled();
    expect(flushSyncQueue).not.toHaveBeenCalled();
  });
});
