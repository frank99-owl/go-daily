import type { LocalizedText, Puzzle } from "@/types";

type ZoneText = LocalizedText;

function getZoneText(puzzle: Puzzle): ZoneText {
  const move = puzzle.correct[0];
  if (!move) {
    return {
      zh: "关键区域",
      en: "critical area",
      ja: "急所の周辺",
      ko: "핵심 부근",
    };
  }

  const edgeDepth = puzzle.boardSize <= 13 ? 1 : 2;
  const onTop = move.y <= edgeDepth;
  const onBottom = move.y >= puzzle.boardSize - 1 - edgeDepth;
  const onLeft = move.x <= edgeDepth;
  const onRight = move.x >= puzzle.boardSize - 1 - edgeDepth;

  if (onTop && onLeft) {
    return { zh: "左上角", en: "top-left corner", ja: "左上隅", ko: "좌상귀" };
  }
  if (onTop && onRight) {
    return { zh: "右上角", en: "top-right corner", ja: "右上隅", ko: "우상귀" };
  }
  if (onBottom && onLeft) {
    return { zh: "左下角", en: "bottom-left corner", ja: "左下隅", ko: "좌하귀" };
  }
  if (onBottom && onRight) {
    return { zh: "右下角", en: "bottom-right corner", ja: "右下隅", ko: "우하귀" };
  }
  if (onTop) {
    return { zh: "上边", en: "upper side", ja: "上辺", ko: "윗변" };
  }
  if (onBottom) {
    return { zh: "下边", en: "lower side", ja: "下辺", ko: "아랫변" };
  }
  if (onLeft) {
    return { zh: "左边", en: "left side", ja: "左辺", ko: "좌변" };
  }
  if (onRight) {
    return { zh: "右边", en: "right side", ja: "右辺", ko: "우변" };
  }

  return { zh: "中腹", en: "center", ja: "中央", ko: "중앙" };
}

export function buildEditorialPrompt(puzzle: Puzzle): LocalizedText {
  const byTag = {
    "life-death":
      puzzle.toPlay === "black"
        ? {
            zh: "黑先活",
            en: "Black to play and live",
            ja: "黒先活",
            ko: "흑선활",
          }
        : {
            zh: "白先杀",
            en: "White to play and kill",
            ja: "白先殺",
            ko: "백선사",
          },
    tesuji:
      puzzle.toPlay === "black"
        ? {
            zh: "黑先手筋",
            en: "Black to play — tesuji",
            ja: "黒先手筋",
            ko: "흑선 수법",
          }
        : {
            zh: "白先手筋",
            en: "White to play — tesuji",
            ja: "白先手筋",
            ko: "백선 수법",
          },
    endgame:
      puzzle.toPlay === "black"
        ? {
            zh: "黑先官子",
            en: "Black to play — best endgame move",
            ja: "黒先ヨセ",
            ko: "흑선 끝내기",
          }
        : {
            zh: "白先官子",
            en: "White to play — best endgame move",
            ja: "白先ヨセ",
            ko: "백선 끝내기",
          },
    opening:
      puzzle.toPlay === "black"
        ? {
            zh: "黑先布局方向",
            en: "Black to play — best opening continuation",
            ja: "黒先布石",
            ko: "흑선 포석",
          }
        : {
            zh: "白先布局方向",
            en: "White to play — best opening continuation",
            ja: "白先布石",
            ko: "백선 포석",
          },
  };

  return byTag[puzzle.tag];
}

export function buildEditorialSolutionNote(puzzle: Puzzle): LocalizedText {
  const zone = getZoneText(puzzle);

  switch (puzzle.tag) {
    case "life-death":
      if (puzzle.toPlay === "black") {
        return {
          zh: `黑先要抢到${zone.zh}的急所，因为这一手会先压缩白的眼位，再把黑棋的形状安定下来。如果黑先去别处，白就能先手补强，之后黑最简明的活路会消失。`,
          en: `Black should take the vital point on the ${zone.en} first because that move shrinks White's eye space and settles Black's shape at the same time. If Black starts elsewhere, White gets the forcing move first and Black loses the cleanest route to life.`,
          ja: `黒は${zone.ja}の急所を先に取るべきです。なぜなら、その一手で白の眼形を縮めながら黒の形も安定するからです。もし黒が別の場所から動くと、白に先手で補強され、その後の活路は一気に苦しくなります。`,
          ko: `흑은 ${zone.ko}의 급소를 먼저 차지해야 합니다. 그 이유는 그 한 수가 백의 눈 모양을 줄이면서 흑의 형태도 안정시키기 때문입니다. 만약 흑이 다른 곳부터 두면 백이 먼저 보강하고, 이후 흑의 가장 쉬운 활로가 사라집니다.`,
        };
      }

      return {
        zh: `白先必须占住${zone.zh}的急所，因为这一手会阻止黑把眼位连成整块。如果白先走别处，黑就能先手安定，之后白的杀棋机会会明显变小。`,
        en: `White must strike the vital point on the ${zone.en} first because that move stops Black from combining the eye space into one stable group. If White plays elsewhere, Black settles first and the killing chance disappears.`,
        ja: `白は${zone.ja}の急所を先に打たなければなりません。なぜなら、その一手で黒が眼形を一つにまとめる筋を止められるからです。もし白が別の場所から打つと、黒に先に安定され、その後の殺しの見込みは小さくなります。`,
        ko: `백은 ${zone.ko}의 급소를 먼저 쳐야 합니다. 그 이유는 그 한 수가 흑이 눈자리를 하나로 묶는 길을 막기 때문입니다. 만약 백이 다른 곳부터 두면 흑이 먼저 안정되고, 이후의 잡는 기회가 크게 줄어듭니다.`,
      };

    case "tesuji":
      if (puzzle.toPlay === "black") {
        return {
          zh: `黑先在${zone.zh}打出手筋最有效，因为这一步同时制造形状压力并逼白表态。如果黑先走缓手，白就能整形，之后黑的战术先手会消失。`,
          en: `Black's key move is the forcing tesuji on the ${zone.en} because it creates shape pressure and asks White the hardest local question at once. If Black answers passively first, White untangles the position and the tactical edge disappears.`,
          ja: `黒は${zone.ja}で手筋を打つのが最も効率的です。なぜなら、その一手で形の圧力をかけながら白に難しい応手を迫れるからです。もし黒が緩い手から入ると、白に整形されてその後の戦術的な先手が消えます。`,
          ko: `흑은 ${zone.ko}에서 수법을 두는 것이 가장 효율적입니다. 그 이유는 그 한 수가 형태 압박을 만들면서 백에게 가장 어려운 응수를 강요하기 때문입니다. 만약 흑이 느린 수부터 두면 백이 형태를 정리하고 이후 전술적 선수가 사라집니다.`,
        };
      }

      return {
        zh: `白先在${zone.zh}用手筋发力最严厉，因为这一步会立刻破坏黑的形状并抢到主动权。如果白先走俗手，黑就能从容补强，之后白的强手味道会明显下降。`,
        en: `White's strongest plan is the tesuji on the ${zone.en} because it breaks Black's shape immediately and keeps the initiative. If White starts with a plain move, Black settles too easily and the tactical force is lost.`,
        ja: `白は${zone.ja}で手筋を利かせるのが最も厳しいです。なぜなら、その一手で黒の形をすぐに崩しながら主導権も取れるからです。もし白が平凡な手から入ると、黒に簡単に整えられてその後の厳しさが落ちます。`,
        ko: `백은 ${zone.ko}에서 수법을 두는 것이 가장 날카롭습니다. 그 이유는 그 한 수가 흑의 형태를 즉시 흔들면서 주도권도 가져오기 때문입니다. 만약 백이 평범한 수부터 두면 흑이 쉽게 정리하고 이후의 날카로움이 줄어듭니다.`,
      };

    case "endgame":
      if (puzzle.toPlay === "black") {
        return {
          zh: `黑先要走${zone.zh}最大的官子，因为这一步既能拿到本地目数，也能限制白最好的后续。如果黑先收小官子，白就会抢到大点，之后这一带的交换会明显亏损。`,
          en: `Black should take the largest endgame point on the ${zone.en} first because it gains local profit and removes White's best follow-up at the same time. If Black chooses a smaller yose move first, White takes the bigger point and the exchange swings the wrong way.`,
          ja: `黒は${zone.ja}の最も大きいヨセを先に打つべきです。なぜなら、その一手で地を稼ぎながら白の最大の後続も消せるからです。もし黒が小さいヨセから入ると、白に大場を取られてその後の交換が損になります。`,
          ko: `흑은 ${zone.ko}의 가장 큰 끝내기 자리를 먼저 차지해야 합니다. 그 이유는 그 한 수가 집을 벌면서 백의 최선 후속도 지우기 때문입니다. 만약 흑이 작은 끝내기부터 두면 백이 큰 자리를 차지하고 이후 교환이 손해로 기웁니다.`,
        };
      }

      return {
        zh: `白先要抢${zone.zh}最大的官子，因为这一手既能确保本地利益，也能压住黑最有威胁的后续。如果白先走小处，黑就会反手拿大点，之后白在这一带的收益会明显下降。`,
        en: `White should claim the biggest endgame point on the ${zone.en} first because it secures local profit and suppresses Black's sharpest follow-up. If White starts with a smaller move, Black answers at the larger point and White's return drops immediately.`,
        ja: `白は${zone.ja}の最大のヨセを先に取るべきです。なぜなら、その一手で地を確保しながら黒の厳しい後続も抑えられるからです。もし白が小さい場所から打つと、黒に大場を打たれてその後の得が減ります。`,
        ko: `백은 ${zone.ko}의 가장 큰 끝내기 자리를 먼저 차지해야 합니다. 그 이유는 그 한 수가 집을 확보하면서 흑의 가장 날카로운 후속도 억제하기 때문입니다. 만약 백이 작은 곳부터 두면 흑이 더 큰 자리를 가져가고 이후 이익이 줄어듭니다.`,
      };

    case "opening":
      if (puzzle.toPlay === "black") {
        return {
          zh: `黑先在${zone.zh}选择正确方向，因为这一手既能安定形状，也能朝更大的模样发展。如果黑过早转向别处，白就会拿到更顺的全局方向，之后黑的效率会下降。`,
          en: `Black should choose the right opening continuation on the ${zone.en} because it settles shape and expands toward the larger side at the same time. If Black turns elsewhere too early, White gets the more efficient whole-board direction and Black's shape loses efficiency.`,
          ja: `黒は${zone.ja}で正しい方向に進むべきです。なぜなら、その一手で形を安定させながら大きい側へ発展できるからです。もし黒が早く別方向へ向かうと、白に全局の流れを取られてその後の効率が落ちます。`,
          ko: `흑은 ${zone.ko}에서 올바른 방향으로 진행해야 합니다. 그 이유는 그 한 수가 형태를 안정시키면서 더 큰 방향으로 확장해 주기 때문입니다. 만약 흑이 너무 일찍 다른 곳으로 돌면 백이 전반의 흐름을 잡고 이후 효율이 떨어집니다.`,
        };
      }

      return {
        zh: `白先在${zone.zh}拿到正确方向最重要，因为这一手既能整理形状，也能把局面引向更大的发展点。如果白先在别处纠缠，黑就会占到更舒服的外势，之后白的全局效率会变差。`,
        en: `White should take the correct opening direction on the ${zone.en} first because it tidies the shape and points the game toward the larger area. If White gets distracted elsewhere, Black builds the easier outside position and White's whole-board efficiency drops.`,
        ja: `白は${zone.ja}で正しい方向を取るのが重要です。なぜなら、その一手で形を整えながら大きい発展先へ向かえるからです。もし白が別の場所で細かく動くと、黒に楽な外勢を築かれてその後の全局効率が落ちます。`,
        ko: `백은 ${zone.ko}에서 올바른 방향을 잡는 것이 중요합니다. 그 이유는 그 한 수가 형태를 정리하면서 더 큰 방향으로 게임을 이끌기 때문입니다. 만약 백이 다른 곳에서 잔수에 매달리면 흑이 편한 외세를 만들고 이후 전반 효율이 떨어집니다.`,
      };

    default:
      return puzzle.solutionNote;
  }
}
