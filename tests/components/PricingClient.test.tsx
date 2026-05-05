import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PricingClient } from "@/app/[locale]/pricing/PricingClient";
import { LocaleProvider } from "@/lib/i18n/i18n";

const trackMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/posthog/events", () => ({
  track: trackMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

function renderPricing(viewerPlan: "guest" | "free" | "pro", hasBillingPortal = false) {
  return render(
    <LocaleProvider initialLocale="zh">
      <PricingClient viewerPlan={viewerPlan} locale="zh" hasBillingPortal={hasBillingPortal} />
    </LocaleProvider>,
  );
}

/**
 * Returns a fetch mock that resolves with the given response after awaiting
 * the returned `resolve`. Lets tests assert on the in-flight UI without the
 * component navigating away via window.location.href.
 */
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

describe("PricingClient", () => {
  beforeEach(() => {
    trackMock.mockReset();
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("fires paywall_view on mount with the viewer plan", () => {
    renderPricing("free");
    expect(trackMock).toHaveBeenCalledWith("paywall_view", {
      viewerPlan: "free",
      source: "pricing",
    });
  });

  describe("guest", () => {
    it("renders the sign-in CTA pointing back to the localized pricing page", () => {
      renderPricing("guest");
      const link = screen.getByRole("link", { name: "登录后继续" });
      expect(link.getAttribute("href")).toBe("/zh/login?next=%2Fzh%2Fpricing");
      // Sanity: the checkout CTA is not rendered for guests.
      expect(screen.queryByRole("button", { name: /开始月付计划/ })).toBeNull();
    });
  });

  describe("free", () => {
    it("fires checkout_click(monthly) and POSTs to /api/stripe/checkout when the monthly CTA is clicked", async () => {
      const { fetchFn } = deferredFetchMock();
      vi.stubGlobal("fetch", fetchFn);

      renderPricing("free");
      fireEvent.click(screen.getByRole("button", { name: "开始月付计划" }));

      await waitFor(() =>
        expect(trackMock).toHaveBeenCalledWith("checkout_click", {
          interval: "monthly",
          source: "pricing",
        }),
      );
      expect(fetchFn).toHaveBeenCalledWith(
        "/api/stripe/checkout",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ interval: "monthly" }),
        }),
      );
    });

    it("switches to yearly pricing when the yearly tab is clicked and fires checkout_click(yearly)", async () => {
      const { fetchFn } = deferredFetchMock();
      vi.stubGlobal("fetch", fetchFn);

      renderPricing("free");
      fireEvent.click(screen.getByRole("tab", { name: "年付" }));
      expect(screen.getByText(/\$29\.90/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "开始年付计划" }));

      await waitFor(() =>
        expect(trackMock).toHaveBeenCalledWith("checkout_click", {
          interval: "yearly",
          source: "pricing",
        }),
      );
      expect(fetchFn).toHaveBeenCalledWith(
        "/api/stripe/checkout",
        expect.objectContaining({
          body: JSON.stringify({ interval: "yearly" }),
        }),
      );
    });

    it("surfaces the localized error when the checkout API fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "not_configured" }),
        } as Response),
      );

      renderPricing("free");
      fireEvent.click(screen.getByRole("button", { name: "开始月付计划" }));

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("无法启动结账流程");
      });
    });
  });

  describe("pro", () => {
    it("fires portal_click and POSTs to /api/stripe/portal when the manage button is clicked", async () => {
      const { fetchFn } = deferredFetchMock();
      vi.stubGlobal("fetch", fetchFn);

      renderPricing("pro", true);
      expect(screen.getByText("你已经是 Pro 用户啦")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "管理订阅" }));

      await waitFor(() =>
        expect(trackMock).toHaveBeenCalledWith("portal_click", { source: "pricing" }),
      );
      expect(fetchFn).toHaveBeenCalledWith(
        "/api/stripe/portal",
        expect.objectContaining({ method: "POST" }),
      );
      // Checkout CTAs should not exist for pro users.
      expect(screen.queryByRole("button", { name: /开始月付计划/ })).toBeNull();
    });

    it("does not show Stripe portal controls for manually granted Pro", () => {
      renderPricing("pro");

      expect(screen.getByText("你已经是 Pro 用户啦")).toBeInTheDocument();
      expect(screen.getByText(/这个账号是手动授予的 Pro/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "管理订阅" })).toBeNull();
      expect(screen.queryByRole("button", { name: /开始月付计划/ })).toBeNull();
    });
  });
});
