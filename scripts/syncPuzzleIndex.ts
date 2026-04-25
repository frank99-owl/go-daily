import fs from "fs";
import path from "path";

import { PUZZLES, buildPuzzleSummaries } from "../content/puzzles.server";

const OUTPUT_PATH = path.join(process.cwd(), "content/data/puzzleIndex.json");

function main(): void {
  const summaries = buildPuzzleSummaries(PUZZLES);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(summaries), "utf-8");

  console.log(
    `\x1b[32m✓\x1b[0m Synced puzzleIndex.json with ${summaries.length} canonical summaries`,
  );
  console.log(`- Output: ${OUTPUT_PATH}`);
}

main();
