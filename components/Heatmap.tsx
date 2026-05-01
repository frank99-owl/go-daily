"use client";

import { useMemo } from "react";

import { useLocale } from "@/lib/i18n/i18n";
import type { AttemptRecord, Locale } from "@/types";

// Number of calendar weeks to show. 26 ≈ last 6 months, which fits mobile nicely
// while still carrying enough history to tell a story once the user has streaks.
const WEEKS = 26;

type DayCell = {
  date: Date;
  key: string; // YYYY-MM-DD
  inFuture: boolean;
  count: number;
  correct: number;
};

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function intlTag(l: Locale): string {
  return l === "zh" ? "zh-CN" : l === "ja" ? "ja-JP" : l === "ko" ? "ko-KR" : "en-US";
}

function bucketFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

const BUCKET_CLASS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-white/5 border border-white/10",
  1: "bg-[color:var(--color-accent)]/20",
  2: "bg-[color:var(--color-accent)]/40",
  3: "bg-[color:var(--color-accent)]/65",
  4: "bg-[var(--color-accent)]",
};

export function Heatmap({ attempts }: { attempts: AttemptRecord[] }) {
  const { t, locale } = useLocale();

  const countsByDate = useMemo(() => {
    const m = new Map<string, { total: number; correct: number }>();
    for (const a of attempts) {
      const entry = m.get(a.date) ?? { total: 0, correct: 0 };
      entry.total += 1;
      if (a.correct) entry.correct += 1;
      m.set(a.date, entry);
    }
    return m;
  }, [attempts]);

  const { weeks, weekdayNames, monthMarkers } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDow = today.getDay(); // 0=Sun..6=Sat
    const daysToSat = 6 - endDow;
    const gridEnd = new Date(today);
    gridEnd.setDate(today.getDate() + daysToSat);

    const totalCells = WEEKS * 7;
    const gridStart = new Date(gridEnd);
    gridStart.setDate(gridEnd.getDate() - (totalCells - 1));

    const days: DayCell[] = [];
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const key = ymdLocal(d);
      const entry = countsByDate.get(key);
      days.push({
        date: d,
        key,
        inFuture: d > today,
        count: entry?.total ?? 0,
        correct: entry?.correct ?? 0,
      });
    }

    const cols: DayCell[][] = [];
    for (let w = 0; w < WEEKS; w++) {
      cols.push(days.slice(w * 7, (w + 1) * 7));
    }

    // Weekday labels — we show Mon / Wed / Fri (rows 1/3/5) for a light look.
    const weekdayFmt = new Intl.DateTimeFormat(intlTag(locale), {
      weekday: "short",
    });
    const refSun = new Date(2025, 0, 5); // known Sunday
    const weekdayNames = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(refSun);
      d.setDate(refSun.getDate() + i);
      return weekdayFmt.format(d);
    });

    // Month markers — drop a label exactly on the column whose Sunday begins
    // a new month (GitHub-style: the label sits above the first week of each
    // month, not every column).
    const monthFmt = new Intl.DateTimeFormat(intlTag(locale), { month: "short" });
    const markers: Array<{ week: number; label: string }> = [];
    let prevMonth = -1;
    for (let w = 0; w < WEEKS; w++) {
      const firstOfCol = cols[w][0].date;
      const m = firstOfCol.getMonth();
      if (m !== prevMonth) {
        markers.push({ week: w, label: monthFmt.format(firstOfCol) });
        prevMonth = m;
      }
    }

    return { weeks: cols, weekdayNames, monthMarkers: markers };
  }, [countsByDate, locale]);

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(intlTag(locale), {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    [locale],
  );

  const tooltipFor = (day: DayCell): string => {
    const dateText = dateFmt.format(day.date);
    if (day.inFuture) return dateText;
    if (day.count === 0) return `${dateText} · ${t.stats.heatmapNoActivity}`;
    const base =
      day.count === 1
        ? t.stats.heatmapOneAttempt
        : t.stats.heatmapManyAttempts.replace("{{count}}", String(day.count));
    const correctSuffix =
      day.correct > 0
        ? t.stats.heatmapCorrectSuffix.replace("{{correct}}", String(day.correct))
        : "";
    return `${dateText} · ${base}${correctSuffix}`;
  };

  // Grid layout: one "auto" column for weekday label + WEEKS equal-width
  // columns for the weeks. The cells themselves are `aspect-square`, so the
  // entire heatmap grows/shrinks to fill its container width — just like
  // LeetCode's. Rows are shaped implicitly by the cells.
  const gridTemplateColumns = `auto repeat(${WEEKS}, minmax(0, 1fr))`;

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
      <h2 className="text-sm font-medium text-white mb-3">{t.stats.heatmapTitle}</h2>

      <div
        role="grid"
        aria-label={t.stats.heatmapTitle}
        className="grid gap-[3px] w-full"
        style={{ gridTemplateColumns }}
      >
        {/* Row 1: top-left gutter + month labels. Each label is placed at the
            exact grid column matching its starting week. We let it overflow
            its single-column track horizontally (min-width:0 on the track via
            minmax(0, 1fr) keeps it from pushing the grid wider). */}
        <div aria-hidden style={{ gridRow: 1, gridColumn: 1 }} />
        {monthMarkers.map((m) => (
          <div
            key={`m-${m.week}`}
            style={{ gridRow: 1, gridColumn: m.week + 2 }}
            className="text-xs leading-none text-white/40 whitespace-nowrap"
          >
            {m.label}
          </div>
        ))}

        {/* Rows 2..8: weekday labels in col 1, then cells in cols 2..WEEKS+1. */}
        {weekdayNames.map((name, dow) => {
          const show = dow === 1 || dow === 3 || dow === 5; // Mon / Wed / Fri
          return (
            <div
              key={`w-${dow}`}
              style={{ gridRow: dow + 2, gridColumn: 1 }}
              className="text-xs leading-none text-white/40 pr-2 self-center"
            >
              {show ? name : ""}
            </div>
          );
        })}

        {weeks.flatMap((week, wi) =>
          week.map((day, dow) => {
            const common = {
              gridRow: dow + 2,
              gridColumn: wi + 2,
            };
            if (day.inFuture) {
              // Reserve the slot so column alignment stays intact, but render nothing.
              return <div key={day.key} style={common} className="aspect-square" aria-hidden />;
            }
            const b = bucketFor(day.count);
            return (
              <div
                key={day.key}
                role="gridcell"
                aria-label={tooltipFor(day)}
                title={tooltipFor(day)}
                style={common}
                className={`aspect-square rounded-[2px] ${BUCKET_CLASS[b]}`}
              />
            );
          }),
        )}
      </div>

      {/* Legend — anchored to the right like GitHub's. */}
      <div className="flex items-center justify-end gap-1.5 text-xs text-white/40 mt-3">
        <span>{t.stats.heatmapLegendLess}</span>
        {([0, 1, 2, 3, 4] as const).map((b) => (
          <div key={b} className={`h-3 w-3 rounded-[2px] ${BUCKET_CLASS[b]}`} />
        ))}
        <span>{t.stats.heatmapLegendMore}</span>
      </div>
    </section>
  );
}
