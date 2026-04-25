import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpsellModal, UpsellSource } from "@/components/UpsellModal";
import { LocaleProvider } from "@/lib/i18n";

const trackMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/posthog/events", () => ({
  track: trackMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

function renderModal({
  open = true,
  source = "coach_device",
}: { open?: boolean; source?: UpsellSource } = {}) {
  const onClose = vi.fn();
  const utils = render(
    <LocaleProvider initialLocale="zh">
      <UpsellModal open={open} onClose={onClose} source={source} />
    </LocaleProvider>,
  );
  return { ...utils, onClose };
}

describe("UpsellModal", () => {
  beforeEach(() => {
    trackMock.mockReset();
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not render a dialog when open is false", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the dialog and fires upsell_open with the provided source when opened", () => {
    renderModal({ open: true, source: "coach_daily" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(trackMock).toHaveBeenCalledWith("upsell_open", { source: "coach_daily" });
  });

  it("renders all three Pro features from the dictionary", () => {
    renderModal({ open: true });
    expect(screen.getByText("多端同步")).toBeInTheDocument();
    expect(screen.getByText(/AI 教练：10 次\/天/)).toBeInTheDocument();
    expect(screen.getByText("无广告")).toBeInTheDocument();
  });

  it('navigates to /{locale}/pricing and closes when the "See plans" button is clicked', () => {
    const { onClose } = renderModal({ open: true });
    fireEvent.click(screen.getByRole("button", { name: "查看套餐" }));
    expect(pushMock).toHaveBeenCalledWith("/zh/pricing");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes without navigating when "Maybe later" is clicked', () => {
    const { onClose } = renderModal({ open: true });
    // The X close button shares the "以后再说" aria-label, so target the
    // visible text button specifically.
    fireEvent.click(screen.getByText("以后再说"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const { onClose } = renderModal({ open: true });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop (outside the card) is clicked", () => {
    const { onClose } = renderModal({ open: true });
    const backdrop = screen.getByRole("dialog").parentElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not fire upsell_open repeatedly while staying open (fires once per open transition)", () => {
    const { rerender } = renderModal({ open: true });
    expect(trackMock).toHaveBeenCalledTimes(1);
    rerender(
      <LocaleProvider initialLocale="zh">
        <UpsellModal open={true} onClose={() => {}} source="coach_device" />
      </LocaleProvider>,
    );
    expect(trackMock).toHaveBeenCalledTimes(1);
  });
});
