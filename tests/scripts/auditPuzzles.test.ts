import { describe, expect, it } from "vitest";

import { auditPuzzles, generateMarkdownReport } from "../../scripts/auditPuzzles";
import type { Puzzle, PuzzleSummary } from "../../types";

describe("auditPuzzles", () => {
  const mockPuzzles: Puzzle[] = [
    {
      id: "cld-001",
      date: "2026-04-21",
      boardSize: 9,
      stones: [{ x: 0, y: 0, color: "black" }],
      toPlay: "black",
      correct: [{ x: 1, y: 1 }],
      tag: "life-death",
      difficulty: 1,
      prompt: {
        zh: "黑先活",
        en: "Black to play and live",
        ja: "黒先活",
        ko: "흑선활",
      },
      solutionNote: {
        zh: "黑先抢到角上的急所，因为这样可以先压缩白的眼位，再补出第二只眼。",
        en: "Black takes the corner vital point first because it removes White's eye space and then secures the second eye.",
        ja: "黒は隅の急所を先に取ることで白の眼形を縮め、その後で二眼を確保できます。",
        ko: "흑은 귀의 급소를 먼저 차지해야 백의 눈 모양을 줄이고 이후 두 눈을 확보할 수 있습니다.",
      },
      solutionSequence: [
        { x: 1, y: 1, color: "black" },
        { x: 1, y: 2, color: "white" },
      ],
      isCurated: true,
      source: "Editorial",
    },
    {
      id: "cho-e-001",
      date: "2026-04-22",
      boardSize: 19,
      stones: [{ x: 3, y: 3, color: "white" }],
      toPlay: "black",
      correct: [{ x: 2, y: 2 }],
      tag: "tesuji",
      difficulty: 3,
      prompt: {
        zh: "黑先，找到正确的急所",
        en: "Black to play — find the vital point",
        ja: "黒先、急所を見つけてください",
        ko: "흑선 — 급소를 찾으세요",
      },
      solutionNote: {
        zh: "经典死活题。点击「查看正解」可以看到标记出的急所位置。",
        en: "Classical life-and-death problem. Tap 'View solution' to see the vital point highlighted on the board.",
        ja: "古典的な詰碁です。「正解を見る」を押すと盤上に急所が示されます。",
        ko: "고전 사활 문제. '정답 보기'를 누르면 반 위에 급소가 표시됩니다.",
      },
      isCurated: false,
      source: "Classical Go",
    },
    {
      id: "lib-0999",
      date: "2026-04-24",
      boardSize: 19,
      stones: [],
      toPlay: "black",
      correct: [],
      tag: "life-death",
      difficulty: 3,
      prompt: {
        zh: "黑先，找到正确的急所",
        en: "Black to play — find the vital point",
        ja: "黒先、急所を見つけてください",
        ko: "",
      },
      solutionNote: {
        zh: "点击「查看正解」查看盘面上的关键点。",
        en: "Tap 'View solution' to reveal the key point on the board.",
        ja: "「正解を見る」で急所が盤上に表示されます。",
        ko: "'정답 보기'를 누르면 핵심 점이 표시됩니다.",
      },
      isCurated: false,
      source: "go-daily",
    } as Puzzle,
  ];

  const summaryIndex: PuzzleSummary[] = [
    {
      id: "cld-001",
      difficulty: 1,
      source: "Editorial",
      date: "2026-04-21",
      prompt: {
        zh: "黑先活",
        en: "Black to play and live",
        ja: "黒先活",
        ko: "흑선활",
      },
      isCurated: true,
      boardSize: 9,
      tag: "life-death",
    },
    {
      id: "cho-e-001",
      difficulty: 3,
      source: "Classical Go",
      date: "2026-04-22",
      prompt: {
        zh: "黑先，找到正确的急所",
        en: "Black to play — find the vital point",
        ja: "黒先、急所を見つけてください",
        ko: "흑선 — 급소를 찾으세요",
      },
      isCurated: false,
      boardSize: 19,
      tag: "tesuji",
    },
    {
      id: "stale-001",
      difficulty: 2,
      source: "stale",
      date: "2026-04-20",
      prompt: {
        zh: "过期",
        en: "stale",
        ja: "古い",
        ko: "오래됨",
      },
      isCurated: false,
      boardSize: 19,
      tag: "life-death",
    },
  ];

  it("captures index consistency, runway, and coach eligibility", () => {
    const result = auditPuzzles(mockPuzzles, {
      summaryIndex,
      today: "2026-04-21",
    });

    expect(result.total).toBe(3);
    expect(result.indexConsistency.staleIndexIds).toEqual(["stale-001"]);
    expect(result.indexConsistency.missingSummaryIds).toEqual(["lib-0999"]);
    expect(result.curatedRunwayDays).toBe(1);

    expect(result.coachEligibleCandidates).toEqual([
      expect.objectContaining({ id: "cld-001", isCurated: true, reason: "eligible" }),
    ]);
    expect(result.coachEligibilityReasons).toMatchObject({
      eligible: 1,
      "generic-solution-note": 1,
      "missing-correct-answer": 1,
    });
  });

  it("computes prompt and solution-note quality summaries", () => {
    const result = auditPuzzles(mockPuzzles, {
      summaryIndex,
      today: "2026-04-21",
    });

    expect(result.promptTemplateStats.uniqueCountsByLocale.zh).toBe(2);
    expect(result.promptTemplateStats.topTemplatesByLocale.zh[0]).toEqual({
      template: "黑先，找到正确的急所",
      count: 2,
    });

    expect(result.solutionNoteQualityTiers).toMatchObject({
      "coach-ready": 1,
      "generic-placeholder": 1,
      thin: 1,
    });
    expect(result.imbalanceWarnings.length).toBeGreaterThan(0);
  });

  it("tracks anomaly counts and renders the markdown report", () => {
    const result = auditPuzzles(mockPuzzles, {
      summaryIndex,
      today: "2026-04-21",
    });

    expect(result.anomalies.missingFields).toContainEqual({
      id: "lib-0999",
      field: "prompt.ko",
    });
    expect(result.anomalies.missingFields).toContainEqual({
      id: "lib-0999",
      field: "correct",
    });

    const markdown = generateMarkdownReport(result);
    expect(markdown).toContain("Total Puzzles:** 3");
    expect(markdown).toContain("Curated Runway Days (from audit date):** 1");
    expect(markdown).toContain("Stale Index IDs:** 1");
    expect(markdown).toContain("Eligible Candidates:** 1");
  });
});
