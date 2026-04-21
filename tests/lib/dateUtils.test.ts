import { describe, expect, it } from "vitest";

import { todayLocalKey } from "@/lib/dateUtils";

describe("dateUtils", () => {
  describe("todayLocalKey", () => {
    it("formats a Date object into YYYY-MM-DD", () => {
      const d = new Date("2026-04-21T15:00:00Z");
      // Because `getFullYear` uses local time, we have to be careful with timezones in tests.
      // We can mock it or check pattern.
      const key = todayLocalKey(d);
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      const parts = key.split("-");
      expect(parts[0]).toBe(String(d.getFullYear()));
      expect(parts[1]).toBe(String(d.getMonth() + 1).padStart(2, "0"));
      expect(parts[2]).toBe(String(d.getDate()).padStart(2, "0"));
    });

    it("defaults to current date if no argument provided", () => {
      const key = todayLocalKey();
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
