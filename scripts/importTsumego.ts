/**
 * Import classical tsumego from sanderland/tsumego (MIT).
 *
 * Source format (per problem, tiny JSON):
 *   { "AB": ["eb","fb", ...],   // Black stones, SGF coords (a=0, b=1, ...)
 *     "AW": ["da","ab", ...],   // White stones
 *     "SZ": "19",               // Board size
 *     "C":  "Black to play: Elementary",
 *     "SOL": [ ["B","ba","Correct.",""] ] }  // First correct move
 *
 * We convert to our Puzzle type with `isCurated: false` — these are bulk
 * imports without hand-authored 4-language solution notes, so the AI coach
 * stays gated off for them (see result page) to avoid hallucination.
 *
 * Run:
 *   npx tsx scripts/importTsumego.ts
 */
import fs from "fs";
import path from "path";

const OUTPUT = path.join(process.cwd(), "lib/importedPuzzles.ts");

const COLLECTION =
  "Cho Chikun Encyclopedia Life And Death - Elementary";
const CATEGORY = "1a. Tsumego Beginner";
const SOURCE_LABEL = "Cho Chikun · Life & Death · Elementary";
const HOW_MANY = 100;

// -------- Source JSON shape --------
type SourceSol = [string, string, string, string]; // [color, coord, note, ""]
interface SourceProblem {
  AB?: string[];
  AW?: string[];
  SZ?: string;
  C?: string;
  SOL?: SourceSol[];
}

// -------- Our Puzzle shape (keep aligned with types/index.ts) --------
type Color = "black" | "white";
interface Stone {
  x: number;
  y: number;
  color: Color;
}
interface Coord {
  x: number;
  y: number;
}
interface LocalizedText {
  zh: string;
  en: string;
  ja: string;
  ko: string;
}
interface ImportedPuzzle {
  id: string;
  date: string;
  boardSize: 9 | 13 | 19;
  stones: Stone[];
  toPlay: Color;
  correct: Coord[];
  tag: "life-death" | "tesuji" | "endgame" | "opening";
  difficulty: 1 | 2 | 3 | 4 | 5;
  prompt: LocalizedText;
  solutionNote: LocalizedText;
  isCurated: false;
  source: string;
}

// SGF-ish coord "eb" → { x: 4, y: 1 }  (a=0, b=1, ..., s=18)
function sgfToCoord(s: string): Coord {
  return { x: s.charCodeAt(0) - 97, y: s.charCodeAt(1) - 97 };
}

function parseStones(arr: string[] | undefined, color: Color): Stone[] {
  if (!arr) return [];
  return arr.map((s) => ({ ...sgfToCoord(s), color }));
}

function buildPrompt(toPlay: Color): LocalizedText {
  return toPlay === "black"
    ? {
        zh: "黑先，找到正确的急所",
        en: "Black to play — find the vital point",
        ja: "黒先、急所を見つけてください",
        ko: "흑선 — 급소를 찾으세요",
      }
    : {
        zh: "白先，找到正确的急所",
        en: "White to play — find the vital point",
        ja: "白先、急所を見つけてください",
        ko: "백선 — 급소를 찾으세요",
      };
}

// Generic note. The coach is gated off for imports, so this only shows
// on the result page below the solution markers.
function buildSolutionNote(): LocalizedText {
  return {
    zh: "经典死活题。点击「查看正解」可以看到标记出的急所位置。",
    en: "Classical life-and-death problem. Tap 'View solution' to see the vital point highlighted on the board.",
    ja: "古典的な詰碁です。「正解を見る」を押すと盤上に急所が示されます。",
    ko: "고전 사활 문제. '정답 보기'를 누르면 반 위에 급소가 표시됩니다.",
  };
}

async function fetchProblemList(): Promise<string[]> {
  const url = `https://api.github.com/repos/sanderland/tsumego/contents/problems/${encodeURIComponent(
    CATEGORY,
  )}/${encodeURIComponent(COLLECTION)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "go-daily-importer" },
  });
  if (!res.ok) throw new Error(`List failed: ${res.status}`);
  const list = (await res.json()) as Array<{
    name: string;
    download_url: string;
  }>;
  return list
    .filter((f) => f.name.endsWith(".json"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, HOW_MANY)
    .map((f) => f.download_url);
}

async function fetchOne(url: string): Promise<SourceProblem> {
  const res = await fetch(url, {
    headers: { "User-Agent": "go-daily-importer" },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
  return (await res.json()) as SourceProblem;
}

function convert(raw: SourceProblem, index: number): ImportedPuzzle | null {
  const sol = raw.SOL?.[0];
  if (!sol) return null; // skip problems without a marked solution
  const solColor = sol[0] === "B" ? "black" : "white";
  const solCoord = sgfToCoord(sol[1]);
  const boardSize: 9 | 13 | 19 =
    raw.SZ === "9" ? 9 : raw.SZ === "13" ? 13 : 19;

  const stones = [
    ...parseStones(raw.AB, "black"),
    ...parseStones(raw.AW, "white"),
  ];

  return {
    id: `cho-e-${String(index + 1).padStart(3, "0")}`,
    date: "2026-04-18", // non-daily — lives in library
    boardSize,
    stones,
    toPlay: solColor,
    correct: [solCoord],
    tag: "life-death",
    difficulty: 1,
    prompt: buildPrompt(solColor),
    solutionNote: buildSolutionNote(),
    isCurated: false,
    source: SOURCE_LABEL,
  };
}

async function main() {
  console.log(`Fetching problem list from ${COLLECTION}…`);
  const urls = await fetchProblemList();
  console.log(`Got ${urls.length} urls, downloading in parallel batches…`);

  const out: ImportedPuzzle[] = [];
  const BATCH = 10;
  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(fetchOne));
    results.forEach((raw, j) => {
      const p = convert(raw, i + j);
      if (p) out.push(p);
    });
    process.stdout.write(`  ${Math.min(i + BATCH, urls.length)}/${urls.length}\r`);
  }
  console.log(`\nImported ${out.length} puzzles.`);

  const byBoardSize: Record<number, number> = {};
  for (const p of out) byBoardSize[p.boardSize] = (byBoardSize[p.boardSize] || 0) + 1;
  console.log("By board size:", byBoardSize);

  const banner = `// Auto-generated by scripts/importTsumego.ts — do not edit by hand.
// Source: https://github.com/sanderland/tsumego (MIT)
// Collection: ${COLLECTION}
// Count: ${out.length}
//
// These puzzles carry \`isCurated: false\` — they have positions + correct
// moves but no hand-authored 4-language solution note. The AI coach is
// gated off for them on the result page to prevent hallucination.

import type { Puzzle } from "@/types";

export const IMPORTED_PUZZLES: Puzzle[] = ${JSON.stringify(out, null, 2)};
`;

  fs.writeFileSync(OUTPUT, banner, "utf-8");
  console.log(`Written to ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
