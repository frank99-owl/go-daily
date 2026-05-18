import { describe, expect, it } from "vitest";

import {
  buildContentBatchPlan,
  generateContentBatchMarkdown,
} from "../../scripts/planContentBatch";
import type { Puzzle, PuzzleSummary } from "../../types";

describe("planContentBatch", () => {
  const note = {
    zh: "黑先要抢到急所，因为这一手会先压缩白的眼位，再把黑棋的形状安定下来。如果黑先去别处，白就能先手补强，之后黑最简明的活路会消失。",
    en: "Black should take the vital point first because that move shrinks White's eye space and settles Black's shape. If Black starts elsewhere, White gets the forcing move first and Black loses the clean route to life.",
    ja: "黒は急所を先に取るべきです。なぜなら、その一手で白の眼形を縮めながら黒の形も安定するからです。もし黒が別の場所から動くと、白に先手で補強されます。",
    ko: "흑은 급소를 먼저 차지해야 합니다. 그 이유는 그 한 수가 백의 눈 모양을 줄이면서 흑의 형태도 안정시키기 때문입니다. 만약 흑이 다른 곳부터 두면 백이 먼저 보강합니다.",
  };

  const prompt = {
    zh: "黑先活",
    en: "Black to play and live",
    ja: "黒先活",
    ko: "흑선활",
  };

  const puzzles: Puzzle[] = [
    {
      id: "mainline-001",
      date: "2026-04-21",
      boardSize: 19,
      stones: [{ x: 0, y: 0, color: "black" }],
      toPlay: "black",
      correct: [{ x: 1, y: 1 }],
      tag: "life-death",
      difficulty: 5,
      prompt,
      solutionNote: note,
      source: "Batch",
    },
    {
      id: "mainline-002",
      date: "2026-04-22",
      boardSize: 19,
      stones: [{ x: 3, y: 3, color: "white" }],
      toPlay: "black",
      correct: [{ x: 4, y: 4 }],
      tag: "tesuji",
      difficulty: 4,
      prompt: {
        zh: "黑先手筋",
        en: "Black to play — tesuji",
        ja: "黒先手筋",
        ko: "흑선 수법",
      },
      solutionNote: note,
      source: "Batch",
    },
    {
      id: "wrong-branch-001",
      date: "2026-04-23",
      boardSize: 19,
      stones: [{ x: 6, y: 6, color: "white" }],
      toPlay: "black",
      correct: [{ x: 7, y: 6 }],
      tag: "opening",
      difficulty: 4,
      prompt: {
        zh: "黑先布局",
        en: "Black to play — opening direction",
        ja: "黒先布石",
        ko: "흑선 포석",
      },
      solutionNote: note,
      solutionSequence: [{ x: 7, y: 6, color: "black" }],
      source: "Batch",
    },
    {
      id: "dup-a-001",
      date: "2026-04-24",
      boardSize: 19,
      stones: [{ x: 10, y: 10, color: "white" }],
      toPlay: "black",
      correct: [{ x: 11, y: 10 }],
      tag: "endgame",
      difficulty: 4,
      prompt,
      solutionNote: note,
      source: "Duplicate",
    },
    {
      id: "dup-b-001",
      date: "2026-04-25",
      boardSize: 19,
      stones: [{ x: 10, y: 10, color: "white" }],
      toPlay: "black",
      correct: [{ x: 11, y: 10 }],
      tag: "endgame",
      difficulty: 4,
      prompt,
      solutionNote: {
        zh: "黑先应先抢大官子，因为这一步既拿目数也限制白棋。如果黑先收小处，白之后会占到更大点。",
        en: "Black should take the large endgame point first because it gains points and limits White. If Black takes a smaller point first, White gets the bigger follow-up.",
        ja: "黒は大きなヨセを先に打つべきです。その一手で地を得ながら白を制限できます。小さい所から入ると白に大きな後続を取られます。",
        ko: "흑은 큰 끝내기를 먼저 차지해야 합니다. 그 수가 집을 벌면서 백을 제한하기 때문입니다. 작은 곳부터 두면 백이 더 큰 후속을 얻습니다.",
      },
      source: "Duplicate",
    },
  ];

  const summaryIndex: PuzzleSummary[] = puzzles.map((puzzle) => ({
    id: puzzle.id,
    difficulty: puzzle.difficulty,
    source: puzzle.source ?? puzzle.date,
    date: puzzle.date,
    prompt: puzzle.prompt,
    boardSize: puzzle.boardSize,
    tag: puzzle.tag,
  }));

  it("selects a bounded manual editing batch without generated solution content", () => {
    const plan = buildContentBatchPlan(puzzles, {
      targetPuzzleCount: 3,
      summaryIndex,
      today: "2026-04-21",
    });

    expect(plan.targetPuzzleCount).toBe(3);
    expect(plan.selectedPuzzleCount).toBe(3);
    expect(plan.safety).toEqual({
      generatedSolutionContent: false,
      requiresHumanReview: true,
      writesPuzzleData: false,
    });
    expect(plan.puzzleTasks[0]).toMatchObject({
      id: "wrong-branch-001",
      sourceQueue: "wrongBranchQueue",
      missingFields: ["wrongBranches"],
    });
    expect(plan.puzzleTasks.some((task) => task.id === "mainline-001")).toBe(true);
    expect(plan.puzzleTasks.every((task) => task.checklist.length > 0)).toBe(true);
    expect(plan.duplicateEditingTasks[0]).toMatchObject({
      puzzleIds: ["dup-a-001", "dup-b-001"],
      groupSize: 2,
    });
    expect(plan.introductoryTargetTasks).toHaveLength(4);
  });

  it("renders a human-readable checklist", () => {
    const plan = buildContentBatchPlan(puzzles, {
      targetPuzzleCount: 2,
      summaryIndex,
      today: "2026-04-21",
    });

    const markdown = generateContentBatchMarkdown(plan);
    expect(markdown).toContain("Content Editing Batch Plan");
    expect(markdown).toContain("Generated Solution Content:** no");
    expect(markdown).toContain("No generated solution content is included");
    expect(markdown).toContain("Puzzle Backfill Tasks");
    expect(markdown).toContain("Duplicate Governance Tasks");
    expect(markdown).toContain("Introductory Expansion Targets");
  });
});
