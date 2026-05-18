import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { CoachDialogue } from "@/components/CoachDialogue";
import { LocaleProvider } from "@/lib/i18n/i18n";

const trackMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/posthog/events", () => ({
  track: trackMock,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/zh/result",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth/auth", () => ({
  useCurrentUser: () => ({ user: { id: "test-user" }, loading: false, error: null }),
}));

vi.mock("@/lib/auth/deviceId", () => ({
  getOrCreateDeviceId: () => "test-device-id",
}));

const coachReadyAccess = {
  available: true,
  reason: "approved" as const,
  contentTier: "coach-ready" as const,
  qualityTier: "coach-ready" as const,
  hasVariationSupport: true,
  capabilities: {
    staticExplanation: true,
    basicCoach: true,
    fullCoach: true,
    variationQuestions: false,
  },
};

const basicExplainedAccess = {
  available: false,
  reason: "restricted" as const,
  contentTier: "basic-explained" as const,
  qualityTier: "explained" as const,
  hasVariationSupport: false,
  capabilities: {
    staticExplanation: true,
    basicCoach: false,
    fullCoach: false,
    variationQuestions: false,
  },
};

const coachEligibleAccess = {
  available: false,
  reason: "restricted" as const,
  contentTier: "coach-eligible" as const,
  qualityTier: "explained" as const,
  hasVariationSupport: false,
  capabilities: {
    staticExplanation: true,
    basicCoach: true,
    fullCoach: false,
    variationQuestions: false,
  },
};

describe("CoachDialogue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    trackMock.mockReset();
    sessionStorage.clear();
  });

  function renderWithLocale() {
    return render(
      <LocaleProvider initialLocale="zh">
        <CoachDialogue puzzleId="test-puzzle" userMove={{ x: 3, y: 3 }} />
      </LocaleProvider>,
    );
  }

  it("renders empty state", () => {
    renderWithLocale();
    expect(screen.getByPlaceholderText(/向 AI 提问/i)).toBeInTheDocument();
  });

  it("renders the coach-ready capability boundary", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              usage: { dailyRemaining: 8, monthlyRemaining: 20 },
            }),
        } as Response),
      ),
    );

    render(
      <LocaleProvider initialLocale="en">
        <CoachDialogue
          puzzleId="test-puzzle"
          userMove={{ x: 3, y: 3 }}
          coachAccess={coachReadyAccess}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText(/coach-ready: ask about the main line/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /What is the main line after the correct move/ }),
    ).toBeInTheDocument();
  });

  it("shows available quota status without exposing exact limits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              usage: { dailyRemaining: 8, monthlyRemaining: 20 },
            }),
        } as Response),
      ),
    );

    render(
      <LocaleProvider initialLocale="en">
        <CoachDialogue
          puzzleId="test-puzzle"
          userMove={{ x: 3, y: 3 }}
          coachAccess={coachReadyAccess}
        />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Coach quota available")).toBeInTheDocument();
    });
    expect(screen.queryByText(/8/)).not.toBeInTheDocument();
    expect(screen.queryByText(/20/)).not.toBeInTheDocument();
  });

  it("shows a restrained unavailable quota status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              usage: { dailyRemaining: 0, monthlyRemaining: 12 },
            }),
        } as Response),
      ),
    );

    render(
      <LocaleProvider initialLocale="en">
        <CoachDialogue
          puzzleId="test-puzzle"
          userMove={{ x: 3, y: 3 }}
          coachAccess={coachReadyAccess}
        />
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Coach temporarily unavailable")).toBeInTheDocument();
    });
    expect(screen.queryByText(/0/)).not.toBeInTheDocument();
    expect(screen.queryByText(/12/)).not.toBeInTheDocument();
  });

  it("keeps basic-explained read-only without full Coach prompts", () => {
    render(
      <LocaleProvider initialLocale="en">
        <CoachDialogue
          puzzleId="test-puzzle"
          userMove={{ x: 3, y: 3 }}
          coachAccess={basicExplainedAccess}
        />
      </LocaleProvider>,
    );

    expect(
      screen.getByText(/basic-explained: read the curated explanation only/),
    ).toBeInTheDocument();
    expect(screen.getByText(/static explanation/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /What is the main line after the correct move/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
  });

  it("keeps coach-eligible read-only until reviewed lines exist", () => {
    render(
      <LocaleProvider initialLocale="en">
        <CoachDialogue
          puzzleId="test-puzzle"
          userMove={{ x: 3, y: 3 }}
          coachAccess={coachEligibleAccess}
        />
      </LocaleProvider>,
    );

    expect(
      screen.getByText(/coach-eligible: content is waiting for reviewed coach lines/),
    ).toBeInTheDocument();
    expect(screen.getByText(/content backfill queue/)).toBeInTheDocument();
    expect(screen.getByText(/What should I focus on in the explanation/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /What is the main line after the correct move/ }),
    ).not.toBeInTheDocument();
  });

  it("sends a message and shows it in the list", async () => {
    renderWithLocale();
    const input = screen.getByPlaceholderText(/向 AI 提问/i);
    const btn = screen.getByText(/发送/i);

    fireEvent.change(input, { target: { value: "为什么这手是对的？" } });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText("为什么这手是对的？")).toBeInTheDocument();
    });
  });

  it("sends the browser device ID for authenticated coach requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta: "Coach reply" })}\n\n`),
            );
            controller.close();
          },
        });
        return Promise.resolve({ ok: true, status: 200, body: stream } as Response);
      }),
    );

    renderWithLocale();
    const input = screen.getByPlaceholderText(/向 AI 提问/i);
    const btn = screen.getByText(/发送/i);

    fireEvent.change(input, { target: { value: "设备测试" } });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe("include");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toMatchObject({
      "x-go-daily-device-id": "test-device-id",
    });
    expect(init.headers).not.toHaveProperty("x-go-daily-guest-device-id");
  });

  it("shows error when API returns non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 502,
          json: () => Promise.resolve({ error: "AI 教练暂时不可用" }),
        } as Response),
      ),
    );

    renderWithLocale();
    const input = screen.getByPlaceholderText(/向 AI 提问/i);
    const btn = screen.getByText(/发送/i);

    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/AI 教练暂时不可用/)).toBeInTheDocument();
    });
  });

  it("shows pending state while waiting for response", async () => {
    let resolveResponse: (value: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(() => responsePromise),
    );

    renderWithLocale();
    const input = screen.getByPlaceholderText(/向 AI 提问/i);
    const btn = screen.getByText(/发送/i);

    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.click(btn);

    // Should show pending state immediately
    await waitFor(() => {
      expect(screen.getByText(/思考中/i)).toBeInTheDocument();
    });

    // Resolve the fetch with an SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: "这是回复" })}\n\n`));
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, usage: {} })}\n\n`),
        );
        controller.close();
      },
    });

    resolveResponse!({
      ok: true,
      status: 200,
      body: stream,
    } as Response);

    await waitFor(() => {
      expect(screen.getByText("这是回复")).toBeInTheDocument();
    });
  });

  it("disables send button when input is empty", () => {
    renderWithLocale();
    const btn = screen.getByText(/发送/i);
    expect(btn).toBeDisabled();
  });

  it("submits on Enter key", async () => {
    renderWithLocale();
    const input = screen.getByPlaceholderText(/向 AI 提问/i);

    fireEvent.change(input, { target: { value: "Enter test" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText("Enter test")).toBeInTheDocument();
    });
  });

  it("sends suggested prompts and tracks first coach prompt usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta: "Suggested reply" })}\n\n`),
            );
            controller.close();
          },
        });
        return Promise.resolve({ ok: true, status: 200, body: stream } as Response);
      }),
    );

    render(
      <LocaleProvider initialLocale="zh">
        <CoachDialogue
          puzzleId="test-puzzle"
          userMove={{ x: 3, y: 3 }}
          suggestedPrompts={["为什么我这手不够好？"]}
          suggestedPromptSource="onboarding_result"
        />
      </LocaleProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "为什么我这手不够好？" }));

    await waitFor(() => {
      expect(screen.getByText("Suggested reply")).toBeInTheDocument();
    });

    expect(trackMock).toHaveBeenCalledWith("coach_suggested_prompt_clicked", {
      puzzleId: "test-puzzle",
      promptKey: "suggested_0",
      source: "onboarding_result",
    });
    expect(trackMock).toHaveBeenCalledWith("coach_first_prompt_used", {
      puzzleId: "test-puzzle",
      promptKey: "suggested_0",
      source: "onboarding_result",
    });
  });
});

describe("CoachDialogue — error-code routing", () => {
  async function triggerSend() {
    const input = screen.getByPlaceholderText(/向 AI 提问/i);
    fireEvent.change(input, { target: { value: "why?" } });
    const btn = screen.getByText(/发送/i);
    fireEvent.click(btn);
  }

  function renderWithLocale() {
    return render(
      <LocaleProvider initialLocale="zh">
        <CoachDialogue puzzleId="err-puzzle" userMove={{ x: 3, y: 3 }} />
      </LocaleProvider>,
    );
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    trackMock.mockReset();
    sessionStorage.clear();
  });

  it("renders the upgrade CTA and fires coach_limit_hit for device_limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          json: () =>
            Promise.resolve({ code: "device_limit", error: "Free account device limit reached." }),
        } as Response),
      ),
    );

    renderWithLocale();
    await triggerSend();

    await waitFor(() => {
      expect(screen.getByText(/同一时间只支持 1 台设备/)).toBeInTheDocument();
    });

    const link = screen.getByRole("link", { name: /升级到 Pro/ });
    expect(link.getAttribute("href")).toBe("/zh/pricing");
    expect(trackMock).toHaveBeenCalledWith("coach_limit_hit", { code: "device_limit" });
  });

  it("renders the sign-in CTA and fires coach_limit_hit for login_required", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ code: "login_required", error: "Sign in required." }),
        } as Response),
      ),
    );

    renderWithLocale();
    await triggerSend();

    await waitFor(() => {
      expect(trackMock).toHaveBeenCalledWith("coach_limit_hit", { code: "login_required" });
    });

    const link = screen.getByRole("link", { name: /登录后使用 AI 教练/ });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("/zh/login")).toBe(true);
    expect(href).toContain(encodeURIComponent("/zh/result"));
  });

  it("renders the daily-limit CTA for daily_limit_reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          json: () =>
            Promise.resolve({
              code: "daily_limit_reached",
              error: "Daily AI coach limit reached.",
            }),
        } as Response),
      ),
    );

    renderWithLocale();
    await triggerSend();

    await waitFor(() => {
      expect(screen.getByText(/今天的 AI 教练额度已经用完/)).toBeInTheDocument();
    });

    const link = screen.getByRole("link", { name: /升级到 Pro/ });
    expect(link.getAttribute("href")).toBe("/zh/pricing");
    expect(trackMock).toHaveBeenCalledWith("coach_limit_hit", { code: "daily_limit_reached" });
  });

  it("renders a generic warning without firing coach_limit_hit for non-limit errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "boom" }),
        } as Response),
      ),
    );

    renderWithLocale();
    await triggerSend();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("boom");
    });

    expect(trackMock).not.toHaveBeenCalledWith("coach_limit_hit", expect.anything());
  });

  it("renders the monthly-limit CTA for monthly_limit_reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          json: () =>
            Promise.resolve({
              code: "monthly_limit_reached",
              error: "Monthly AI coach limit reached.",
            }),
        } as Response),
      ),
    );

    renderWithLocale();
    await triggerSend();

    await waitFor(() => {
      expect(screen.getByText(/本月的 AI 教练额度已经用完/)).toBeInTheDocument();
    });

    expect(trackMock).toHaveBeenCalledWith("coach_limit_hit", { code: "monthly_limit_reached" });
  });

  it("shows retry button on generic error and re-sends on click", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: "Temporary failure" }),
          } as Response);
        }
        // Second call (retry) succeeds
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta: "Recovered" })}\n\n`),
            );
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ done: true, usage: {} })}\n\n`),
            );
            controller.close();
          },
        });
        return Promise.resolve({ ok: true, status: 200, body: stream } as Response);
      }),
    );

    renderWithLocale();
    await triggerSend();

    await waitFor(() => {
      expect(screen.getByText("Temporary failure")).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole("button", { name: /重试/ });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText("Recovered")).toBeInTheDocument();
    });

    expect(callCount).toBe(2);
  });

  it("shows empty reply error when stream finishes with no content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ done: true, usage: {} })}\n\n`),
            );
            controller.close();
          },
        });
        return Promise.resolve({ ok: true, status: 200, body: stream } as Response);
      }),
    );

    renderWithLocale();
    await triggerSend();

    await waitFor(() => {
      expect(screen.getByText(/空回复/)).toBeInTheDocument();
    });
  });

  it("handles SSE timeout error event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "timeout" })}\n\n`));
            controller.close();
          },
        });
        return Promise.resolve({ ok: true, status: 200, body: stream } as Response);
      }),
    );

    renderWithLocale();
    await triggerSend();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/响应超时/);
    });
  });
});
