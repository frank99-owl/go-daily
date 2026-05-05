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

describe("CoachDialogue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

    expect(trackMock).not.toHaveBeenCalled();
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

    const retryBtn = screen.getByRole("button", { name: /再做一次/ });
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
      expect(screen.getByText(/Empty reply from the model/)).toBeInTheDocument();
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
      expect(screen.getByRole("alert")).toHaveTextContent(/Coach is taking too long/);
    });
  });
});
