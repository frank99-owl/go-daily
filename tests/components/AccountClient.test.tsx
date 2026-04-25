import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountClient } from "@/app/[locale]/account/AccountClient";
import { LocaleProvider } from "@/lib/i18n";

const trackMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  deleteAccount: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/posthog/events", () => ({
  track: trackMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock }),
}));

function renderAccount(hasBillingPortal = false) {
  return render(
    <LocaleProvider initialLocale="en">
      <AccountClient
        email="user@example.com"
        provider="google"
        hasBillingPortal={hasBillingPortal}
      />
    </LocaleProvider>,
  );
}

function deferredFetchMock() {
  let resolveFn: ((value: unknown) => void) | undefined;
  const fetchFn = vi.fn(
    () =>
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
  );
  return {
    fetchFn,
    resolve: (body: object, status = 200) =>
      resolveFn?.({ ok: status < 400, status, json: () => Promise.resolve(body) }),
  };
}

describe("AccountClient", () => {
  beforeEach(() => {
    trackMock.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not show billing controls for users without a Stripe customer", () => {
    renderAccount(false);

    expect(screen.queryByRole("button", { name: "Manage subscription" })).toBeNull();
  });

  it("opens the Stripe billing portal and tracks the account portal click", async () => {
    const { fetchFn } = deferredFetchMock();
    vi.stubGlobal("fetch", fetchFn);

    renderAccount(true);
    fireEvent.click(screen.getByRole("button", { name: "Manage subscription" }));

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith("portal_click", { source: "account" });
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/stripe/portal",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByRole("button", { name: "Opening Stripe…" })).toBeDisabled();
  });

  it("shows a localized error when the portal API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "no_subscription" }),
      } as Response),
    );

    renderAccount(true);
    fireEvent.click(screen.getByRole("button", { name: "Manage subscription" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Couldn't open subscription management. Please try again.",
      );
    });
  });
});
