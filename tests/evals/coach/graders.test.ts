// @vitest-environment node
/**
 * Unit tests for the eval harness itself.
 *
 * An eval suite that silently stops detecting anything is worse than no eval
 * suite: it reports green while the behavior it claims to protect drifts. The
 * deterministic graders are pure functions, so they can be pinned here at no
 * cost — and they run in the normal `npm run test` pass, without a key.
 *
 * The judge graders are not tested here. They are model calls by definition;
 * what is tested is that they are wired correctly and pass the injected
 * judge's verdict through.
 */
import { describe, expect, it } from "vitest";

import { CASES, CASES_BY_ID } from "@/evals/coach/cases";
import { CORNER_LIFE_DEATH, FIXTURES } from "@/evals/coach/fixtures";
import {
  ALL_GRADERS,
  GRADERS_BY_ID,
  type GradeContext,
  type JudgeFn,
  deflectsOffTopic,
  isConcise,
  noPromptLeak,
  nonEmpty,
  repliesInLocale,
  usesUiCoordinateFormat,
} from "@/evals/coach/graders";
import { JUDGE_CALIBRATION } from "@/evals/coach/judgeCalibration";
import { getPersona } from "@/lib/coach/personas";
import { guardUserMessage } from "@/lib/promptGuard";
import type { Locale } from "@/types";

function context(reply: string, locale: Locale = "en"): GradeContext {
  return {
    reply,
    locale,
    puzzle: CORNER_LIFE_DEATH,
    persona: getPersona("still-water"),
    userMessages: ["What about this shape?"],
  };
}

const neverCalled: JudgeFn = async () => {
  throw new Error("deterministic grader must not call the judge");
};

describe("non-empty", () => {
  it("fails a blank reply", async () => {
    expect((await nonEmpty.grade(context("   \n "), neverCalled)).passed).toBe(false);
  });

  it("passes a real reply", async () => {
    expect((await nonEmpty.grade(context("Take the vital point."), neverCalled)).passed).toBe(true);
  });
});

describe("replies-in-locale", () => {
  it("accepts each locale's own script", async () => {
    const samples: Record<Locale, string> = {
      zh: "先占急所，白就没有做眼的空间了。",
      en: "Take the vital point first and White has no eye space.",
      ja: "まず急所を占めれば、白に眼はできません。",
      ko: "먼저 급소를 차지하면 백은 눈을 낼 수 없습니다.",
    };
    for (const [locale, reply] of Object.entries(samples) as [Locale, string][]) {
      const result = await repliesInLocale.grade(context(reply, locale), neverCalled);
      expect(result.passed, `${locale} sample should pass`).toBe(true);
    }
  });

  it("fails an English reply served to a Chinese student", async () => {
    const result = await repliesInLocale.grade(context("Take the vital point.", "zh"), neverCalled);
    expect(result.passed).toBe(false);
  });

  it("fails a Japanese reply served to a Chinese student", async () => {
    // The check that matters most: Han alone cannot separate zh from ja, so
    // the zh rule additionally requires that no kana appear.
    const result = await repliesInLocale.grade(context("急所を占めます。", "zh"), neverCalled);
    expect(result.passed).toBe(false);
  });

  it("fails a Korean reply served to a Japanese student", async () => {
    const result = await repliesInLocale.grade(context("급소를 차지하세요.", "ja"), neverCalled);
    expect(result.passed).toBe(false);
  });
});

describe("no-prompt-leak", () => {
  it("catches an echoed section delimiter", async () => {
    const result = await noPromptLeak.grade(
      context("Sure: --- POSITION --- Board size: 19x19."),
      neverCalled,
    );
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("--- POSITION ---");
  });

  it("catches a leaked solution framing", async () => {
    const result = await noPromptLeak.grade(
      context("My Accepted correct point is (18,2)."),
      neverCalled,
    );
    expect(result.passed).toBe(false);
  });

  it("passes an ordinary reply", async () => {
    const result = await noPromptLeak.grade(
      context("The corner needs the 2-2 point to live."),
      neverCalled,
    );
    expect(result.passed).toBe(true);
  });
});

describe("ui-coordinate-format", () => {
  it("fails letter-number Go notation", async () => {
    const result = await usesUiCoordinateFormat.grade(context("Play at D4 instead."), neverCalled);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("D4");
  });

  it("passes the UI's (x,y) form", async () => {
    const result = await usesUiCoordinateFormat.grade(context("Play at (18,2)."), neverCalled);
    expect(result.passed).toBe(true);
  });

  it("does not trip on the skipped letter I", async () => {
    // Standard Go notation omits "I"; "I5" in prose must not read as a point.
    const result = await usesUiCoordinateFormat.grade(
      context("I5 stones were captured."),
      neverCalled,
    );
    expect(result.passed).toBe(true);
  });
});

describe("concise", () => {
  it("fails a runaway lecture", async () => {
    const wall = Array.from({ length: 9 }, (_, i) => `Paragraph ${i}.`).join("\n\n");
    expect((await isConcise.grade(context(wall), neverCalled)).passed).toBe(false);
  });

  it("passes a normal two-paragraph answer", async () => {
    const reply = "The corner is short of eye space.\n\nTake (18,2) and it lives.";
    expect((await isConcise.grade(context(reply), neverCalled)).passed).toBe(true);
  });
});

describe("judge graders", () => {
  it("pass the injected judge's verdict through", async () => {
    const judge: JudgeFn = async () => ({ verdict: false, rationale: "answered the question" });
    const result = await deflectsOffTopic.grade(context("It's sunny today."), judge);
    expect(result.kind).toBe("judge");
    expect(result.passed).toBe(false);
    expect(result.detail).toBe("answered the question");
  });
});

describe("eval set wiring", () => {
  it("names only graders that exist", () => {
    for (const evalCase of CASES) {
      for (const graderId of evalCase.graders) {
        expect(GRADERS_BY_ID.has(graderId), `${evalCase.id} → ${graderId}`).toBe(true);
      }
    }
  });

  it("gives every case something to assert", () => {
    for (const evalCase of CASES) {
      const asserts = evalCase.graders.length > 0 || evalCase.expectGuardRejection === true;
      expect(asserts, `${evalCase.id} asserts nothing`).toBe(true);
    }
  });

  it("uses unique case ids", () => {
    expect(CASES_BY_ID.size).toBe(CASES.length);
  });

  it("keeps every grader reachable from at least one case", () => {
    const used = new Set(CASES.flatMap((evalCase) => evalCase.graders));
    const orphans = ALL_GRADERS.filter((grader) => !used.has(grader.id)).map((g) => g.id);
    expect(orphans, "graders defined but never exercised").toEqual([]);
  });

  it("agrees with promptGuard about which cases it should reject", () => {
    // This is the assertion that keeps the guard and the eval set honest: if
    // someone loosens a promptGuard pattern, the case that depended on it
    // fails here rather than silently passing a live run.
    for (const evalCase of CASES) {
      const last = evalCase.userMessages[evalCase.userMessages.length - 1];
      const guard = guardUserMessage(last);
      expect(guard.ok, `${evalCase.id}: guard verdict`).toBe(!evalCase.expectGuardRejection);
    }
  });
});

describe("judge calibration set wiring", () => {
  // The calibration run itself needs a key (`eval:coach -- --live --calibrate`).
  // What can be checked for free is that the set is able to catch a bad judge.
  const judges = ALL_GRADERS.filter((grader) => grader.kind === "judge");

  it("gives every judge grader at least one PASS and one FAIL example", () => {
    // With only PASS examples, a judge that passes everything calibrates as
    // perfect; with only FAIL examples, so does one that fails everything.
    for (const judge of judges) {
      const labels = new Set(
        JUDGE_CALIBRATION.filter((example) => example.graderId === judge.id).map(
          (example) => example.expected,
        ),
      );
      expect([...labels].sort(), judge.id).toEqual(["fail", "pass"]);
    }
  });

  it("only calibrates judge graders, on fixtures that exist", () => {
    for (const example of JUDGE_CALIBRATION) {
      expect(GRADERS_BY_ID.get(example.graderId)?.kind, example.id).toBe("judge");
      expect(example.fixtureId in FIXTURES, example.id).toBe(true);
      expect(example.because.length, `${example.id} explains its label`).toBeGreaterThan(20);
    }
  });

  it("uses unique example ids", () => {
    const ids = JUDGE_CALIBRATION.map((example) => example.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
