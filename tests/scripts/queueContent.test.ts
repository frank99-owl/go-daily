import { describe, expect, it } from "vitest";

import { buildContentQueue, generateContentQueueMarkdown } from "../../scripts/queueContent";
import type { Puzzle, PuzzleSummary } from "../../types";

describe("queueContent", () => {
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
      prompt: {
        zh: "黑先活",
        en: "Black to play and live",
        ja: "黒先活",
        ko: "흑선활",
      },
      solutionNote: {
        zh: "黑先要抢到左上角的急所，因为这一手会先压缩白的眼位，再把黑棋的形状安定下来。如果黑先去别处，白就能先手补强，之后黑最简明的活路会消失。",
        en: "Black should take the vital point on the top-left corner first because that move shrinks White's eye space and settles Black's shape at the same time. If Black starts elsewhere, White gets the forcing move first and Black loses the cleanest route to life.",
        ja: "黒は左上隅の急所を先に取るべきです。なぜなら、その一手で白の眼形を縮めながら黒の形も安定するからです。もし黒が別の場所から動くと、白に先手で補強され、その後の活路は一気に苦しくなります。",
        ko: "흑은 좌상귀의 급소를 먼저 차지해야 합니다. 그 이유는 그 한 수가 백의 눈 모양을 줄이면서 흑의 형태도 안정시키기 때문입니다. 만약 흑이 다른 곳부터 두면 백이 먼저 보강하고, 이후 흑의 가장 쉬운 활로가 사라집니다.",
      },
      source: "Cho",
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
    expect(result.coachReadyCandidates[0]).toMatchObject({
      id: "lib-0317",
      eligible: true,
      qualityTier: "coach-ready",
    });
    expect(result.coachReadyCandidates[1]).toMatchObject({
      id: "cho-e-001",
      alreadyApproved: true,
    });
    expect(result.coachReadyCandidates.length).toBe(2);
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
    expect(markdown).toContain("cho-e-001");
  });
});
