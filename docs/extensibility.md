# 可扩展性指南

> 对应英文版：[extensibility.en.md](./extensibility.en.md)

---

## 目录

1. [规模阶段总览](#1-规模阶段总览)
2. [题目数据扩展](#2-题目数据扩展)
3. [每日轮换扩展](#3-每日轮换扩展)
4. [客户端存储扩展](#4-客户端存储扩展)
5. [构建与部署扩展](#5-构建与部署扩展)
6. [AI 教练扩展](#6-ai-教练扩展)
7. [i18n 扩展](#7-i18n-扩展)
8. [扩展检查清单](#8-扩展检查清单)

---

## 1. 规模阶段总览

| 阶段       | 题目数量       | 主要瓶颈                                           | 推荐应对                         |
| ---------- | -------------- | -------------------------------------------------- | -------------------------------- |
| **当前**   | ~1 210         | 无明显瓶颈                                         | 维持现状                         |
| **阶段 A** | 100 → 1 000    | 首屏 JS 体积（全量 import）                        | 拆分文件 + 按需加载              |
| **阶段 B** | 1 000 → 10 000 | `generateStaticParams` 超时；localStorage 逼近上限 | 数据库 + API；IndexedDB          |
| **阶段 C** | 10 000+        | 搜索 / 过滤全在客户端，无法承受                    | 服务端搜索（全文索引）；CDN 题图 |

---

## 2. 题目数据扩展

### 2.1 当前架构

```
content/puzzles/index.ts
  └─ export const PUZZLES: Puzzle[] = [...]  // 全量数组，构建时打入 JS bundle
```

所有页面通过 `import { PUZZLES } from "@/content/puzzles"` 静态引入全部题目。

### 2.2 阶段 A（~1 000 题）：按文件分组

**目标**：减小首屏 bundle；题目文件易于维护。

```
content/puzzles/
  life-death/
    ld1.ts   ld2.ts  ...
  tesuji/
    ts1.ts   ...
  index.ts   // 懒聚合：export const PUZZLES = [...ld1, ...ld2, ...]
```

构建期 `PUZZLES` 仍是完整数组，但每个分组文件独立，方便团队并行编写。

若需按需加载（如题库页）：

```ts
// app/puzzles/page.tsx
import dynamic from "next/dynamic";
const PuzzleListClient = dynamic(() => import("./PuzzleListClient"), { ssr: false });
```

### 2.3 阶段 B（~10 000 题）：外部数据源

**目标**：摆脱 JS bundle 限制，实现增量更新。

推荐方案：

1. **SQLite + Turso**（边缘数据库，零运维）：
   - 每题一行，全字段 JSON 存储或拆列
   - Next.js Route Handler 提供 `/api/puzzles?tag=&difficulty=&page=` 分页接口
   - 题库页改为客户端分页请求

2. **`generateStaticParams` 改为增量静态再生（ISR）**：

   ```ts
   // app/puzzles/[id]/page.tsx
   export const revalidate = 86400; // 每日重新生成
   // 不再枚举全量 PUZZLES；改用 fallback: "blocking"
   ```

3. **全文搜索**：使用 [Fuse.js](https://fusejs.io/)（客户端，适合 ≤5 000 题）或 [MeiliSearch](https://www.meilisearch.com/)（服务端）。

### 2.4 批量导入

使用 `scripts/importTsumego.ts`（`npm run import:puzzles`）从 SGF 批量生成题目。  
导入的题目请设 `isCurated: false` 以禁用 AI 教练，避免幻觉。  
详见 [puzzle-authoring.md](./puzzle-authoring.md)。

---

## 3. 每日轮换扩展

### 3.1 当前算法

```ts
// lib/puzzleOfTheDay.ts
const ANCHOR = new Date("2026-04-18");
const dayIndex = Math.floor((today - ANCHOR) / 86_400_000);
const puzzle = PUZZLES[dayIndex % PUZZLES.length];
```

- 锚点固定，日期确定则题目确定——任意客户端无需联网即可计算
- 1 210 题循环一次约 3.3 年

### 3.2 扩展到 1 000+ 题

无需改动算法，`PUZZLES.length` 增大后自动延长循环。

注意：

- `PUZZLES` 数组**顺序即展示顺序**，批量导入时建议先打乱（`scripts/importTsumego.ts` 中可加 Fisher–Yates shuffle）
- 若要保证「每日一题不重复」超过 `n` 天，题库需有 `n` 题以上

### 3.3 服务端调度（阶段 B+）

若要运营一个「每日精选」编辑流程：

1. 数据库增加 `scheduledDate` 列（可 null）
2. Route Handler `GET /api/daily` 按 `scheduledDate = today` 查询
3. 编辑后台预排未来 7 天的每日题目

---

## 4. 客户端存储扩展

### 4.1 当前实现

`localStorage["go-daily.attempts"]` → `AttemptRecord[]` JSON  
每条约 100 字节；100 条约 10 KB；10 000 条约 1 MB。

### 4.2 阶段 A（~1 000 条）：滚动窗口裁剪

在 `lib/storage.ts` 中加入：

```ts
const MAX_RECORDS = 2000;

export function saveAttempt(record: AttemptRecord): void {
  const all = loadAttempts();
  all.push(record);
  // 保留最新 MAX_RECORDS 条，丢弃最旧的
  const trimmed = all.length > MAX_RECORDS ? all.slice(all.length - MAX_RECORDS) : all;
  window.localStorage.setItem(KEY, JSON.stringify(trimmed));
}
```

> ⚠️ 裁剪会影响长期统计精度（连续天数、总准确率）。可先只裁剪正确率已确定的题目（`correct: true` 且超过 180 天）。

### 4.3 阶段 B（~10 000+ 条）：迁移到 IndexedDB

使用 [idb](https://github.com/jakearchibald/idb) 库（3 KB gzip）：

```ts
import { openDB } from "idb";
const db = await openDB("go-daily", 1, {
  upgrade(db) {
    const store = db.createObjectStore("attempts", { autoIncrement: true });
    store.createIndex("puzzleId", "puzzleId");
    store.createIndex("date", "date");
  },
});
```

API 保持与 `lib/storage.ts` 一致（相同函数签名），上层组件无需改动。

### 4.4 云同步（可选）

如需跨设备同步，可接入 Clerk + Supabase：

- 用户登录后将本地记录 `POST /api/sync`，后端合并去重
- 页面初始化时 `GET /api/attempts` 覆盖本地

---

## 5. 构建与部署扩展

### 5.1 `generateStaticParams` 热点

当前：

```ts
// app/puzzles/[id]/page.tsx
export async function generateStaticParams() {
  return PUZZLES.map((p) => ({ id: p.id }));
}
```

1 000 题 → 构建时生成 1 000 个静态页，约 1–2 分钟，可接受。  
10 000 题 → 需改用 ISR（参见第 2.3 节）。

### 5.2 图片资产

大量棋盘截图（PNG/WebP）可放 `public/boards/`，用 Next.js `<Image>` 组件自动优化。  
更大规模时改用 CDN（Cloudflare Images / Vercel Blob）。

### 5.3 `prebuild` 验证

```json
"prebuild": "npm run validate:puzzles"
```

阶段 B 数据外置后，验证脚本需改为连接数据库而非 import 文件。

---

## 6. AI 教练扩展

### 6.1 当前限制

| 限制       | 描述                                            |
| ---------- | ----------------------------------------------- |
| 速率限制   | 进程内存，重启即清零；不持久                    |
| 模型       | `deepseek-chat`，固定                           |
| 仅进程内存 | 多实例部署（Vercel Serverless）时各实例独立计数 |

### 6.2 阶段 A：持久化速率限制

用 [Upstash Redis](https://upstash.com/) 替换 `hits: Map`：

```ts
import { Redis } from "@upstash/redis";
const redis = Redis.fromEnv();

async function rateLimited(ip: string): Promise<boolean> {
  const key = `rl:${ip}:${Math.floor(Date.now() / 60_000)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 120);
  return count > RATE_LIMIT_MAX;
}
```

### 6.3 阶段 B：模型切换 / 降级

`app/api/coach/route.ts` 中模型名写死为 `"deepseek-chat"`。  
建议改为环境变量：

```
COACH_MODEL=deepseek-chat          # 默认
COACH_MODEL=deepseek-reasoner      # 高难度题目
```

Route Handler 读取：

```ts
const model = process.env.COACH_MODEL ?? "deepseek-chat";
```

---

## 7. i18n 扩展

详见 [i18n.md](./i18n.md)。关键扩展要点：

- **新增语言**：在 `content/messages/` 新增 JSON，在 `lib/i18n.tsx` 的 `DICTS` 中注册，在 `types/index.ts` 的 `Locale` 中添加。
- **新增翻译 key**：在 `en.json` 中添加，TypeScript 的 `type Messages = typeof en` 会自动要求其他语言文件补全（编译期报错）。
- **`lib/i18n.tsx`**：回退链 `en → zh → ja → ko`（`localized()` 函数），新语言加入时需更新 `FALLBACK_ORDER`。

---

## 8. 扩展检查清单

在数据量或功能增长时，按需完成：

- [ ] 100 → 1 000 题：拆分 `content/puzzles/` 目录
- [ ] 1 000 → 10 000 题：外接数据库，`generateStaticParams` 改 ISR
- [ ] 作答记录 > 2 000 条：加滚动裁剪或迁移至 IndexedDB
- [ ] 多实例部署：速率限制改用 Redis
- [ ] AI 教练模型：改为环境变量可配置
- [ ] 跨设备同步需求：接入用户认证 + 云存储

---

_相关文档：[architecture.md](./architecture.md) · [data-schema.md](./data-schema.md) · [puzzle-authoring.md](./puzzle-authoring.md)_
