import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Heatmap } from "@/components/Heatmap";
import { LocaleProvider } from "@/lib/i18n";
import type { AttemptRecord, Locale } from "@/types";

const attempts: AttemptRecord[] = [
  {
    puzzleId: "puzzle-1",
    date: "2026-04-24",
    userMove: { x: 4, y: 4 },
    correct: true,
    solvedAtMs: Date.UTC(2026, 3, 24, 1),
  },
  {
    puzzleId: "puzzle-2",
    date: "2026-04-24",
    userMove: { x: 3, y: 3 },
    correct: false,
    solvedAtMs: Date.UTC(2026, 3, 24, 2),
  },
  {
    puzzleId: "puzzle-3",
    date: "2026-04-23",
    userMove: { x: 2, y: 2 },
    correct: false,
    solvedAtMs: Date.UTC(2026, 3, 23, 2),
  },
];

function renderHeatmap(locale: Locale = "en") {
  const result = render(
    <LocaleProvider initialLocale={locale}>
      <Heatmap attempts={attempts} />
    </LocaleProvider>,
  );
  return result.container;
}

describe("Heatmap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 24, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aggregates same-day attempts into one tooltip", () => {
    const container = renderHeatmap("en");

    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Less")).toBeInTheDocument();
    expect(screen.getByText("More")).toBeInTheDocument();

    const activeCell = container.querySelector('[title*="2 attempts"]');
    expect(activeCell).not.toBeNull();
    expect(activeCell?.getAttribute("title")).toContain("(1 correct)");
  });

  it("uses localized labels and tooltip copy", () => {
    const container = renderHeatmap("zh");

    expect(screen.getByText("做题热力图")).toBeInTheDocument();
    expect(screen.getByText("少")).toBeInTheDocument();
    expect(screen.getByText("多")).toBeInTheDocument();

    const activeCell = container.querySelector('[title*="2 次尝试"]');
    expect(activeCell).not.toBeNull();
    expect(activeCell?.getAttribute("title")).toContain("1 正确");
  });

  it("does not render future dates as activity cells", () => {
    const container = renderHeatmap("en");

    expect(container.querySelector('[title*="Apr 25, 2026"]')).toBeNull();
    expect(container.querySelector('[title*="Apr 24, 2026"]')).not.toBeNull();
  });
});
