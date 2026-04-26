import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeLoginReminder } from "@/components/HomeLoginReminder";
import { useCurrentUser } from "@/lib/auth/auth";
import { LocaleProvider } from "@/lib/i18n/i18n";

const STORAGE_KEY = "go-daily.home-login-reminder.dismissed.v1";

vi.mock("@/lib/auth/auth", () => ({
  useCurrentUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const reducedMotionRef = { current: false };

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => reducedMotionRef.current,
  };
});

function renderReminder() {
  return render(
    <LocaleProvider initialLocale="zh">
      <HomeLoginReminder />
    </LocaleProvider>,
  );
}

describe("HomeLoginReminder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reducedMotionRef.current = false;
    vi.mocked(useCurrentUser).mockReturnValue({ user: null, loading: false });
    vi.mocked(window.localStorage.getItem).mockReturnValue(null);
    vi.mocked(window.localStorage.setItem).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows the reminder 3s after mount for an anonymous visitor", () => {
    renderReminder();
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not show when the user is already signed in", () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: { id: "user-1" } as ReturnType<typeof useCurrentUser>["user"],
      loading: false,
    });

    renderReminder();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not show while auth state is still loading", () => {
    vi.mocked(useCurrentUser).mockReturnValue({ user: null, loading: true });

    renderReminder();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not show when localStorage has the dismissed flag", () => {
    vi.mocked(window.localStorage.getItem).mockImplementation((key: string) =>
      key === STORAGE_KEY ? "1" : null,
    );

    renderReminder();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("persists dismissal to localStorage when the close button is clicked", () => {
    renderReminder();
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const closeBtn = screen.getByLabelText("关闭登录提示");
    fireEvent.click(closeBtn);

    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, "1");
  });

  it("closes on Escape and persists the dismissal", () => {
    renderReminder();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, "1");
  });

  it("closes when the backdrop is clicked", () => {
    renderReminder();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const backdrop = screen.getByRole("dialog").parentElement;
    expect(backdrop).not.toBeNull();

    fireEvent.click(backdrop as HTMLElement);

    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, "1");
  });

  it("closes when the user picks 'continue as guest'", () => {
    renderReminder();
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    fireEvent.click(screen.getByText("继续以游客身份使用"));

    expect(window.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, "1");
  });

  it("respects prefers-reduced-motion (no scale/translate animation tokens in DOM)", () => {
    reducedMotionRef.current = true;
    renderReminder();
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const dialog = screen.getByRole("dialog");
    const style = dialog.getAttribute("style") ?? "";
    expect(style).not.toMatch(/translateY|scale\(/);
  });
});
