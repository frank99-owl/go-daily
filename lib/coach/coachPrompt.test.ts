// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Locale, Puzzle, Stone } from "@/types";

import { buildSystemPrompt } from "./coachPrompt";
import { DEFAULT_PERSONA } from "./personas";

// Minimal 19×19 puzzle with a local cluster — crops to a small window.
function make19Puzzle(overrides: Partial<Puzzle> = {}): Puzzle {
  return {
    id: "t19",
    date: "2026-04-25",
    boardSize: 19,
    toPlay: "black",
    stones: [
      { x: 16, y: 2, color: "white" },
      { x: 17, y: 2, color: "black" },
      { x: 17, y: 3, color: "white" },
    ],
    correct: [{ x: 18, y: 2 }],
    tag: "life-death",
    difficulty: 3,
    prompt: {
      zh: "黑先活",
      en: "Black to live",
      ja: "黒先活",
      ko: "흑선활",
    },
    solutionNote: {
      zh: "占角上急所。",
      en: "Take the vital point in the corner.",
      ja: "隅の急所を先に占めます。",
      ko: "귀의 급소를 먼저 차지합니다.",
    },
    ...overrides,
  };
}

// 9×9 puzzle — full window, not cropped.
function make9Puzzle(overrides: Partial<Puzzle> = {}): Puzzle {
  return {
    id: "t9",
    date: "2026-04-25",
    boardSize: 9,
    toPlay: "black",
    stones: [{ x: 4, y: 4, color: "white" }],
    correct: [{ x: 3, y: 3 }],
    tag: "tesuji",
    difficulty: 2,
    prompt: { zh: "", en: "Capture it.", ja: "", ko: "" },
    solutionNote: { zh: "", en: "Play the clamp.", ja: "", ko: "" },
    ...overrides,
  };
}

describe("buildSystemPrompt — always included", () => {
  it("includes the coach role framing and ground-truth constraints", () => {
    const prompt = buildSystemPrompt(make19Puzzle(), "en", { x: 18, y: 2 }, true, DEFAULT_PERSONA);
    expect(prompt).toContain("AI coach for go-daily");
    expect(prompt).toContain("ground truth");
  });

  it("declares the correct 'CORRECT' / 'INCORRECT' verdict on the student's move", () => {
    const puzzle = make19Puzzle();
    const correctPrompt = buildSystemPrompt(puzzle, "en", { x: 18, y: 2 }, true, DEFAULT_PERSONA);
    const wrongPrompt = buildSystemPrompt(puzzle, "en", { x: 0, y: 0 }, false, DEFAULT_PERSONA);
    expect(correctPrompt).toMatch(/— CORRECT\./);
    expect(wrongPrompt).toMatch(/— INCORRECT\./);
  });

  it("includes the localized solution note as ground truth", () => {
    const prompt = buildSystemPrompt(make19Puzzle(), "zh", { x: 18, y: 2 }, true, DEFAULT_PERSONA);
    expect(prompt).toContain("占角上急所。");
  });

  it("mentions tag and difficulty", () => {
    const prompt = buildSystemPrompt(make19Puzzle(), "en", { x: 18, y: 2 }, true, DEFAULT_PERSONA);
    expect(prompt).toContain("Tag: life-death");
    expect(prompt).toContain("Difficulty: 3/5");
  });
});

describe("buildSystemPrompt — 19×19 full board", () => {
  it("uses full-board framing, not a cropped-window banner", () => {
    const prompt = buildSystemPrompt(make19Puzzle(), "en", { x: 18, y: 2 }, true, DEFAULT_PERSONA);
    expect(prompt).toContain("Board size: 19x19");
    expect(prompt).not.toMatch(/cropped \d+x\d+ local board window/);
    expect(prompt).not.toContain("Underlying board size:");
  });

  it("uses absolute coordinates (not window-local remapped)", () => {
    const prompt = buildSystemPrompt(make19Puzzle(), "en", { x: 18, y: 2 }, true, DEFAULT_PERSONA);
    // Stone at absolute (16,2) should appear as-is.
    expect(prompt).toContain("(16,2)");
  });
});

describe("buildSystemPrompt — 9×9 full window", () => {
  it("uses full-board framing, not a cropped-window banner", () => {
    const prompt = buildSystemPrompt(make9Puzzle(), "en", { x: 3, y: 3 }, true, DEFAULT_PERSONA);
    expect(prompt).toContain("Board size: 9x9");
    // The "cropped NxN local board window" banner is only emitted for 19×19;
    // the word "cropped" also appears in the always-on preamble, so match the
    // specific banner shape instead.
    expect(prompt).not.toMatch(/cropped \d+x\d+ local board window/);
    expect(prompt).not.toContain("Underlying board size:");
  });

  it("uses absolute coordinates for 9×9 (no remapping)", () => {
    const prompt = buildSystemPrompt(make9Puzzle(), "en", { x: 3, y: 3 }, true, DEFAULT_PERSONA);
    // White stone at absolute (4,4) should render as (4,4).
    expect(prompt).toContain("(4,4)");
    // Student's move at (3,3) should render as (3,3).
    expect(prompt).toContain("Move: (3,3)");
  });
});

describe("buildSystemPrompt — stones & solution listing", () => {
  it("lists black / white stones separately and shows '(none)' for empty colour", () => {
    const puzzle = make9Puzzle({
      stones: [
        { x: 1, y: 1, color: "black" },
        { x: 2, y: 2, color: "black" },
      ],
    });
    const prompt = buildSystemPrompt(puzzle, "en", { x: 3, y: 3 }, false, DEFAULT_PERSONA);
    expect(prompt).toMatch(/Black stones on board: \(1,1\), \(2,2\)\./);
    expect(prompt).toContain("White stones on board: (none).");
  });

  it("lists all accepted correct points", () => {
    const puzzle = make9Puzzle({
      correct: [
        { x: 3, y: 3 },
        { x: 5, y: 5 },
      ],
    });
    const prompt = buildSystemPrompt(puzzle, "en", { x: 0, y: 0 }, false, DEFAULT_PERSONA);
    expect(prompt).toMatch(/Accepted correct point\(s\): \(3,3\), \(5,5\)\./);
  });

  it("declares the side to play", () => {
    expect(
      buildSystemPrompt(
        make9Puzzle({ toPlay: "white" }),
        "en",
        { x: 0, y: 0 },
        false,
        DEFAULT_PERSONA,
      ),
    ).toContain("To play: white.");
  });
});

describe("buildSystemPrompt — optional blocks", () => {
  it("includes the SOLUTION SEQUENCE block when solutionSequence is present", () => {
    const sequence: Stone[] = [
      { x: 3, y: 3, color: "black" },
      { x: 2, y: 3, color: "white" },
      { x: 3, y: 4, color: "black" },
    ];
    const prompt = buildSystemPrompt(
      make9Puzzle({ solutionSequence: sequence }),
      "en",
      { x: 3, y: 3 },
      true,
      DEFAULT_PERSONA,
    );
    expect(prompt).toContain("SOLUTION SEQUENCE (ground truth)");
    expect(prompt).toContain("Step 1: black (3,3)");
    expect(prompt).toContain("Step 2: white (2,3)");
    expect(prompt).toContain("Step 3: black (3,4)");
  });

  it("omits the SOLUTION SEQUENCE block when absent", () => {
    const prompt = buildSystemPrompt(make9Puzzle(), "en", { x: 3, y: 3 }, true, DEFAULT_PERSONA);
    expect(prompt).not.toContain("SOLUTION SEQUENCE");
  });

  it("includes the WRONG BRANCHES block when present", () => {
    const prompt = buildSystemPrompt(
      make9Puzzle({
        wrongBranches: [
          {
            userWrongMove: { x: 5, y: 5 },
            refutation: [
              { x: 6, y: 5, color: "white" },
              { x: 5, y: 6, color: "white" },
            ],
            note: { zh: "错", en: "Wrong", ja: "ダメ", ko: "틀림" },
          },
        ],
      }),
      "en",
      { x: 5, y: 5 },
      false,
      DEFAULT_PERSONA,
    );
    expect(prompt).toContain("COMMON WRONG BRANCHES");
    expect(prompt).toContain("If student plays (5,5)");
    expect(prompt).toContain("white (6,5)");
  });

  it("omits the WRONG BRANCHES block when absent", () => {
    const prompt = buildSystemPrompt(make9Puzzle(), "en", { x: 3, y: 3 }, true, DEFAULT_PERSONA);
    expect(prompt).not.toContain("WRONG BRANCHES");
  });
});

describe("buildSystemPrompt — locale-specific style footer", () => {
  const localeFingerprints: Record<Locale, string> = {
    zh: "请务必用中文",
    en: "Reply in English",
    ja: "必ず日本語で答えてください",
    ko: "반드시 한국어로 답하세요",
  };

  for (const [locale, fingerprint] of Object.entries(localeFingerprints) as [Locale, string][]) {
    it(`injects the ${locale} style block`, () => {
      const prompt = buildSystemPrompt(
        make9Puzzle(),
        locale,
        { x: 3, y: 3 },
        true,
        DEFAULT_PERSONA,
      );
      expect(prompt).toContain("--- STYLE ---");
      expect(prompt).toContain(fingerprint);
    });
  }

  it("injects the locale-matched solution note (zh example)", () => {
    const zhPrompt = buildSystemPrompt(
      make19Puzzle(),
      "zh",
      { x: 18, y: 2 },
      true,
      DEFAULT_PERSONA,
    );
    const enPrompt = buildSystemPrompt(
      make19Puzzle(),
      "en",
      { x: 18, y: 2 },
      true,
      DEFAULT_PERSONA,
    );
    expect(zhPrompt).toContain("占角上急所。");
    expect(zhPrompt).not.toContain("Take the vital point in the corner.");
    expect(enPrompt).toContain("Take the vital point in the corner.");
  });
});
