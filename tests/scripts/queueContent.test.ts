import { describe, expect, it } from "vitest";

import { buildContentQueue, generateContentQueueMarkdown } from "../../scripts/queueContent";
import type { Puzzle, PuzzleSummary } from "../../types";

describe("queueContent", () => {
  const explainedNote = {
    zh: "黑先要抢到左上角的急所，因为这一手会先压缩白的眼位，再把黑棋的形状安定下来。如果黑先去别处，白就能先手补强，之后黑最简明的活路会消失。",
    en: "Black should take the vital point on the top-left corner first because that move shrinks White's eye space and settles Black's shape at the same time. If Black starts elsewhere, White gets the forcing move first and Black loses the cleanest route to life.",
    ja: "黒は左上隅の急所を先に取るべきです。なぜなら、その一手で白の眼形を縮めながら黒の形も安定するからです。もし黒が別の場所から動くと、白に先手で補強され、その後の活路は一気に苦しくなります。",
    ko: "흑은 좌상귀의 급소를 먼저 차지해야 합니다. 그 이유는 그 한 수가 백의 눈 모양을 줄이면서 흑의 형태도 안정시키기 때문입니다. 만약 흑이 다른 곳부터 두면 백이 먼저 보강하고, 이후 흑의 가장 쉬운 활로가 사라집니다.",
  };

  const lifeDeathPrompt = {
    zh: "黑先活",
    en: "Black to play and live",
    ja: "黒先活",
    ko: "흑선활",
  };

  const mockPuzzles: Puzzle[] = [
    {
      id: "cho-e-001",
      date: "2026-04-21",
      boardSize: 19,
      stones: [{ x: 0, y: 0, color: "black" }],
      toPlay: "black",
      correct: [{ x: 1, y: 1 }],
      tag: "life-death",
      difficulty: 1,
      prompt: lifeDeathPrompt,
      solutionNote: explainedNote,
      solutionSequence: [
        { x: 1, y: 1, color: "black" },
        { x: 1, y: 2, color: "white" },
      ],
      wrongBranches: [
        {
          userWrongMove: { x: 2, y: 2 },
          refutation: [{ x: 1, y: 1, color: "black" }],
          note: {
            zh: "如果黑先脱先，白能先手封住眼位。",
            en: "If Black plays elsewhere, White seals the eye space first.",
            ja: "黒が別の場所に回ると、白が先に眼を封鎖します。",
            ko: "흑이 다른 곳에 두면 백이 먼저 눈자리를 막습니다.",
          },
        },
      ],
      source: "Cho",
    },
    {
      id: "mainline-001",
      date: "2026-04-23",
      boardSize: 19,
      stones: [{ x: 3, y: 3, color: "black" }],
      toPlay: "white",
      correct: [{ x: 4, y: 4 }],
      tag: "tesuji",
      difficulty: 5,
      prompt: {
        zh: "白先手筋",
        en: "White to play — tesuji",
        ja: "白先手筋",
        ko: "백선 수법",
      },
      solutionNote: explainedNote,
      source: "Library",
    },
    {
      id: "wrong-branch-001",
      date: "2026-04-24",
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
      solutionNote: explainedNote,
      solutionSequence: [{ x: 7, y: 6, color: "black" }],
      source: "Library",
    },
    {
      id: "dup-a-001",
      date: "2026-04-25",
      boardSize: 19,
      stones: [{ x: 15, y: 15, color: "white" }],
      toPlay: "black",
      correct: [{ x: 16, y: 15 }],
      tag: "life-death",
      difficulty: 4,
      prompt: lifeDeathPrompt,
      solutionNote: explainedNote,
      source: "Duplicate Source",
    },
    {
      id: "dup-b-001",
      date: "2026-04-26",
      boardSize: 19,
      stones: [{ x: 15, y: 15, color: "white" }],
      toPlay: "black",
      correct: [{ x: 16, y: 15 }],
      tag: "life-death",
      difficulty: 4,
      prompt: lifeDeathPrompt,
      solutionNote: {
        zh: "黑先必须先点在要点，因为这一步会破坏白棋眼形。如果黑从外面收气，白之后能补到关键位，黑棋就失去最直接的杀棋机会。",
        en: "Black must play the vital point first because it destroys White's eye shape. If Black starts by reducing liberties from outside, White later covers the key point and Black loses the direct kill.",
        ja: "黒はまず急所に打つ必要があります。その一手が白の眼形を崩すからです。外からダメを詰めると、白に急所を補われ、黒は最短の攻めを失います。",
        ko: "흑은 먼저 급소에 두어야 합니다. 그 수가 백의 눈 모양을 무너뜨리기 때문입니다. 바깥에서 공배부터 메우면 백이 핵심 자리를 보강해 흑의 직접적인 공격이 사라집니다.",
      },
      source: "Duplicate Source",
    },
    {
      id: "lib-0317",
      date: "2026-04-22",
      boardSize: 19,
      stones: [{ x: 10, y: 10, color: "white" }],
      toPlay: "black",
      correct: [{ x: 11, y: 10 }],
      tag: "endgame",
      difficulty: 4,
      prompt: {
        zh: "黑先官子",
        en: "Black to play — best endgame move",
        ja: "黒先ヨセ",
        ko: "흑선 끝내기",
      },
      solutionNote: {
        zh: "黑先要走中腹最大的官子，因为这一步既能拿到本地目数，也能限制白最好的后续。如果黑先收小官子，白就会抢到大点，之后这一带的交换会明显亏损。",
        en: "Black should take the largest endgame point in the center first because it gains local profit and removes White's best follow-up at the same time. If Black chooses a smaller yose move first, White takes the bigger point and the exchange swings the wrong way.",
        ja: "黒は中央の最も大きいヨセを先に打つべきです。なぜなら、その一手で地を稼ぎながら白の最大の後続も消せるからです。もし黒が小さいヨセから入ると、白に大場を取られてその後の交換が損になります。",
        ko: "흑은 중앙의 가장 큰 끝내기 자리를 먼저 차지해야 합니다. 그 이유는 그 한 수가 집을 벌면서 백의 최선 후속도 지우기 때문입니다. 만약 흑이 작은 끝내기부터 두면 백이 큰 자리를 차지하고 이후 교환이 손해로 기웁니다.",
      },
      solutionSequence: [
        { x: 11, y: 10, color: "black" },
        { x: 11, y: 11, color: "white" },
      ],
      wrongBranches: [
        {
          userWrongMove: { x: 9, y: 9 },
          refutation: [{ x: 11, y: 10, color: "black" }],
          note: {
            zh: "如果黑先收小官子，白会抢到中央大点。",
            en: "If Black takes the smaller yose first, White gets the central point.",
            ja: "黒が小さいヨセを先に打つと、白が中央の大点を取ります。",
            ko: "흑이 작은 끝내기를 먼저 두면 백이 중앙의 큰 자리를 차지합니다.",
          },
        },
      ],
      source: "Library",
    },
  ];

  const summaryIndex: PuzzleSummary[] = mockPuzzles.map((puzzle) => ({
    id: puzzle.id,
    difficulty: puzzle.difficulty,
    source: puzzle.source || puzzle.date,
    date: puzzle.date,
    prompt: puzzle.prompt,
    boardSize: puzzle.boardSize,
    tag: puzzle.tag,
  }));

  it("builds coach and runway queues with approval state", () => {
    const result = buildContentQueue(mockPuzzles, {
      approvedIds: ["cho-e-001"],
      summaryIndex,
      today: "2026-04-21",
    });

    expect(result.currentApprovedCoachCount).toBe(1);
    expect(
      result.coachReadyCandidates.find((candidate) => candidate.id === "lib-0317"),
    ).toMatchObject({
      id: "lib-0317",
      eligible: true,
      qualityTier: "coach-ready",
    });
    expect(
      result.coachReadyCandidates.find((candidate) => candidate.id === "cho-e-001"),
    ).toMatchObject({
      id: "cho-e-001",
      alreadyApproved: true,
    });
    expect(result.coachReadyCandidates.length).toBe(2);
  });

  it("builds P0-B editorial queues for mainlines, wrong branches, duplicates, and intro gaps", () => {
    const result = buildContentQueue(mockPuzzles, {
      approvedIds: ["cho-e-001"],
      summaryIndex,
      today: "2026-04-21",
    });

    expect(result.mainlineQueue.map((candidate) => candidate.id)).toContain("mainline-001");
    expect(result.mainlineQueue.map((candidate) => candidate.id)).toContain("dup-a-001");
    expect(result.mainlineQueue.map((candidate) => candidate.id)).not.toContain("dup-b-001");
    expect(result.mainlineQueue.find((candidate) => candidate.id === "dup-a-001")).toMatchObject({
      duplicateGroupSize: 2,
      representativeOfDuplicateGroup: true,
    });

    expect(result.wrongBranchQueue[0]).toMatchObject({
      id: "wrong-branch-001",
      hasSolutionSequence: true,
      hasWrongBranches: false,
    });

    expect(result.duplicateGovernanceQueue[0]).toMatchObject({
      puzzleIds: ["dup-a-001", "dup-b-001"],
      groupSize: 2,
      sameSolutionNote: false,
    });

    expect(result.introductoryExpansionQueue).toHaveLength(16);
    expect(result.introductoryExpansionQueue[0]).toMatchObject({
      boardSize: 9,
      existingCount: 0,
    });
  });

  it("renders a markdown report", () => {
    const result = buildContentQueue(mockPuzzles, {
      approvedIds: ["cho-e-001"],
      summaryIndex,
      today: "2026-04-21",
    });

    const markdown = generateContentQueueMarkdown(result);
    expect(markdown).toContain("Current Approved Coach Count:** 1");
    expect(markdown).toContain("Top Coach-ready Candidates");
    expect(markdown).toContain("Top Mainline Backfill Candidates");
    expect(markdown).toContain("Top Wrong-branch Backfill Candidates");
    expect(markdown).toContain("Top Duplicate Governance Groups");
    expect(markdown).toContain("Top Introductory Expansion Targets");
    expect(markdown).toContain("cho-e-001");
  });
});
