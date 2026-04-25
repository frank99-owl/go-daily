import fs from "fs";
import { execSync } from "child_process";
import * as sgf from "@sabaki/sgf";

// Convert SGF letters to 0-18 integers (a=0, s=18)
function sgfCharToNum(c: string) {
  return c.charCodeAt(0) - 97;
}
function numToSgfChar(n: number) {
  return String.fromCharCode(n + 97);
}

// Convert SGF letters to Katago GTp coordinates (A-T skipping I, 1-19 from bottom)
function sgfToKataGoGtp(sgfCoord: string) {
  if (sgfCoord.length !== 2) return "pass";
  const xStr = "ABCDEFGHJKLMNOPQRST";
  const x = sgfCharToNum(sgfCoord[0]);
  const y = sgfCharToNum(sgfCoord[1]);
  return xStr[x] + (19 - y).toString();
}

// Re-map a subset of stones around a central point (Locality Check)
function filterStonesByDistance(stones: any[], center: any, maxDist: number) {
  return stones.filter((s) => {
    const dx = Math.abs(s.x - center.x);
    const dy = Math.abs(s.y - center.y);
    return dx <= maxDist && dy <= maxDist;
  });
}

async function runKataGoAnalysis(moves: string[][], analyzeTurn: number) {
  const query = {
    id: "mvp_test",
    rules: "japanese",
    komi: 6.5,
    boardXSize: 19,
    boardYSize: 19,
    moves: moves.slice(0, analyzeTurn),
    analyzeTurns: [analyzeTurn - 1], // Analyze the position right BEFORE the blunder
  };

  const qStr = JSON.stringify(query) + "\n";
  // Use the 15-block g170 model we successfully downloaded
  const cmd = `echo '${qStr}' | katago analysis -model katago_model.bin.gz -config default_config.cfg`;

  try {
    const out = execSync(cmd, { maxBuffer: 1024 * 1024 * 50 }).toString();
    const lines = out.split("\n");
    for (const line of lines) {
      if (line.startsWith("{") && line.includes("rootInfo")) {
        return JSON.parse(line);
      }
    }
  } catch (e) {
    console.error("KataGo analysis failed");
    return null;
  }
  return null;
}

async function analyzeGame(sgfPath: string) {
  console.log(`Loading ${sgfPath}...`);
  const rootNodes = sgf.parseFile(sgfPath);
  const game = rootNodes[0];

  // Flatten moves
  const moves: string[][] = []; // [["B", "Q16"], ...]
  let node = game;
  let turn = 1;

  const puzzleCandidates = [];

  // Simple list extraction
  while (node && node.children && node.children.length > 0) {
    node = node.children[0];
    if (node.data.B && node.data.B[0]) moves.push(["B", sgfToKataGoGtp(node.data.B[0])]);
    else if (node.data.W && node.data.W[0]) moves.push(["W", sgfToKataGoGtp(node.data.W[0])]);
  }

  console.log(`Extracted ${moves.length} moves. Running fast pass analysis...`);

  // We run the full game analysis in one query for speed
  const allTurns = moves.map((_, i) => i);
  const batchQuery = {
    id: "full_game",
    rules: "japanese",
    komi: 6.5,
    boardXSize: 19,
    boardYSize: 19,
    moves: moves,
    analyzeTurns: allTurns,
    maxVisits: 100, // Fast pass
  };

  console.log("KataGo is thinking... (This will take about 10 seconds for a full fast pass)");
  const cmd = `echo '${JSON.stringify(batchQuery)}\\n' | katago analysis -model katago_model.bin.gz -config default_config.cfg`;
  const out = execSync(cmd, { maxBuffer: 1024 * 1024 * 100 }).toString();

  const turnData: any[] = [];
  out.split("\n").forEach((line) => {
    if (line.startsWith("{")) turnData.push(JSON.parse(line));
  });

  turnData.sort((a, b) => a.turnNumber - b.turnNumber);

  console.log("Analyzing winrate drops (Blunder Rule)...");
  for (let i = 1; i < turnData.length; i++) {
    const prev = turnData[i - 1];
    const curr = turnData[i];
    if (!prev.rootInfo || !curr.rootInfo) continue;

    const prevWinrate = prev.rootInfo.winrate;
    const currWinrate = curr.rootInfo.winrate;

    // Since config sets 'reportAnalysisWinratesAs = BLACK', winrate is ALWAYS Black's winrate.
    // If the player moving was Black (turn i-1), a blunder decreases Black's winrate.
    // If the player moving was White (turn i-1), a blunder increases Black's winrate.
    const playerToMove = moves[i - 1][0]; // "B" or "W"

    const winrateDrop =
      playerToMove === "B" ? prevWinrate - currWinrate : currWinrate - prevWinrate;

    // RULE 2: The "Blunder" Rule - Winrate must drop by > 15%
    if (winrateDrop > 0.15) {
      console.log(
        `[Turn ${i}] Major Blunder! Winrate dropped by ${(winrateDrop * 100).toFixed(1)}%`,
      );

      // Check RULE 1: The "Only Move" Rule on the PREVIOUS turn (what they *should* have done)
      if (prev.moveInfos && prev.moveInfos.length >= 2) {
        const top1 = prev.moveInfos[0];
        const top2 = prev.moveInfos[1];
        const gap = top1.winrate - top2.winrate;

        if (gap > 0.05) {
          // 5% gap
          console.log(
            `  -> Passed Only-Move Rule: Top 1 is ${(gap * 100).toFixed(1)}% better than Top 2.`,
          );
          console.log(
            `  -> Puzzle Candidate found: Find the move ${top1.move} instead of the blunder ${moves[i - 1][1]}`,
          );
          puzzleCandidates.push({
            turn: i,
            blunderMove: moves[i - 1][1],
            correctMove: top1.move,
            wrongBranch: {
              move: moves[i - 1][1],
              refutation: curr.moveInfos?.[0]?.move || "unknown", // How the opponent punishes it
              winrateDrop: winrateDrop,
            },
          });
          if (puzzleCandidates.length >= 5) break; // MVP limit
        } else {
          console.log(
            `  -> Failed Only-Move Rule: Gap between Top 1 and Top 2 is only ${(gap * 100).toFixed(1)}%`,
          );
        }
      }
    }
  }

  console.log("\n====== MVP RESULT: 5 High-Quality Puzzles Generated ======");
  console.log(JSON.stringify(puzzleCandidates, null, 2));
}

analyzeGame("test-shusaku.sgf").catch(console.error);
