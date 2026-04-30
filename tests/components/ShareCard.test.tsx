import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShareCard } from "@/components/ShareCard";
import { LocaleProvider } from "@/lib/i18n/i18n";
import type { PublicPuzzle } from "@/types";

const puzzle: PublicPuzzle = {
  id: "share-001",
  date: "2026-04-24",
  boardSize: 9,
  stones: [
    { x: 3, y: 3, color: "black" },
    { x: 4, y: 4, color: "white" },
  ],
  toPlay: "black",
  tag: "life-death",
  difficulty: 2,
  prompt: {
    zh: "黑先活",
    en: "Black to live",
    ja: "黒先活",
    ko: "흑선활",
  },
  source: "2026-04-24",
  coachAvailable: false,
};

function renderShareCard() {
  return render(
    <LocaleProvider initialLocale="en">
      <ShareCard puzzle={puzzle} correct elapsedSeconds={18} />
    </LocaleProvider>,
  );
}

function defineNavigatorShare({
  canShare,
  share,
}: {
  canShare: (data: ShareData) => boolean;
  share: (data: ShareData) => Promise<void>;
}) {
  Object.defineProperty(window.navigator, "canShare", {
    value: canShare,
    configurable: true,
  });
  Object.defineProperty(window.navigator, "share", {
    value: share,
    configurable: true,
  });
}

describe("ShareCard", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "toDataURL", {
      value: vi.fn(() => "data:image/png;base64,go-daily"),
      configurable: true,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
      value: vi.fn((callback: BlobCallback) => {
        callback(new Blob(["png"], { type: "image/png" }));
      }),
      configurable: true,
    });
    vi.mocked(HTMLAnchorElement.prototype.click).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the localized download and share buttons", () => {
    renderShareCard();

    expect(screen.getByRole("button", { name: "Download image" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  });

  it("draws a PNG and triggers a download", () => {
    renderShareCard();

    fireEvent.click(screen.getByRole("button", { name: "Download image" }));

    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/png");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it("uses Web Share when files are supported", async () => {
    const canShare = vi.fn(() => true);
    const share = vi.fn(async () => {});
    defineNavigatorShare({ canShare, share });

    renderShareCard();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(canShare).toHaveBeenCalledWith(
      expect.objectContaining({
        files: expect.any(Array),
        title: "go-daily",
        text: "2026-04-24 · Correct!",
      }),
    );
  });

  it("falls back to image download when Web Share cannot share files", async () => {
    defineNavigatorShare({
      canShare: vi.fn(() => false),
      share: vi.fn(async () => {}),
    });

    renderShareCard();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => {
      expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/png");
    });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });
});
