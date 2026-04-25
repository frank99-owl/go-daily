import fs from "fs";
import path from "path";

import type { Coord, LocalizedText, Puzzle, Stone, WrongBranch } from "@/types";

import { applyEditorialOverride } from "./editorialOverrides";
import {
  CURATED_RUNWAY_SOURCE_IDS,
  CURATED_RUNWAY_START_DATE,
  buildAutoCuratedId,
} from "./editorialSelections";
import { buildEditorialPrompt, buildEditorialSolutionNote } from "./editorialTemplates";

// Load library data from JSON to avoid huge TS compilation overhead
const libraryPath = path.join(process.cwd(), "content/data/classicalPuzzles.json");
const LIBRARY_PUZZLES = (JSON.parse(fs.readFileSync(libraryPath, "utf-8")) as Puzzle[]).map(
  applyEditorialOverride,
);

const BASE_CURATED_SOURCE_IDS = [
  "p-00202",
  "p-00203",
  "p-00107",
  "p-00111",
  "p-00113",
  "p-00114",
  "p-00101",
  "p-00102",
  "p-00103",
  "p-00104",
  "p-00420",
  "p-00425",
  "p-00514",
  "p-00515",
] as const;

function text(zh: string, en: string, ja: string, ko: string): LocalizedText {
  return { zh, en, ja, ko };
}

function move(x: number, y: number, color: "black" | "white"): Stone {
  return { x, y, color };
}

function branch(userWrongMove: Coord, refutation: Stone[], note: LocalizedText): WrongBranch {
  return { userWrongMove, refutation, note };
}

type CuratedOverrides = {
  sourceId: string;
  id: string;
  date: string;
  prompt: LocalizedText;
  solutionNote: LocalizedText;
  solutionSequence?: Stone[];
  wrongBranches?: WrongBranch[];
};

function curatedFrom({
  sourceId,
  id,
  date,
  prompt,
  solutionNote,
  solutionSequence,
  wrongBranches,
}: CuratedOverrides): Puzzle {
  const base = LIBRARY_PUZZLES.find((p) => p.id === sourceId);
  if (!base) {
    throw new Error(`Missing source library puzzle: ${sourceId}`);
  }

  return {
    ...base,
    id,
    date,
    prompt,
    solutionNote,
    solutionSequence,
    wrongBranches,
    isCurated: true,
    source: `Editorial life-and-death · derived from ${sourceId}`,
  };
}

function addDays(ymd: string, delta: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + delta));
  return next.toISOString().slice(0, 10);
}

function autoCuratedFrom(sourceId: string, index: number): Puzzle {
  const base = LIBRARY_PUZZLES.find((p) => p.id === sourceId);
  if (!base) {
    throw new Error(`Missing runway source library puzzle: ${sourceId}`);
  }

  return {
    ...base,
    id: buildAutoCuratedId(index),
    date: addDays(CURATED_RUNWAY_START_DATE, index),
    prompt: buildEditorialPrompt(base),
    solutionNote: buildEditorialSolutionNote(base),
    isCurated: true,
    source: `Editorial runway · derived from ${sourceId}`,
  };
}

export const CURATED_SOURCE_IDS = [...BASE_CURATED_SOURCE_IDS, ...CURATED_RUNWAY_SOURCE_IDS];

const BASE_CURATED_PUZZLES: Puzzle[] = [
  curatedFrom({
    sourceId: "p-00202",
    id: "cld-001",
    date: "2026-04-18",
    prompt: text("黑先活", "Black to play and live", "黒先活", "흑선활"),
    solutionNote: text(
      "角上的一线急所先压缩白的眼形，再利用边上的黑子补成第二只眼。黑如果不先占住顶端要点，白就能借先手把角里封死。",
      "The first-line vital point at the top of the corner shrinks White's eye space immediately. Once Black takes that point, the surrounding stones work together and Black gets a clean second eye in sente.",
      "隅の第一線の急所で白の眼形を先に削るのが要点です。その一点を黒が押さえると周囲の黒石が働き、黒は先手で二眼を確保できます。",
      "귀의 1선 급소로 백의 눈 모양을 먼저 줄이는 것이 핵심입니다. 그 자리를 흑이 차지하면 주변 흑돌이 연결되면서 선수로 두 눈을 확보할 수 있습니다。",
    ),
  }),
  curatedFrom({
    sourceId: "p-00203",
    id: "cld-002",
    date: "2026-04-19",
    prompt: text("黑先活", "Black to play and live", "黒先活", "흑선활"),
    solutionNote: text(
      "上边的一线急所是黑棋唯一来得及做活的入口。先手抢到后，白的眼位被分割，黑就能靠角上的本手稳稳做活。",
      "Black must take the top first-line vital point before White settles the outside. That move splits White's eye-making shape and gives Black the only reliable route to life in the corner.",
      "上辺第一線の急所を黒が先に取るのが唯一の活路です。その一手で白の眼形を分断し、隅の本手につないで黒は安定して生きられます。",
      "윗변 1선 급소를 흑이 먼저 차지해야만 살 수 있습니다. 그 한 수로 백의 눈 모양을 갈라 놓고 귀의 본수로 이어서 흑이 안정적으로 살아갑니다.",
    ),
  }),
  curatedFrom({
    sourceId: "p-00107",
    id: "cld-003",
    date: "2026-04-20",
    prompt: text("黑先活", "Black to play and live", "黒先活", "흑선활"),
    solutionNote: text(
      "黑要先抢右边的一线点，把白在角里的眼位压成单眼。白若从外侧抵抗，黑仍能借边上的气在角里补出第二只眼。",
      "Black lives by taking the first-line point on the right side before White seals the corner. That move crushes White's eye space to one eye, and Black still has enough liberties to make the second eye after the best resistance.",
      "黒は右側第一線の急所を先に打って隅の眼形を一眼に押しつぶす必要があります。白が外から抵抗しても、黒は辺の利きを使って二眼を補えます。",
      "흑은 오른쪽 1선 급소를 먼저 차지해 귀의 눈 모양을 한 눈으로 줄여야 합니다. 백이 바깥에서 버텨도 흑은 변의 기세를 이용해 두 번째 눈을 보강할 수 있습니다.",
    ),
    solutionSequence: [move(18, 3, "black"), move(18, 4, "white"), move(17, 4, "black")],
  }),
  curatedFrom({
    sourceId: "p-00111",
    id: "cld-004",
    date: "2026-04-21",
    prompt: text("黑先活", "Black to play and live", "黒先活", "흑선활"),
    solutionNote: text(
      "角里最宽的一点必须由黑先占住，否则白会借边上的先手把黑整块压成一眼。黑先手卡住后，后续只要顺着边线补强就能稳活。",
      "Black has to occupy the widest point of the corner shape before White turns it into a one-eye group. After Black takes that point, the follow-up is straightforward: reinforce along the edge and the group is alive.",
      "隅の最も広い眼形を黒が先に押さえないと、白に一眼へ押し込まれてしまいます。その急所を取れば、あとは辺に沿って補強するだけで黒は安定して生きます。",
      "귀에서 가장 넓은 눈자리를 흑이 먼저 차지해야 합니다. 그 자리를 놓치면 백이 변 쪽 선수로 몰아붙여 흑을 한 눈으로 만들 수 있습니다. 급소를 선점하면 변을 따라 보강해서 안정적으로 살 수 있습니다.",
    ),
    solutionSequence: [move(18, 4, "black"), move(18, 3, "white"), move(17, 6, "black")],
  }),
  curatedFrom({
    sourceId: "p-00113",
    id: "cld-005",
    date: "2026-04-22",
    prompt: text("黑先活", "Black to play and live", "黒先活", "흑선활"),
    solutionNote: text(
      "黑先在上边断开白的眼形，关键不是单纯求连接，而是先把白的外气压紧。急所被黑占住后，白再怎么从角上顶，黑都能在边上补出第二只眼。",
      "Black should play the upper vital point to split White's eye shape before worrying about connection. The point is not just to connect: it squeezes White's liberties first, and then Black can always add the second eye along the edge.",
      "黒は上辺の急所で白の眼形を割るのが先決です。単なる連絡ではなく、まず白の外の利きを締めるのが目的で、その後は辺で二眼を補えます。",
      "흑은 윗변 급소로 백의 눈 모양을 끊어 놓는 것이 먼저입니다. 단순 연결이 목적이 아니라 백의 바깥 기세를 먼저 조여 두는 수이며, 이후에는 변에서 두 번째 눈을 만들 수 있습니다.",
    ),
    solutionSequence: [move(17, 1, "black"), move(18, 1, "white"), move(18, 0, "black")],
    wrongBranches: [
      branch(
        { x: 16, y: 0 },
        [move(17, 1, "white"), move(18, 0, "black")],
        text(
          "黑若先在外侧试图补形，白就能抢到真正的急所，把黑压成紧气的一眼。等到黑再回头时，节奏已经慢了一拍。",
          "If Black fixes the outside shape first, White grabs the real vital point and reduces Black to a cramped one-eye group. By the time Black comes back, the timing is already lost.",
          "外側を先に補うと、白に本当の急所を取られて黒は窮屈な一眼形になります。黒が打ち直す頃には手遅れです。",
          "흑이 바깥 모양부터 보강하면 백이 진짜 급소를 차지해 흑을 답답한 한 눈으로 몰아넣습니다. 흑이 다시 돌아올 때는 이미 한 박자 늦습니다.",
        ),
      ),
    ],
  }),
  curatedFrom({
    sourceId: "p-00114",
    id: "cld-006",
    date: "2026-04-23",
    prompt: text("黑先活", "Black to play and live", "黒先活", "흑선활"),
    solutionNote: text(
      "这道题的急所在最上边一线。黑先占住后，白在角上的扑和顶都不再严厉，黑可以顺势做出稳定眼位。",
      "The only timely move is the first-line point on the top side. Once Black occupies it, White's tesuji in the corner stop being severe and Black can build a stable eye shape.",
      "急所は最上辺の第一線です。黒がそこを押さえると、白の隅の手筋が厳しくなくなり、黒は安定した眼形を作れます。",
      "급소는 맨 윗변 1선입니다. 흑이 그 자리를 차지하면 백의 귀 수단이 더 이상 날카롭지 않아지고, 흑은 안정된 눈 모양을 만들 수 있습니다.",
    ),
    solutionSequence: [move(17, 0, "black"), move(18, 0, "white"), move(16, 1, "black")],
    wrongBranches: [
      branch(
        { x: 18, y: 0 },
        [move(17, 0, "white"), move(16, 1, "black")],
        text(
          "黑若贪图角上的表面先手，白就能反手占住真正的眼位。这样黑虽然还能挣扎，但已经失去最简明的活法。",
          "If Black grabs the flashy corner move first, White calmly takes the real eye point back. Black may still struggle, but the clean route to life is gone.",
          "隅の派手な一手を先に打つと、白に本当の眼の急所を取られます。黒はまだ粘れても、最も分かりやすい活路は消えます。",
          "흑이 화려한 귀 수부터 두면 백이 진짜 눈 급소를 차지합니다. 흑이 버틸 수는 있어도 가장 깔끔한 살 길은 사라집니다.",
        ),
      ),
    ],
  }),
  curatedFrom({
    sourceId: "p-00101",
    id: "cld-007",
    date: "2026-04-24",
    prompt: text("黑先活", "Black to play and live", "黒先活", "흑선활"),
    solutionNote: text(
      "黑必须先在右上角的急所做出眼形，不能只顾着向外连。那一手直接限制了白在边上的借用点，黑随后补上一手就能做成两眼。",
      "Black must make shape in the top-right corner first rather than thinking only about escaping outward. The vital point removes White's best forcing move on the edge, and one calm follow-up gives Black two eyes.",
      "黒は外へ逃げる前に右上隅の急所で眼形を作る必要があります。その一手で白の辺の利きを消し、黒は次の一着で二眼を完成できます。",
      "흑은 바깥으로 도망가기 전에 우상귀 급소로 눈 모양을 만들어야 합니다. 그 한 수가 백의 변 쪽 강수를 지워 주고, 흑은 다음 한 수로 두 눈을 완성할 수 있습니다.",
    ),
    solutionSequence: [move(18, 1, "black"), move(18, 2, "white"), move(17, 1, "black")],
    wrongBranches: [
      branch(
        { x: 18, y: 0 },
        [move(18, 1, "white"), move(17, 1, "black")],
        text(
          "黑若先去抢边上的表面手段，白会立刻压住真正的眼位，黑的后手补棋就变成苦活。",
          "If Black starts with the edge move, White immediately blocks the true eye point and Black's follow-up becomes an unpleasant gote defense.",
          "辺の見た目の手から入ると、白に本当の眼の急所を押さえられ、黒の補強は苦しい後手になります。",
          "변의 겉보기 수부터 두면 백이 진짜 눈 급소를 막아 버리고, 흑의 후속 보강은 답답한 후수가 됩니다.",
        ),
      ),
    ],
  }),
  curatedFrom({
    sourceId: "p-00102",
    id: "cld-008",
    date: "2026-04-25",
    prompt: text("黑先活", "Black to play and live", "黒先活", "흑선활"),
    solutionNote: text(
      "左上的一线急所关系到整块黑棋能不能把眼位分开。黑先点进去后，白无论从外面扳还是从里面补，都拦不住黑在上边形成第二只眼。",
      "The first-line point on the upper side decides whether Black can split the eye shape in time. Once Black plays there, White cannot stop Black from forming a second eye on the top edge.",
      "左上の第一線の急所が眼形を二つに分けられるかどうかを決めます。そこに黒が先着すれば、白は外からハネても中から受けても二眼形成を止められません。",
      "좌상변의 1선 급소가 흑이 눈을 둘로 가를 수 있는지 결정합니다. 그 자리를 흑이 선점하면 백이 바깥에서 막든 안쪽에서 버티든 흑의 두 눈 형성을 막을 수 없습니다.",
    ),
    solutionSequence: [move(14, 0, "black"), move(15, 0, "white"), move(12, 1, "black")],
    wrongBranches: [
      branch(
        { x: 12, y: 1 },
        [move(14, 0, "white"), move(15, 0, "black")],
        text(
          "黑若先在左边补形，白就能抢到真正的一线急所。之后黑再回头已经只能勉强求活，局面明显困难得多。",
          "If Black fills on the left first, White takes the true first-line vital point. After that Black can only struggle for life instead of settling cleanly.",
          "左側を先に補うと、白に本当の第一線の急所を取られます。その後の黒は綺麗に活くのではなく、苦しい攻防を強いられます。",
          "흑이 왼쪽부터 메우면 백이 진짜 1선 급소를 차지합니다. 그 뒤의 흑은 깔끔하게 사는 것이 아니라 힘겹게 버텨야 합니다.",
        ),
      ),
    ],
  }),
  curatedFrom({
    sourceId: "p-00103",
    id: "cld-009",
    date: "2026-04-26",
    prompt: text("黑先活", "Black to play and live", "黒先活", "흑선활"),
    solutionNote: text(
      "黑只有先手抢到上边的断点，才能把白的围空切成不成眼的形状。若被白先手压住上路，黑这块就再也做不出完整眼位。",
      "Black survives only by taking the upper cutting point first and turning White's potential territory into a shape without a real eye. If White gets that point first, Black never completes an eye.",
      "黒は上辺の切り所を先に打って、白地の形を眼にならない姿へ変える必要があります。そこを白に先着されると、黒は完全な眼を作れません。",
      "흑은 윗변의 끊는 급소를 먼저 차지해 백의 집 모양을 눈이 안 나는 형태로 바꿔야 합니다. 그 자리를 백에게 선점당하면 흑은 완전한 눈을 만들 수 없습니다.",
    ),
    solutionSequence: [move(17, 0, "black"), move(18, 0, "white"), move(16, 1, "black")],
  }),
  curatedFrom({
    sourceId: "p-00104",
    id: "cld-010",
    date: "2026-04-27",
    prompt: text("黑先活", "Black to play and live", "黒先活", "흑선활"),
    solutionNote: text(
      "黑要在右上角先做出厚味，急所的意义在于同时守住角和边。只要这一步不失误，白后续的压迫都会差一气，黑能顺利补成眼位。",
      "Black should take the top-right vital point because it protects the corner and the edge at the same time. Once that move is in place, White's follow-up attacks are always one liberty short.",
      "右上隅の急所は隅と辺を同時に守る一手です。そこを外さなければ、白の追及は常に一気足りず、黒は眼形を完成できます。",
      "우상귀 급소는 귀와 변을 동시에 지키는 한 수입니다. 그 수만 놓치지 않으면 백의 추궁은 늘 한 호흡 모자라고, 흑은 눈 모양을 완성할 수 있습니다.",
    ),
    solutionSequence: [move(17, 1, "black"), move(18, 1, "white"), move(16, 1, "black")],
  }),
  curatedFrom({
    sourceId: "p-00420",
    id: "cld-011",
    date: "2026-04-28",
    prompt: text("黑先活", "Black to play and live", "黒先活", "흑선활"),
    solutionNote: text(
      "中腹这块棋的关键不在连接，而在先做出外侧眼位。黑先在右边打入后，白的封锁会被迫留下断点，黑就能借厚味安定全块。",
      "The key in this center-side shape is not connection but making outside eye shape first. Black's vital move on the right forces White to leave a weakness, and Black stabilizes the whole group from there.",
      "この中腹の形は連絡より先に外側の眼形を作るのが急所です。右側の一手で白に弱点を残させ、黒はその厚みで全体を安定させます。",
      "이 중앙 변형은 연결보다 바깥 눈 모양을 먼저 만드는 것이 급소입니다. 오른쪽 한 수로 백에게 약점을 남기게 하고, 흑은 그 두터움으로 전부를 안정시킵니다.",
    ),
    solutionSequence: [move(17, 5, "black"), move(18, 5, "white"), move(17, 6, "black")],
    wrongBranches: [
      branch(
        { x: 18, y: 4 },
        [move(17, 5, "white"), move(17, 6, "black")],
        text(
          "黑若先在外面补一手虚招，白会立刻占住真正的眼位。这样黑虽然还连着，但整块棋始终缺少安定的一眼。",
          "If Black starts with the outside-looking move, White immediately takes the real eye point. Black remains connected, but the group never becomes truly safe.",
          "外側の見た目の手から入ると、白に本当の眼の急所を取られます。黒はつながっていても、根本的な安定を得られません。",
          "바깥의 겉보기 수부터 두면 백이 진짜 눈 급소를 차지합니다. 흑은 연결은 되어도 근본적으로 안정되지 못합니다.",
        ),
      ),
    ],
  }),
  curatedFrom({
    sourceId: "p-00425",
    id: "cld-012",
    date: "2026-04-29",
    prompt: text("黑先活", "Black to play and live", "黒先活", "흑선활"),
    solutionNote: text(
      "黑先卡在中间急所，白的眼形和逃路会同时受损。之后白再从两边抵抗，黑都可以靠形状优势把这块稳稳做活。",
      "Black lives by occupying the central vital point that damages White's eye shape and escape route at the same time. After that, Black's shape is strong enough to answer from either side and still make life.",
      "中央の急所に黒が先着すると、白の眼形と逃げ道が同時に傷みます。その後は白が左右どちらから抵抗しても、黒は形の良さで活けます。",
      "중앙 급소를 흑이 먼저 차지하면 백의 눈 모양과 탈출로가 동시에 손상됩니다. 그 뒤에는 백이 양쪽 어디서 버텨도 흑이 좋은 모양으로 살아갑니다.",
    ),
    solutionSequence: [move(15, 1, "black"), move(16, 1, "white"), move(14, 1, "black")],
    wrongBranches: [
      branch(
        { x: 14, y: 1 },
        [move(15, 1, "white"), move(16, 0, "black")],
        text(
          "黑若只顾左边的眼位，白就能抢到中央急所，整块棋马上变成对杀的重负。真正的次序必须先从中间发力。",
          "If Black only worries about the left-side eye first, White seizes the central vital point and turns the whole shape into a heavy capturing race. The order has to start from the center.",
          "左側の眼を先に気にすると、白に中央の急所を取られて全体が重い攻防になります。正しい順序は中央からです。",
          "흑이 왼쪽 눈자리부터 신경 쓰면 백이 중앙 급소를 차지해 전체가 무거운 공격과 수비가 됩니다. 올바른 순서는 중앙부터입니다.",
        ),
      ),
    ],
  }),
  curatedFrom({
    sourceId: "p-00514",
    id: "cld-013",
    date: "2026-04-30",
    prompt: text("黑先活", "Black to play and live", "黒先活", "흑선활"),
    solutionNote: text(
      "这题难在要看见中腹黑子和右边角部是同一块棋。黑先抢到中间的急所后，两边的眼位会同时成立，白也失去最严厉的挤压手段。",
      "The hard part is seeing that the center stones and the top-right corner belong to the same living problem. Once Black takes the central vital point, both eye spaces start working together and White loses the sharpest squeeze.",
      "難しさは中央の黒石と右上隅が一体の生死だと見抜くことです。中央の急所を黒が取れば、両方の眼形が連動して白の最も厳しい絞りも消えます。",
      "어려운 점은 중앙 흑돌과 우상귀가 하나의 사활 문제라는 것을 보는 데 있습니다. 중앙 급소를 흑이 차지하면 양쪽 눈자리가 함께 살아나고 백의 가장 날카로운 압박도 사라집니다.",
    ),
  }),
  curatedFrom({
    sourceId: "p-00515",
    id: "cld-014",
    date: "2026-05-01",
    prompt: text("白先杀", "White to play and kill", "白先殺", "백선사"),
    solutionNote: text(
      "白先下在中央断点，不让黑把上下两块眼位连成整体。只要白抢到这一手，黑中间的喘息点就被封住，后续无论黑怎么补都做不出完整两眼。",
      "White kills by striking the central cutting point before Black links the upper and lower eye space. Once White takes that move, Black's remaining liberties and eye shape collapse together, so Black never gets two complete eyes.",
      "白は中央の切り所を先に打って、黒の上下の眼形を一つにつながせないのが要点です。その一手で黒の息つきが消え、以後どこを補っても二眼には届きません。",
      "백은 중앙의 끊는 급소를 먼저 차지해 흑의 위아래 눈자리를 하나로 이어 주지 않는 것이 핵심입니다. 그 한 수로 흑의 숨통이 막히고, 이후 어디를 보강해도 완전한 두 눈은 나지 않습니다.",
    ),
  }),
];

const AUTO_CURATED_PUZZLES: Puzzle[] = CURATED_RUNWAY_SOURCE_IDS.map((sourceId, index) =>
  autoCuratedFrom(sourceId, index),
);

export const CURATED_PUZZLES: Puzzle[] = [...BASE_CURATED_PUZZLES, ...AUTO_CURATED_PUZZLES];
