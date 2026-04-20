import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { CoachDialogue } from "@/components/CoachDialogue";
import { LocaleProvider } from "@/lib/i18n";

describe("CoachDialogue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  function renderWithLocale() {
    return render(
      <LocaleProvider initialLocale="zh">
        <CoachDialogue puzzleId="test-puzzle" userMove={{ x: 3, y: 3 }} isCorrect={true} />
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

    // Resolve the fetch
    resolveResponse!({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ reply: "这是回复" }),
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
