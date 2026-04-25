import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthPromptCard } from "@/components/AuthPromptCard";
import { signInWithEmail, signInWithGoogle } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth", () => ({
  isLikelyEmail: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

function renderCard(
  props: Partial<React.ComponentProps<typeof AuthPromptCard>> = {},
  initialLocale: "en" | "zh" = "en",
) {
  return render(
    <LocaleProvider initialLocale={initialLocale}>
      <AuthPromptCard next="/en/today" {...props} />
    </LocaleProvider>,
  );
}

describe("AuthPromptCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(signInWithGoogle).mockResolvedValue({ ok: true });
    vi.mocked(signInWithEmail).mockResolvedValue({ ok: true });
  });

  it("renders Google and guest paths while keeping email hidden by default", () => {
    renderCard({ showEmailLogin: false });

    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue as guest" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Email address")).toBeNull();
  });

  it("starts Google sign-in with the locale and return path", async () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(signInWithGoogle).toHaveBeenCalledWith("en", "/en/today");
    });
  });

  it("uses the provided guest callback before falling back to router navigation", () => {
    const onGuestContinue = vi.fn();
    renderCard({ onGuestContinue });

    fireEvent.click(screen.getByRole("button", { name: "Continue as guest" }));

    expect(onGuestContinue).toHaveBeenCalledTimes(1);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("navigates guests to next when no callback is provided", () => {
    renderCard();

    fireEvent.click(screen.getByRole("button", { name: "Continue as guest" }));

    expect(pushMock).toHaveBeenCalledWith("/en/today");
  });

  it("renders callback auth errors as localized alerts", () => {
    renderCard({ authError: "OAuth denied" }, "zh");

    expect(screen.getByRole("alert")).toHaveTextContent("登录失败：OAuth denied");
  });

  it("validates email before requesting a magic link", async () => {
    renderCard({ showEmailLogin: true });

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "frank@example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send magic link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That doesn't look like a valid email.",
    );
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  it("shows the inbox confirmation after a magic link request succeeds", async () => {
    renderCard({ showEmailLogin: true });

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "frank@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send magic link" }));

    await waitFor(() => {
      expect(signInWithEmail).toHaveBeenCalledWith("frank@example.com", "en", "/en/today");
    });
    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
    expect(screen.getByText(/frank@example\.com/)).toBeInTheDocument();
  });
});
