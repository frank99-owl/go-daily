# go-daily 结构整理 + 安全修复 + 工程化基建

## Context

Frank 要求先执行 `go-daily-code-review.md` 中的操作，再进行安全性审核。该文档要求在深色化主页重构之前完成结构整理、安全修复和工程化基建。本次 plan 覆盖 P0（结构整理）、P1（安全与 bug 修复）、P2（工程化基建）全部操作。

## 总体执行顺序（每步后跑 `npm run lint && npm run build` 验证）

1. P0-1 数据文件搬家 → `refactor: move puzzle data out of lib/`
2. P1-1 API 错误脱敏 → `fix: sanitize coach API error responses`
3. P1-2 sessionStorage catch → `fix: catch sessionStorage quota errors in CoachDialogue`
4. P1-3 消息 key 改稳定 id → `fix: use stable keys in CoachDialogue message list`
5. P1-4 类型强转清理 → `refactor: remove redundant type assertion in boardSize lookups`
6. P0-3 localized.ts 并入 i18n.tsx → `refactor: consolidate i18n utilities`
7. P2-1 Prettier 接入 → `chore: add prettier config` + `chore: apply prettier formatting`
8. P2-4 .env.example 补完 → `chore: expand .env.example`
9. P2-3 Vitest + 核心单测 → `test: add vitest with core util tests`
10. P2-2 GitHub Actions CI → `ci: add lint/test/build workflow`

P3 暂不做。P0-2（*Client.tsx 重命名）按文档建议跳过。

---

## Step 1: P0-1 — 数据文件从 `lib/` 挪到 `content/data/`

**原因**: `lib/puzzleLibrary.ts` (146K 行) 和 `lib/importedPuzzles.ts` (11K 行) 是纯数据导出，不是工具函数，放在 `lib/` 是概念错误且拖慢 IDE。

**操作**:

```bash
cd /Users/frank/Desktop/go-daily
mkdir -p content/data
git mv lib/puzzleLibrary.ts content/data/puzzleLibrary.ts
git mv lib/importedPuzzles.ts content/data/importedPuzzles.ts
```

**修改 `content/puzzles.ts`**（第 13-14 行）:
- old: `import { IMPORTED_PUZZLES } from "@/lib/importedPuzzles";` / `import { LIBRARY_PUZZLES } from "@/lib/puzzleLibrary";`
- new: `import { IMPORTED_PUZZLES } from "@/content/data/importedPuzzles";` / `import { LIBRARY_PUZZLES } from "@/content/data/puzzleLibrary";`

**修改 `scripts/importTsumego.ts`**（第 21 行）:
- old: `const OUTPUT = path.join(process.cwd(), "lib/importedPuzzles.ts");`
- new: `const OUTPUT = path.join(process.cwd(), "content/data/importedPuzzles.ts");`

**验证**: `npm run validate:puzzles` (1210 puzzles) 和 `npm run build` (1219 pages) 通过。

---

## Step 2: P1-1 — API Coach 错误消息脱敏

**原因**: `app/api/coach/route.ts:155` 把上游错误消息 `msg` 原样返给客户端，可能暴露 API key 状态、额度、内部 URL。

**修改 `app/api/coach/route.ts`**（第 150-158 行）:
- 删除 `const msg = ...` 那一行
- catch 块改为只记服务端日志，返回固定文案:

```ts
} catch (err) {
  console.error("[coach] upstream error:", err);
  return NextResponse.json(
    { error: "Coach is temporarily unavailable. Please try again later." },
    { status: 502 }
  );
}
```

---

## Step 3: P1-2 — CoachDialogue sessionStorage 写入 catch

**原因**: `components/CoachDialogue.tsx:45-48` 直接 `sessionStorage.setItem`，配额满或隐私模式时会崩组件。`lib/storage.ts` 的 localStorage 已有同样保护，这里是唯一遗漏。

**修改 `components/CoachDialogue.tsx`**（第 43-49 行的 persist effect）:

```ts
useEffect(() => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      historyKey(puzzleId, locale),
      JSON.stringify(messages)
    );
  } catch (e) {
    console.warn("[coach] failed to persist history:", e);
  }
}, [messages, puzzleId, locale]);
```

（读取 effect 第 25-40 行已有 try/catch，无需修改。）

---

## Step 4: P1-3 — CoachDialogue `key={i}` 替换

**原因**: 第 118 行用 index 作 key，未来加撤回/编辑会错乱。`CoachMessage` 已有 `ts: number` 字段，可直接用。

**修改 `components/CoachDialogue.tsx`**（第 116-118 行）:
- old: `{messages.map((m, i) => (<div key={i}`
- new: `{messages.map((m) => (<div key={m.ts}`

注意：若同一毫秒内发送两条消息，`ts` 可能重复。实际用户操作不可能 1ms 内发两条，风险可接受。为极度安全可用 `` `${m.ts}-${m.role}` ``，但 `m.ts` 已足够。

---

## Step 5: P1-4 — boardSize 类型强转清理

**原因**: `ReviewClient.tsx:76` 和 `PuzzleHeader.tsx:24` 都有 `String(puzzle.boardSize) as "9" | "13" | "19"`。`puzzle.boardSize` 是 `9 | 13 | 19`（number），`t.puzzles.boardSize` 键是 `"9" | "13" | "19"`（string）。需要类型安全的映射，消除 `as`。

**修改 `types/index.ts`**: 在文件末尾添加:

```ts
export const BOARD_SIZE_LABELS: Record<9 | 13 | 19, string> = {
  9: "9×9",
  13: "13×13",
  19: "19×19",
};
```

**修改 `app/review/ReviewClient.tsx`**（第 74-78 行）:
- old: `t.puzzles.boardSize[String(puzzle.boardSize) as "9" | "13" | "19"]`
- new: `BOARD_SIZE_LABELS[puzzle.boardSize]`
- 添加 import: `import { BOARD_SIZE_LABELS } from "@/types";`
- 删除 `localized` 的 import（如果 P0-3 已完成，此文件还需要改 import 路径；如果 P0-3 还没做，先做此步，P0-3 时统一改）

**修改 `components/PuzzleHeader.tsx`**（第 22-27 行）:
- old: `t.puzzles.boardSize[String(puzzle.boardSize) as "9" | "13" | "19"]`
- new: `BOARD_SIZE_LABELS[puzzle.boardSize]`
- 添加 import: `import { BOARD_SIZE_LABELS } from "@/types";`

> 决策说明：不用 `t.puzzles.boardSize[...]` 索引，而是直接用常量 `BOARD_SIZE_LABELS`。因为 board size 的标签是固定的（9×9 / 13×13 / 19×19），不随语言变化，不需要走 i18n。这比绕一圈去 messages.json 里查更干净，且彻底消除了类型断言。

---

## Step 6: P0-3 — `localized.ts` 并入 `i18n.tsx`

**原因**: `localized()` 本来就是 i18n 的工具函数，不应单独放一个文件。

**修改 `lib/i18n.tsx`**:
- 顶部 import 改为: `import type { Locale, LocalizedText } from "@/types";`
- 在文件末尾（`useLocale` 之后）添加整个 `localized()` 函数及其 `FALLBACK_ORDER`（从 `lib/localized.ts` 原样搬过来）

**删除 `lib/localized.ts`**:
```bash
rm /Users/frank/Desktop/go-daily/lib/localized.ts
```

**更新 5 个文件的 import**:

| 文件 | 旧 import | 新 import |
|------|----------|----------|
| `lib/coachPrompt.ts` | `from "./localized"` | `from "./i18n"` |
| `app/review/ReviewClient.tsx` | `from "@/lib/localized"` | `from "@/lib/i18n"` |
| `components/PuzzleHeader.tsx` | `from "@/lib/localized"` | `from "@/lib/i18n"` |
| `app/result/ResultClient.tsx` | `from "@/lib/localized"` | `from "@/lib/i18n"` |
| `app/puzzles/PuzzleListClient.tsx` | `from "@/lib/localized"` | `from "@/lib/i18n"` |

---

## Step 7: P2-1 — 接入 Prettier

**安装依赖**:
```bash
cd /Users/frank/Desktop/go-daily
npm install -D prettier
```

**创建 `.prettierrc`**:
```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

**创建 `.prettierignore`**:
```
.next
content/data
```

**修改 `package.json`**: 在 `scripts` 中添加:
```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

**执行首次格式化**（单独一个 commit）:
```bash
npm run format
```

---

## Step 8: P2-4 — 补 `.env.example`

**修改 `.env.example`**:

```
# Copy to .env.local and fill in your own key.
# Never commit .env.local — it's gitignored by default.
DEEPSEEK_API_KEY=
# Optional: Vercel-specific overrides
# NEXT_PUBLIC_SITE_URL=https://go-daily.vercel.app
```

---

## Step 9: P2-3 — Vitest + 核心单测

**安装依赖**:
```bash
npm install -D vitest @vitest/coverage-v8
```

**修改 `package.json`**: 在 `scripts` 中添加:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**创建 `vitest.config.ts`**:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

**创建测试文件**:

### `lib/board.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { coordEquals, isInBounds, isOccupied, starPoints } from "./board";
import type { Stone } from "@/types";

describe("coordEquals", () => {
  it("returns true for identical coords", () => {
    expect(coordEquals({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(true);
  });
  it("returns false for different coords", () => {
    expect(coordEquals({ x: 3, y: 4 }, { x: 4, y: 3 })).toBe(false);
  });
});

describe("isInBounds", () => {
  it("accepts origin", () => {
    expect(isInBounds({ x: 0, y: 0 }, 19)).toBe(true);
  });
  it("accepts max coord", () => {
    expect(isInBounds({ x: 18, y: 18 }, 19)).toBe(true);
  });
  it("rejects negative", () => {
    expect(isInBounds({ x: -1, y: 0 }, 19)).toBe(false);
  });
  it("rejects out of range", () => {
    expect(isInBounds({ x: 19, y: 0 }, 19)).toBe(false);
  });
});

describe("isOccupied", () => {
  const stones: Stone[] = [
    { x: 3, y: 3, color: "black" },
    { x: 4, y: 4, color: "white" },
  ];
  it("finds occupied", () => {
    expect(isOccupied(stones, { x: 3, y: 3 })).toBe(true);
  });
  it("finds empty", () => {
    expect(isOccupied(stones, { x: 0, y: 0 })).toBe(false);
  });
});

describe("starPoints", () => {
  it("returns 5 points for 9x9", () => {
    expect(starPoints(9)).toHaveLength(5);
  });
  it("returns 9 points for 19x19", () => {
    expect(starPoints(19)).toHaveLength(9);
  });
  it("includes tengen for 19x19", () => {
    const points = starPoints(19);
    expect(points.some((p) => p.x === 9 && p.y === 9)).toBe(true);
  });
});
```

### `lib/judge.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { judgeMove } from "./judge";
import type { Puzzle } from "@/types";

const mockPuzzle: Puzzle = {
  id: "test-1",
  date: "2026-04-20",
  boardSize: 9,
  stones: [{ x: 3, y: 3, color: "black" }],
  toPlay: "white",
  correct: [{ x: 4, y: 4 }],
  tag: "life-death",
  difficulty: 2,
  prompt: { zh: "测试", en: "Test", ja: "テスト", ko: "테스트" },
  solutionNote: { zh: "笔记", en: "Note", ja: "ノート", ko: "노트" },
};

describe("judgeMove", () => {
  it("returns true for correct move", () => {
    expect(judgeMove(mockPuzzle, { x: 4, y: 4 })).toBe(true);
  });
  it("returns false for wrong move", () => {
    expect(judgeMove(mockPuzzle, { x: 0, y: 0 })).toBe(false);
  });
  it("handles multiple correct answers", () => {
    const multi: Puzzle = {
      ...mockPuzzle,
      correct: [
        { x: 4, y: 4 },
        { x: 5, y: 5 },
      ],
    };
    expect(judgeMove(multi, { x: 5, y: 5 })).toBe(true);
    expect(judgeMove(multi, { x: 0, y: 0 })).toBe(false);
  });
});
```

### `lib/goRules.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { playMove } from "./goRules";
import type { Color, Coord } from "@/types";

function makeBoard(stones: { coord: Coord; color: Color }[]): Map<string, Color> {
  const b = new Map<string, Color>();
  for (const s of stones) {
    b.set(`${s.coord.x},${s.coord.y}`, s.color);
  }
  return b;
}

describe("playMove", () => {
  it("places a stone without capture", () => {
    const board = makeBoard([]);
    const result = playMove(board, { color: "black", coord: { x: 3, y: 3 } });
    expect(result.board.get("3,3")).toBe("black");
    expect(result.captured).toHaveLength(0);
  });

  it("captures a single stone surrounded on all 4 sides", () => {
    const board = makeBoard([
      { coord: { x: 3, y: 3 }, color: "white" },
      { coord: { x: 3, y: 2 }, color: "black" },
      { coord: { x: 2, y: 3 }, color: "black" },
      { coord: { x: 4, y: 3 }, color: "black" },
    ]);
    const result = playMove(board, { color: "black", coord: { x: 3, y: 4 } });
    expect(result.captured).toHaveLength(1);
    expect(result.captured[0]).toEqual({ x: 3, y: 3 });
    expect(result.board.has("3,3")).toBe(false);
  });

  it("does not capture own stones", () => {
    const board = makeBoard([
      { coord: { x: 3, y: 3 }, color: "black" },
      { coord: { x: 3, y: 2 }, color: "white" },
      { coord: { x: 2, y: 3 }, color: "white" },
      { coord: { x: 4, y: 3 }, color: "white" },
    ]);
    const result = playMove(board, { color: "black", coord: { x: 3, y: 4 } });
    // Black's own stone at (3,3) should NOT be captured
    expect(result.board.has("3,3")).toBe(true);
    expect(result.captured).toHaveLength(0);
  });

  it("captures a connected group", () => {
    const board = makeBoard([
      { coord: { x: 3, y: 3 }, color: "white" },
      { coord: { x: 4, y: 3 }, color: "white" },
      // Surrounding black stones
      { coord: { x: 3, y: 2 }, color: "black" },
      { coord: { x: 4, y: 2 }, color: "black" },
      { coord: { x: 2, y: 3 }, color: "black" },
      { coord: { x: 5, y: 3 }, color: "black" },
      { coord: { x: 3, y: 4 }, color: "black" },
    ]);
    const result = playMove(board, { color: "black", coord: { x: 4, y: 4 } });
    expect(result.captured).toHaveLength(2);
    expect(result.board.has("3,3")).toBe(false);
    expect(result.board.has("4,3")).toBe(false);
  });
});
```

### `lib/sgf.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseSgfMoves } from "./sgf";

describe("parseSgfMoves", () => {
  it("returns empty for empty string", () => {
    expect(parseSgfMoves("")).toHaveLength(0);
  });
  it("parses a single black move", () => {
    const moves = parseSgfMoves(";B[dd]");
    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual({ color: "black", coord: { x: 3, y: 3 } });
  });
  it("parses a single white move", () => {
    const moves = parseSgfMoves(";W[qq]");
    expect(moves).toHaveLength(1);
    expect(moves[0]).toEqual({ color: "white", coord: { x: 16, y: 16 } });
  });
  it("parses multiple moves", () => {
    const sgf = ";B[dd];W[qq];B[pd];W[dp]";
    const moves = parseSgfMoves(sgf);
    expect(moves).toHaveLength(4);
    expect(moves[2]).toEqual({ color: "black", coord: { x: 15, y: 3 } });
  });
  it("ignores comments and branches", () => {
    const sgf = "(;B[dd]C[comment];W[qq](;B[pd])(;B[pp]))";
    const moves = parseSgfMoves(sgf);
    expect(moves).toHaveLength(4);
  });
  it("handles aa as origin", () => {
    const moves = parseSgfMoves(";B[aa]");
    expect(moves[0].coord).toEqual({ x: 0, y: 0 });
  });
});
```

---

## Step 10: P2-2 — GitHub Actions CI

**创建 `.github/workflows/ci.yml`**:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run format:check
      - run: npm run lint
      - run: npm run validate:puzzles
      - run: npx tsc --noEmit
      - run: npm run test
      - run: npm run build
        env:
          DEEPSEEK_API_KEY: "ci-fake-key-not-used-during-build"
```

---

## 安全审核

在执行完上述所有修改后，进行安全性审核：

1. **API 泄露检查**: 确认 `app/api/coach/route.ts` 的 catch 块不再向客户端发送任何上游错误详情
2. **敏感数据检查**: grep 全代码库确认没有硬编码的 API key、密码、token
3. **XSS 检查**: 确认所有用户输入（URL params、localStorage、sessionStorage）都有适当的处理
4. **CSRF/注入检查**: 确认 API 路由有适当的输入验证（已有）
5. **依赖安全检查**: 运行 `npm audit` 检查已知漏洞

---

## 最终验证清单（必须全绿）

```bash
cd ~/Desktop/go-daily

npm ci
npm run format:check                   # 0 diff
npm run lint                           # 0 errors 0 warnings
npx tsc --noEmit                       # 0 errors
npm run validate:puzzles               # 1210 puzzles
npm run test                           # 全绿
npm run build                          # 1219 pages

# 结构验证
[ ! -f lib/puzzleLibrary.ts ]          # 已挪走
[ ! -f lib/importedPuzzles.ts ]        # 已挪走
[ -f content/data/puzzleLibrary.ts ]   # 在新位置
[ -f content/data/importedPuzzles.ts ] # 在新位置

# 安全验证
grep -n "\${msg}" app/api/coach/route.ts   # 0 命中

# 工程化验证
[ -f .github/workflows/ci.yml ]
[ -f .prettierrc ]
[ -f vitest.config.ts ]
```

人工验证：
- 本地 `npm run dev`，打开 `/`、`/today`、`/puzzles`、`/puzzles/[id]`、`/review`、`/stats`、`/result` 正常
- 打开题目 → 落子 → 判断 → 跳 result 无回归
- Coach 对话能发消息、能收到回复、刷新页面消息还在
- 语言切换四语都能切，刷新不丢失

---

## Critical Files

- `content/puzzles.ts` — import 路径更新
- `content/data/puzzleLibrary.ts` — 移动后的数据文件
- `content/data/importedPuzzles.ts` — 移动后的数据文件
- `scripts/importTsumego.ts` — 输出路径更新
- `app/api/coach/route.ts` — 安全修复
- `components/CoachDialogue.tsx` — sessionStorage catch + 稳定 key
- `app/review/ReviewClient.tsx` — 类型清理 + import 更新
- `components/PuzzleHeader.tsx` — 类型清理 + import 更新
- `types/index.ts` — BOARD_SIZE_LABELS 常量
- `lib/i18n.tsx` — 合并 localized 函数
- `lib/coachPrompt.ts` — import 路径更新
- `app/result/ResultClient.tsx` — import 更新
- `app/puzzles/PuzzleListClient.tsx` — import 更新
- `package.json` — 脚本更新
- `.env.example` — 补全
- `.prettierrc` — 新建
- `.prettierignore` — 新建
- `vitest.config.ts` — 新建
- `lib/board.test.ts` — 新建
- `lib/judge.test.ts` — 新建
- `lib/goRules.test.ts` — 新建
- `lib/sgf.test.ts` — 新建
- `.github/workflows/ci.yml` — 新建
