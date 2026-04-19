# go-daily · 主页重设计 + 全项目深色化 · 执行方案

## Context

Frank 用 Stitch / 手写 HTML 做了一版主页视觉方案（桌面文件 `The Intelligence of the Grid.html`）：深黑 + 霓虹青 + Lora 衬线 + 玻璃拟态导航 + 自定义光标，氛围是"静默的古老棋盘 + 神经网络未来感"。项目 `go-daily` 目前是浅色极简东方风格，与新视觉不符。本次要做三件事：

1. **把项目整体从浅色迁到新深色设计系统**（全部页面，不分阶段）。
2. **用新风格重写主页**，分两屏：第一屏英雄段落（hero），往下滑动丝滑过渡到第二屏。
3. **第二屏是一个自动演示棋盘**，播放 2016 年李世石 vs AlphaGo 第 4 局 176 手。进入第二屏时直接显示第 78 手（李世石 L11 "神之一手"）的完整盘面，停留 3 秒后清盘从第 1 手开始逐手播放，走完 176 手停在终局。

**这份方案交给另一个模型按部就班执行。执行完 Frank 会拿回项目让我审核。**只做桌面端，不考虑移动端响应式（Frank 明确不需要）。

---

## 素材清单

- SGF 棋谱：`/Users/frank/Desktop/李世石_vs_AlphaGo_2016/第4局_李世石_vs_AlphaGo_20160313.sgf`（176 手，已验）
- 主页参考：`/Users/frank/Desktop/The Intelligence of the Grid.html`
- 棋盘查看器参考（只看交互/坐标逻辑）：`/Users/frank/Desktop/李世石_vs_AlphaGo_2016/第4局_棋谱查看器.html`

第 78 手是 `W[ki]`（SGF 坐标 x=10, y=8，即围棋标记 L11），高亮这一手。

---

## Part 1：设计系统迁移（全局基础）

### 1.1 改 `app/globals.css` 的 `@theme`

把现有浅色 token 整套换成下表。保留变量名即可最小侵入：

| Token                | 旧值（浅色）      | 新值（深色）             |
| -------------------- | ----------------- | ------------------------ |
| `--color-paper`      | `#faf9f4`         | `#0A0A0A`                |
| `--color-ink`        | `#1a1a1a`         | `#EDEAE2`                |
| `--color-line`       | `#e4e2d6`         | `rgba(255,255,255,0.08)` |
| `--color-accent`     | `#0d9488`（teal） | `#00F2FF`（neon-cyan）   |
| `--color-board`      | `#e8c594`         | `#1F1611`（深木纹）      |
| `--color-board-line` | 原木纹暗棕        | `rgba(0,242,255,0.28)`   |
| `--color-stone-b`    | 黑                | 黑 `#0A0A0A`             |
| `--color-stone-w`    | 白                | 偏暖白 `#EEEAE0`         |
| 新增 `--color-linen` | –                 | `#E3DCCB`                |
| 新增 `--color-earth` | –                 | `#4A3728`                |

### 1.2 字体

`app/layout.tsx` 里把 Playfair Display 换成 **Lora**（Google Font）。正文保留 Inter。CSS 变量改名：

- `--font-headline` → Lora
- `--font-body` → Inter
- `--font-label` → Inter（新增，用于小字 uppercase tracking）

### 1.3 自定义光标（全局）

新建 `components/GlobalCursor.tsx`（client component），迁移主页参考里的 `.custom-cursor` + `.cursor-glow` + mousemove 逻辑，挂到 `layout.tsx` 的 `<body>` 下。默认 body 加 `cursor: none`，link/button hover 时 cursor 变大 + cyan 描边。

---

## Part 2：主页 · 第一屏（Hero）

### 2.1 替换 `app/page.tsx`

现在 `app/page.tsx` 是 `TodayClient`。改为新的双屏主页：

```
<main class="snap-y snap-mandatory h-screen overflow-y-scroll">
  <HeroSection />        // 第一屏，min-h-screen, snap-start
  <BoardShowcase />      // 第二屏，min-h-screen, snap-start
</main>
```

**TodayClient 不删**：挪到 `/today` 路由下（新建 `app/today/page.tsx`，内容是 `<TodayClient />`）。Nav 里的 "Today" 链接改指向 `/today`。

### 2.2 新建 `components/HeroSection.tsx`

完全复刻参考 HTML 的 hero：

- 全屏背景图（先用参考 HTML 里那张 googleusercontent 的占位图；Frank 之后可以替换成本地图）
- 左侧大标题 `The Intelligence` + `of the Grid`（italic）
- 副文案（Inter，白 60% 透明）
- 两个 CTA：`Get Started` → 跳 `/today`；`Watch Match` → `scrollIntoView` 到第二屏
- 右渐变黑遮罩

### 2.3 新建 `components/HomeNav.tsx`

主页专用 nav（覆盖默认 Nav）：玻璃拟态、极细字母间距、跳 Lobby/Library/Training/Analytics（对应 `/today`、`/puzzles`、`/review`、`/stats`）。主页 layout 里用 `HomeNav` 替换全局 `Nav`。

---

## Part 3：主页 · 第二屏（AlphaGo 演示棋盘）

### 3.1 新建 `lib/sgf.ts`

纯函数 `parseSgfMoves(sgf: string): Move[]`，其中 `Move = { color: "black"|"white"; coord: Coord }`。只解析 `;B[xx]` / `;W[xx]` 序列，跳过分支。SGF 坐标 → 项目坐标（左上原点，已有 `sgfToCoord` 可抄）。

### 3.2 新建 `lib/goRules.ts`

纯函数的提子引擎：

```ts
playMove(board: Map<string, Color>, move: Move): {
  board: Map<string, Color>;
  captured: Coord[];
}
```

算法（伪码）：

```
placed = board.clone(); placed.set("x,y", color)
captured = []
for each 4-neighbor n of move.coord where placed.get(n) === opposite(color):
  group, liberties = floodFill(placed, n)      // 同色连通 + 空邻格数
  if liberties.size === 0:
    for g in group: placed.delete(g); captured.push(g)
return { board: placed, captured }
```

自杀检查可略（职业对局不存在）。坐标用字符串 `"x,y"` 做 Map 键。

### 3.3 新建 `lib/gameSnapshots.ts`

```ts
type Snapshot = { stones: Stone[]; lastMove: Coord | null; moveNumber: number };
buildSnapshots(moves: Move[]): Snapshot[]    // 长度 = moves.length + 1，第 0 个是空盘
```

第 4 局 176 手，一次性构建 177 个快照。

### 3.4 新建 `content/games/leeAlphagoG4.ts`

```ts
export const LEE_ALPHAGO_G4_SGF = `(;FF[4]GM[1]SZ[19]...`; // 原文贴进来
export const LEE_ALPHAGO_G4_META = {
  date: "2016-03-13",
  venue: "Four Seasons Hotel, Seoul",
  black: "AlphaGo",
  white: "Lee Sedol (9p)",
  result: "W+R",
  godMoveNumber: 78, // "神之一手"
  totalMoves: 176,
};
```

### 3.5 新建 `components/DemoGameBoard.tsx`（client）

Props：

```ts
{
  snapshots: Snapshot[];
  startAtMove: number;         // 78
  holdMs: number;              // 3000
  stepMs: number;              // 700
  godMoveNumber: number;       // 78
  active: boolean;             // 由 IntersectionObserver 控制
}
```

状态机：

```
active=false                  → phase=idle,   render snapshots[78] 静态
active=true 首次               → phase=showGod, render snapshots[78] + cyan pulse
  setTimeout(holdMs)          → phase=playing, index=0, render snapshots[0]
    setInterval(stepMs) tick  → index++;      render snapshots[index]
      index === totalMoves    → clearInterval, phase=ended, 停在终局
离开视口 (active=false)        → 清 timer, 回 idle
```

内部调用扩展后的 `<GoBoard>`（见 Part 4），传 `stones = snapshot.stones`、`highlight` 按 phase 计算、`lastMove = snapshot.lastMove`。

神之一手的青色脉冲用绝对定位的 div + framer-motion（不混进 Canvas），避免重绘开销。

### 3.6 新建 `components/BoardShowcase.tsx`

第二屏整体布局（桌面）：

```
<section class="min-h-screen snap-start flex items-center">
  <div class="grid grid-cols-[1fr_560px] gap-20 max-w-7xl mx-auto px-12">
    <div>  // 左侧文案
      <small>2016.03.13 · DEEPMIND CHALLENGE · GAME 4</small>
      <h2>Move 78.<br/>The Divine Move.</h2>
      <p>（2-3 行背景讲 Lee Sedol 翻盘）</p>
      <HUD>   // 当前手数 078 / 176 + 阶段（回放 / 神之一手 / 终局）
    </div>
    <DemoGameBoard ... />
  </div>
</section>
```

IntersectionObserver（threshold 0.4）挂在 section 上，切 `active`。

---

## Part 4：GoBoard 深色扩展

`components/GoBoard.tsx` 加三个**可选** props，现有调用处不受影响：

- `boardStyle?: "classic" | "dark"`（默认 `classic` 保留浅色木纹给迁移过渡期；`dark` 用 `--color-board` / `--color-board-line`）
- `moveNumbers?: Map<string, number>`：Stone 坐标 → 手数标号，在石子中心画数字（黑子白字、白子黑字）。DemoGameBoard 从快照反推最近 8 手生成。
- `highlightColor?: string`：默认走 `--color-accent`，DemoGameBoard 可传 `"#00F2FF"` 显式高亮神之一手。

---

## Part 5：Nav 重做（全局统一）

改 `components/Nav.tsx`：

- 玻璃拟态：`fixed top-0 w-full bg-black/10 backdrop-blur-xl border-b border-white/5`
- 品牌名 "GO-DAILY"，Lora light，字母间距 0.2em
- 链接改 uppercase tracking-[0.25em] text-[10px] font-light，hover 青色
- 语言切换器保留但重画配色
- 右侧加 Material Symbols 的 notifications / settings 图标（装饰）

> 注意：主页用 `HomeNav`（Part 2.3），其他页面继续用这个改过的全局 `Nav`。两者视觉一致，只是 HomeNav 加了品牌化 CTA "Play Match"。

---

## Part 6：其他页面深色迁移

所有页面继承 `@theme` 的新 token 后大部分卡片自动深色化，但**逐一人工过一遍**：

| 文件                                 | 检查点                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `app/today/page.tsx` + `TodayClient` | 大棋盘外壳配色，按钮从 teal 变 cyan                                         |
| `app/puzzles/PuzzleListClient.tsx`   | 卡片背景 `bg-white` → `bg-white/5`，边框 `border-line`，hover `bg-white/10` |
| `app/review/ReviewClient.tsx`        | 同上                                                                        |
| `app/stats/StatsClient.tsx`          | 统计卡 + 热力图颜色梯度改 cyan 系                                           |
| `app/puzzles/[id]/*`                 | 详情页棋盘用 `boardStyle="dark"`                                            |
| `app/result/ResultClient.tsx`        | 成功/失败颜色：success 保绿但调亮、失败用 `#FF3366`；framer-motion 参数不动 |
| `content/messages/*.json`            | 不改，现有文案继续用                                                        |

GoBoard 调用全部显式加 `boardStyle="dark"`。

---

## Part 7：滚动过渡细节

- `main` 用 `scroll-snap-type: y mandatory` + 两个子 section `scroll-snap-align: start`。
- 过渡用 CSS `scroll-behavior: smooth`（全局加在 `html`）。
- 第一屏底部加一个下箭头（Material Symbols `keyboard_arrow_down`）脉冲动画，暗示可下滑，点击 → `scrollIntoView({ behavior: 'smooth' })` 到第二屏。

---

## Part 8：文件清单

### 新建

| 文件                            | 职责                            |
| ------------------------------- | ------------------------------- |
| `lib/sgf.ts`                    | SGF move 序列解析               |
| `lib/goRules.ts`                | 提子引擎                        |
| `lib/gameSnapshots.ts`          | 快照数组构建                    |
| `content/games/leeAlphagoG4.ts` | SGF 字符串 + 对局元数据         |
| `components/HeroSection.tsx`    | 主页第一屏                      |
| `components/BoardShowcase.tsx`  | 主页第二屏容器                  |
| `components/DemoGameBoard.tsx`  | 棋盘播放控制                    |
| `components/HomeNav.tsx`        | 主页专用导航                    |
| `components/GlobalCursor.tsx`   | 自定义光标 + 光晕               |
| `app/today/page.tsx`            | 把原 `<TodayClient />` 挪到这里 |

### 修改

| 文件                                                  | 修改                                                     |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `app/globals.css`                                     | `@theme` token 换深色                                    |
| `app/layout.tsx`                                      | 字体换 Lora、挂 `<GlobalCursor />`                       |
| `app/page.tsx`                                        | 换成 `<HeroSection /> + <BoardShowcase />` 两屏          |
| `components/Nav.tsx`                                  | 玻璃拟态、配色、排版                                     |
| `components/GoBoard.tsx`                              | 加 `boardStyle` / `moveNumbers` / `highlightColor` props |
| 各 `*Client.tsx`（puzzles / review / stats / result） | 卡片 / 按钮配色                                          |

### 不动

`lib/importedPuzzles.ts`、`lib/puzzleLibrary.ts`、`types/index.ts`、`lib/board.ts`、`lib/judge.ts`、`lib/i18n.tsx`、`content/messages/*.json`、`content/puzzles.ts`、`scripts/*`。

---

## Part 9：验证清单

执行完按顺序跑：

```bash
cd ~/Desktop/go-daily
npm run validate:puzzles       # 应 1210 通过
npm run lint                   # 0 errors 0 warnings
npm run build                  # 全部静态页生成
npm run dev                    # 本地 :3000
```

**人工验证**：

- [ ] `/` 打开是深色 Hero，背景图 + 大标题 "The Intelligence of the Grid"
- [ ] 鼠标移动有白点 + 青色光晕跟随，hover 链接时光标变大
- [ ] 滚动丝滑切到第二屏，棋盘显示第 78 手整个盘面（约 80 颗子），L11 位置青色脉冲
- [ ] 停 3 秒后棋盘清空，从第 1 手开始一手一手落，最近几手有数字标号
- [ ] 走到第 176 手停住（白中盘胜）
- [ ] 离开第二屏回第一屏再回来，动画从第 78 手 hold 重新开始（不是接着上次继续）
- [ ] `/today`、`/puzzles`、`/review`、`/stats`、`/puzzles/[id]`、`/result` 全部深色化，无浅色残留
- [ ] 所有 GoBoard 是深色木纹 + 青色辅助线
- [ ] Nav 在所有页面都是玻璃拟态深色
- [ ] 语言切换四语正常
- [ ] 现有题目解题流程（点击棋盘落子 → 判对错 → 跳 result）没被破坏

---

## Part 10：已决策点速查

| 问题               | 决定                                    |
| ------------------ | --------------------------------------- |
| 其他页面是否深色化 | ✅ 全部深色化                           |
| 176 手播完怎么办   | ✅ 停在终局（白中盘胜）                 |
| 移动端响应式       | ❌ 不做（只桌面）                       |
| 自定义光标         | ✅ 全局启用                             |
| 字体               | Lora（标题）+ Inter（正文）             |
| 神之一手高亮       | 青色脉冲 overlay，不混 Canvas           |
| 每手间隔           | 700ms                                   |
| 第 78 手 hold 时长 | 3000ms                                  |
| 提子逻辑           | 一次性构建 177 个快照，运行时 O(1) 切换 |
