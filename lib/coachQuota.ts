export interface DateWindow {
  startDay: string;
  endDay: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDayKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function partsInTimeZone(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const read = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
  };
}

function parseDayKey(dayKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dayKey.split("-").map((part) => Number.parseInt(part, 10));
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftMonth(year: number, month: number, offset: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

function previousDay(dayKey: string): string {
  const { year, month, day } = parseDayKey(dayKey);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return toDayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function formatDateInTimeZone(date: Date, timeZone: string): string {
  const { year, month, day } = partsInTimeZone(date, timeZone);
  return toDayKey(year, month, day);
}

export function getNaturalMonthWindow({
  now,
  timeZone,
}: {
  now: Date;
  timeZone: string;
}): DateWindow {
  const { year, month } = partsInTimeZone(now, timeZone);
  return {
    startDay: toDayKey(year, month, 1),
    endDay: toDayKey(year, month, daysInMonth(year, month)),
  };
}

export function getAnchorDayFromFirstPaidAt(
  firstPaidAt: string | null | undefined,
  timeZone: string,
): number | null {
  if (!firstPaidAt) return null;
  const parsed = new Date(firstPaidAt);
  if (Number.isNaN(parsed.getTime())) return null;
  return partsInTimeZone(parsed, timeZone).day;
}

export function getBillingAnchoredMonthWindow({
  now,
  timeZone,
  anchorDay,
}: {
  now: Date;
  timeZone: string;
  anchorDay: number;
}): DateWindow {
  const { year, month, day } = partsInTimeZone(now, timeZone);
  const currentStartDay = Math.min(anchorDay, daysInMonth(year, month));

  if (day >= currentStartDay) {
    const next = shiftMonth(year, month, 1);
    const nextStart = toDayKey(
      next.year,
      next.month,
      Math.min(anchorDay, daysInMonth(next.year, next.month)),
    );
    return {
      startDay: toDayKey(year, month, currentStartDay),
      endDay: previousDay(nextStart),
    };
  }

  const prev = shiftMonth(year, month, -1);
  const currentStart = toDayKey(year, month, currentStartDay);
  return {
    startDay: toDayKey(
      prev.year,
      prev.month,
      Math.min(anchorDay, daysInMonth(prev.year, prev.month)),
    ),
    endDay: previousDay(currentStart),
  };
}
