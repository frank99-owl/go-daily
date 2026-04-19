# go-daily · 项目结构审阅与优化执行方案

## 背景

Frank 在做大重构（深色化 + AlphaGo 演示棋盘，见另一份 `go-daily-homepage-redesign.md`）之前，希望先梳理一遍项目的整体结构、代码质量和工程化短板，找出**真正值得改的点**，不做吹毛求疵。

**这份方案交给另一个模型执行。最好在深色化重构之前先把这份跑完，否则后续重构会踩到这里已经识别出的坑。执行完 Frank 交还给我审核。**

---

## 总体评分

| 维度         | 现状   | 评价                                             |
| ------------ | ------ | ------------------------------------------------ |
| 目录分层     | 7/10   | 清晰，但数据放在 `lib/` 是概念错误               |
| 组件粒度     | 7.5/10 | 命名一致，`*Client.tsx` 扁平布局可以更好         |
| 类型安全     | 8.5/10 | strict 开，无 any 滥用，个别冗余强转             |
| React 实践   | 9/10   | useEffect 依赖正确、SSR 守护到位、一处 `key={i}` |
| 国际化       | 9.5/10 | 四语言完全对应，fallback 合理                    |
| 持久化       | 9/10   | 唯一问题：sessionStorage 写入未 catch 配额异常   |
| API 安全     | 7/10   | 有限流、有体积上限，但错误消息会泄露上游细节 🔴  |
| 性能/Bundle  | 6.5/10 | 1210 页 SSG → `.next/server` 100 MB              |
| 工程化成熟度 | 4/10   | 零测试、零 CI、无 Prettier                       |

**结论**：数据层健壮、代码干净、i18n 到位；主要缺口是**工程化基建**（CI / 测试 / 格式化）和**一处安全问题**。

---

## P0 · 结构整理（必须在深色化之前做）

### P0-1：把数据文件挪出 `lib/`

**现状**：`lib/puzzleLibrary.ts`（146,853 行 / 2.5 MB）和 `lib/importedPuzzles.ts`（11,253 行 / 220 KB）放在 `lib/`。这两个是纯数据导出，不是工具函数。`lib/` 被污染，IDE 打开 `lib/` 时响应变慢，概念也错。

**做法**：

```bash
mkdir -p content/data
git mv lib/puzzleLibrary.ts content/data/puzzleLibrary.ts
git mv lib/importedPuzzles.ts content/data/importedPuzzles.ts
```

修改 `content/puzzles.ts` 的 import 路径：

```diff
- import { IMPORTED_PUZZLES } from "@/lib/importedPuzzles";
- import { LIBRARY_PUZZLES } from "@/lib/puzzleLibrary";
+ import { IMPORTED_PUZZLES } from "@/content/data/importedPuzzles";
+ import { LIBRARY_PUZZLES } from "@/content/data/puzzleLibrary";
```

修改生成脚本的输出路径：

- `scripts/importTsumego.ts`：输出 `lib/importedPuzzles.ts` → `content/data/importedPuzzles.ts`
- `scripts/importLibrary.ts`（隐藏在 `.gitignore`）：输出 `lib/puzzleLibrary.ts` → `content/data/puzzleLibrary.ts`

**验证**：`npm run validate:puzzles && npm run build` 通过，且 `lib/` 下不再有 146K 行的文件。

### P0-2：整理 `app/*Client.tsx` 的扁平布局

**现状**：5 个 Client 组件（`TodayClient.tsx`、`PuzzleListClient.tsx`、`ReviewClient.tsx`、`StatsClient.tsx` 等）散落在 `app/` 各个路由目录下，命名后缀 `Client` 表意模糊。

**做法**：保留现有位置，但**重命名去掉 `Client` 后缀**，因为 Next.js App Router 里 Client 组件本来就是 `"use client"` 声明出来的，不需要命名兜底：

| 旧                                 | 新                           |
| ---------------------------------- | ---------------------------- |
| `app/today/TodayClient.tsx`        | `app/today/TodayView.tsx`    |
| `app/puzzles/PuzzleListClient.tsx` | `app/puzzles/PuzzleList.tsx` |
| `app/review/ReviewClient.tsx`      | `app/review/ReviewList.tsx`  |
| `app/stats/StatsClient.tsx`        | `app/stats/StatsView.tsx`    |
| `app/result/ResultClient.tsx`      | `app/result/ResultView.tsx`  |

用 `View` 或功能语义（`List`）做后缀，比 `Client` 更有表达力。同步改 `app/*/page.tsx` 里的 import。

> 如果你觉得这步改动量大且风险不匹配收益，**可以跳过**。Frank 若跳过，把这条从验证清单划掉即可。

### P0-3：`lib/` 轻度分层（可选）

**现状**：`lib/` 里纯函数（`board.ts`、`judge.ts`、`localized.ts`、`sgf.ts`、`goRules.ts`）和带 React 的 hook（`i18n.tsx`、`storage.ts` 部分）混在一起。

**做法**：**不要做 `lib/hooks/` 和 `lib/utils/` 的大拆分**——现在文件数（14 个）还没到必须分层的程度，分了反而增加路径深度。只做一个小动作：

- 把 `lib/localized.ts` 和 `lib/i18n.tsx` 合并成一个 `lib/i18n.tsx`（`localized()` 本来就是 i18n 的工具函数）

如果要拆得更细，等到 `lib/` 超过 25 个文件时再做。

---

## P1 · 安全与 bug 修复（高价值低成本）

### P1-1 🔴：API Coach 错误消息泄露上游细节

**现状**：`app/api/coach/route.ts` 第 150-157 行：

```ts
return NextResponse.json({ error: `Coach is unavailable right now. ${msg}` }, { status: 502 });
```

如果 DeepSeek 返回 `401 Invalid API key` 或 `429 Quota exceeded`，`msg` 原样返给客户端，暴露你的 key 状态、额度情况、甚至可能有内部 URL。

**做法**：

```ts
} catch (err) {
  // 详细错误只记到服务端
  console.error("[coach] upstream error:", err);
  return NextResponse.json(
    { error: "Coach is temporarily unavailable. Please try again later." },
    { status: 502 }
  );
}
```

删掉拼 `msg` 的那一行。前端 UI 已经有 fallback 文案，不依赖服务端错误细节。

### P1-2：CoachDialogue 的 sessionStorage 写入没 catch 配额异常

**现状**：`components/CoachDialogue.tsx` 第 42-49 行直接 `sessionStorage.setItem(JSON.stringify(messages))`。如果用户长时间聊天或在隐私模式下，`QuotaExceededError` 会冒泡把组件崩掉。

**做法**：

```ts
useEffect(() => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(messages));
  } catch (e) {
    // 配额满或隐私模式，降级为仅内存存储
    console.warn("[coach] failed to persist history:", e);
  }
}, [messages, key]);
```

`lib/storage.ts` 的 localStorage 读写已经做了这个保护，这里是唯一遗漏。

### P1-3：CoachDialogue 的 `key={i}` 替换

**现状**：`components/CoachDialogue.tsx:118` 用 index 作 key。当前消息只追加不删，表面 OK，但是如果未来加"撤回/编辑"就会错乱。

**做法**：给每条消息一个时间戳 id。在 `types/index.ts` 的 `CoachMessage` 上加 `id: string`（或直接用 `ts: number`）：

```tsx
{messages.map((m) => (
  <div key={`${m.ts}-${m.role}`} ...>
))}
```

### P1-4：`ReviewClient.tsx:76` 类型冗余强转

**现状**：`String(puzzle.boardSize) as "9" | "13" | "19"`。

**做法**：直接用联合类型索引：

```tsx
t.puzzles.boardSize[puzzle.boardSize];
```

前提是 `t.puzzles.boardSize` 的键是 `9 | 13 | 19`（数字）而不是字符串。若 JSON 里是字符串键，把 `puzzle.boardSize` toString 后索引也行，但去掉 `as` 强转。

---

## P2 · 工程化基建（深色化之后补也行）

### P2-1：接入 Prettier

```bash
npm i -D prettier
```

根目录加 `.prettierrc`：

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

`.prettierignore`：

```
.next
content/data
lib/puzzleLibrary.ts
lib/importedPuzzles.ts
```

`package.json` 加脚本：

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

首次跑 `npm run format` 可能改动很多文件，建议**单独一个 commit** `chore: apply prettier`。

### P2-2：GitHub Actions CI

新建 `.github/workflows/ci.yml`：

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
      - run: npm run build
        env:
          DEEPSEEK_API_KEY: "ci-fake-key-not-used-during-build"
```

每次 push 和 PR 都会自动跑一遍全量检查，防止回归。

### P2-3：Vitest 单测（最小集）

```bash
npm i -D vitest @vitest/coverage-v8
```

`package.json` 加：

```json
"test": "vitest run",
"test:watch": "vitest"
```

新建 `vitest.config.ts`（最小配置，Next.js 项目通常不需要特殊设置）：

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "node" },
});
```

**只覆盖核心纯函数**（不做 UI 测试，ROI 太低）：

- `lib/board.test.ts`：测 `coordEquals`、`isInBounds`、`isOccupied`、`starPoints`
- `lib/judge.test.ts`：测 `judgeMove` 对正解/非正解/越界的判断
- `lib/goRules.test.ts`（深色化 plan 之后会新建）：测提子算法
  - 基础 case：单子被围提
  - 群提：一群相连的子被围同时提
  - 不提自己：己方被围不自动移除（职业棋谱里不会发生，但算法要正确）
- `lib/sgf.test.ts`（同上）：测坐标转换 + 分支跳过

目标是让核心算法有回归保护，不追求覆盖率数字。

### P2-4：补 `.env.example`

当前只有 `DEEPSEEK_API_KEY`。补完：

```
DEEPSEEK_API_KEY=sk-...
# Optional: Vercel-specific overrides
# NEXT_PUBLIC_SITE_URL=https://go-daily.vercel.app
```

README 或 CONTRIBUTING.md 里加一句"本地跑 Coach 需要 DeepSeek key"。

---

## P3 · 性能讨论（不强求动，视部署规模决定）

### P3-1：1210 页 SSG 的 `.next/server` 100 MB

**现状**：`app/puzzles/[id]/page.tsx` 的 `generateStaticParams()` 为 1210 道题各生成一个静态 HTML + RSC payload，构建产物 `.next/server` 100 MB，build 时间 40s。

**考量**：

- 个人项目 / Vercel Hobby：**可以不动**，100 MB 在限额内，题目点开是即时的。
- 如果未来题库翻到 5000+ 或部署要上 CDN 带宽敏感的地方：改用 **ISR** 或 **动态路由 + KV 缓存**。

**如果要改**：把 `generateStaticParams` 去掉，改成 `export const revalidate = false`（首次访问时生成，缓存永久）。但**现阶段不推荐改**——SSG 是当前最简单可预测的方案。

### P3-2：Hardcoded `[#00f2ff]` 等魔法数值

**现状**：Grep 出 5+ 处 `hover:bg-[#00f2ff]` / `text-[#00f2ff]` 这种硬编码。

**做法**：这条**并入深色化重构一起做**（那份 plan 会统一接 `--color-accent` / `--color-neon-cyan`）。这里只是标注提醒，不单独开工。

---

## 不建议做的事情（避免执行模型过度改造）

明确告诉执行模型**别动**这些：

- ❌ 不要加 `"type": "module"` 到 `package.json`（Next.js 16 默认已经是 ESM）
- ❌ 不要用路由组 `app/(public)/` 重组目录（当前结构清晰，分组反而增加心智负担）
- ❌ 不要扩展 `judgeMove` 支持多手解答（题库结构不支持，改动面巨大）
- ❌ 不要拆 `lib/hooks/` 和 `lib/utils/` 子目录（14 个文件还不值得分层）
- ❌ 不要引入 Jest（如果要加单测就 Vitest，别两个测试框架并存）
- ❌ 不要改任何 `content/messages/*.json` 的 key（i18n 结构稳定，改 key 会波及 4 个语言文件）
- ❌ 不要动 `scripts/validatePuzzles.ts` 的规则（现有规则是数据质量底线）

---

## 执行顺序建议

建议按这个顺序一步步做，每步一个 commit，每步之后都跑 `npm run lint && npm run build`：

1. **P0-1** 数据文件搬家 → commit `refactor: move puzzle data out of lib/`
2. **P1-1** API 错误消息脱敏 → commit `fix: sanitize coach API error responses`
3. **P1-2** sessionStorage 配额保护 → commit `fix: catch sessionStorage quota errors in CoachDialogue`
4. **P1-3** 消息 key 改稳定 id → commit `fix: use stable keys in CoachDialogue message list`
5. **P1-4** 类型强转清理 → commit `refactor: remove redundant type assertion in ReviewClient`
6. **P0-2** `*Client.tsx` 重命名（可选） → commit `refactor: rename *Client.tsx to semantic names`
7. **P0-3** `localized.ts` 并入 `i18n.tsx` → commit `refactor: consolidate i18n utilities`
8. **P2-1** Prettier 接入 → 两个 commit：`chore: add prettier config` + `chore: apply prettier formatting`
9. **P2-4** `.env.example` 补完 → commit `chore: expand .env.example`
10. **P2-3** Vitest + 核心单测 → commit `test: add vitest with core util tests`
11. **P2-2** GitHub Actions CI → commit `ci: add lint/test/build workflow`

P3 暂不做。

---

## 验证清单（交回前必须全绿）

```bash
cd ~/Desktop/go-daily

npm ci
npm run format:check                   # ✅ 0 diff
npm run lint                           # ✅ 0 errors 0 warnings
npx tsc --noEmit                       # ✅ 0 errors
npm run validate:puzzles               # ✅ 1210 puzzles
npm run test                           # ✅ 全绿（新增的 vitest）
npm run build                          # ✅ 1219 pages 生成

# 结构验证
[ ! -f lib/puzzleLibrary.ts ]          # ✅ 已挪走
[ ! -f lib/importedPuzzles.ts ]        # ✅ 已挪走
[ -f content/data/puzzleLibrary.ts ]   # ✅ 在新位置
[ -f content/data/importedPuzzles.ts ] # ✅ 在新位置

# 安全验证
grep -n "\${msg}" app/api/coach/route.ts   # ✅ 0 命中（错误消息不再拼接上游细节）

# CI 验证
[ -f .github/workflows/ci.yml ]        # ✅ CI 文件存在
[ -f .prettierrc ]                     # ✅ Prettier 配置存在
[ -f vitest.config.ts ]                # ✅ Vitest 配置存在
```

人工验证：

- [ ] 本地 `npm run dev`，打开 `/`、`/today`、`/puzzles`、`/puzzles/[id]`、`/review`、`/stats`、`/result` 都正常
- [ ] 打开题目 → 落子 → 判断 → 跳 result 流程无回归
- [ ] Coach 对话能发消息、能收到回复、刷新页面消息还在（sessionStorage）
- [ ] 语言切换四语都能切，刷新不丢失
- [ ] GitHub Actions 推上去后跑绿（如果还没 push 远程，至少本地 `act` 一次或人眼读一遍 yaml）

---

## 审核时我会重点看什么

执行完交回来 Frank 让我看，我会：

1. **跑完整个验证清单**，任何一项不绿都打回
2. **读 `.github/workflows/ci.yml`**，看有没有少 typecheck 或 validate 步骤
3. **读新加的 `*.test.ts`**，看测试覆盖的 case 是否合理（不是硬凑通过）
4. **读 `app/api/coach/route.ts`** 的错误分支，确认没有向客户端泄露上游 msg
5. **看 `git log --oneline`**，commit 序列是否按建议的 11 条走，粒度是否合理（没有把多个改动合成一个大 commit）
6. **看 `npm run build` 的输出**，静态页数还是 1219（没掉题），包体积无恶化
7. **对比 `lib/` 目录的干净度**——大数据文件确实不在 `lib/` 了

只要 P0+P1 全绿，P2 至少完成 Prettier 和 CI，就算过关。P2-3（Vitest）如果因时间紧张没做完，**最少**要有 `board.test.ts` 和 `judge.test.ts` 两个文件。

---

## 和另一份 `go-daily-homepage-redesign.md` 的关系

两份文档独立执行。**先跑这份（结构/质量/工程化）再跑那份（深色化 + 主页）**，原因：

- P0-1 的数据搬家如果放在深色化之后做，会让深色化的 diff 里混进大量无关路径变化，评审痛苦
- P2-2 的 CI 先接好，深色化后推上去就有自动验证兜底
- P1-1 的安全修复跟视觉改造无关，单独做不会被回退的风险污染

如果实在要并行，至少保证 P0-1 + P1-1 两条先落地，其他可以和深色化交叠。
