import type { Locale, Puzzle, Stone } from "@/types";

import { computeCropWindow, fullWindow, toWindowCoord } from "./board";
import { localized } from "./localized";

const coordLabel = (c: { x: number; y: number }) => `(${c.x},${c.y})`;

function describePosition(puzzle: Puzzle, userMove: { x: number; y: number }): string {
  const useLocalWindow = puzzle.boardSize === 19;
  const win = useLocalWindow
    ? computeCropWindow(puzzle.boardSize, puzzle.stones, undefined, undefined, userMove)
    : fullWindow(puzzle.boardSize);
  const displayCoord = (c: { x: number; y: number }) =>
    coordLabel(useLocalWindow ? toWindowCoord(c, win) : c);
  const describe = (arr: Stone[]) =>
    arr.length ? arr.map((s) => displayCoord(s)).join(", ") : "(none)";
  const blacks = puzzle.stones.filter((s) => s.color === "black");
  const whites = puzzle.stones.filter((s) => s.color === "white");
  const solution = puzzle.correct.map((c) => displayCoord(c)).join(", ");
  const visibleBoardSize = win.xMax - win.xMin + 1;
  return [
    useLocalWindow
      ? `Underlying board size: ${puzzle.boardSize}x${puzzle.boardSize}. The student currently sees a cropped ${visibleBoardSize}x${visibleBoardSize} local board window.`
      : `Board size: ${puzzle.boardSize}x${puzzle.boardSize}.`,
    "Use only the displayed local 0-indexed (x,y) coordinates from the student's current view.",
    `Black stones on board: ${describe(blacks)}.`,
    `White stones on board: ${describe(whites)}.`,
    `To play: ${puzzle.toPlay}.`,
    `Accepted correct point(s): ${solution}.`,
    `Tag: ${puzzle.tag}. Difficulty: ${puzzle.difficulty}/5.`,
  ].join("\n");
}

// 4-locale system prompt factory. The `solutionNote` is treated as ground
// truth so the model doesn't fabricate tactics. `userMove` and `isCorrect`
// are baked into the prompt so the model has full context no matter what
// the student asks first.
export function buildSystemPrompt(
  puzzle: Puzzle,
  locale: Locale,
  userMove: { x: number; y: number },
  isCorrect: boolean,
): string {
  const parts = [
    "You are the AI coach for go-daily, a daily Go puzzle website.",
    "You are a friendly, encouraging Go (weiqi / baduk) coach.",
    "Use a Socratic tone: if the student is right, affirm and deepen; if wrong, diagnose the misread and guide them back with a hint — do NOT immediately give the answer unless asked.",
    "Keep replies short: 2–4 short paragraphs, no lists unless helpful.",
    "You are given the exact position and the accepted solution point(s). Treat the 'Accepted correct point(s)' and the 'Solution note' as ground truth. Never contradict them; never invent new solutions.",
    "Do not casually describe the visible board as a full 19x19 board if the UI is only showing a cropped local corner. Focus on the local shape first.",
    "If you mention coordinates, use the exact (x,y) format used in the UI. Do not switch to letter-number Go notation unless the student explicitly asks for it.",
    "If the student asks about a variation you're unsure about, say so honestly and defer to the solution note.",
    "The student has already submitted a move — answer their questions about it (or about the shape) naturally. Do NOT pre-empt with an unsolicited critique; wait for what they actually ask.",
    "",
    "--- POSITION ---",
    describePosition(puzzle, userMove),
    "",
    "--- STUDENT'S MOVE ---",
    `Move: ${
      puzzle.boardSize === 19
        ? coordLabel(
            toWindowCoord(
              userMove,
              computeCropWindow(puzzle.boardSize, puzzle.stones, undefined, undefined, userMove),
            ),
          )
        : coordLabel(userMove)
    } — ${isCorrect ? "CORRECT" : "INCORRECT"}.`,
  ];

  const useLocalWindow = puzzle.boardSize === 19;
  const win = useLocalWindow
    ? computeCropWindow(puzzle.boardSize, puzzle.stones, undefined, undefined, userMove)
    : fullWindow(puzzle.boardSize);
  const displayCoord = (c: { x: number; y: number }) =>
    coordLabel(useLocalWindow ? toWindowCoord(c, win) : c);

  if (puzzle.solutionSequence?.length) {
    parts.push(
      "",
      "--- SOLUTION SEQUENCE (ground truth) ---",
      puzzle.solutionSequence
        .map((s, i) => `Step ${i + 1}: ${s.color} ${displayCoord(s)}`)
        .join("\n"),
    );
  }

  if (puzzle.wrongBranches?.length) {
    parts.push(
      "",
      "--- COMMON WRONG BRANCHES ---",
      puzzle.wrongBranches
        .map(
          (wb) =>
            `If student plays ${displayCoord(wb.userWrongMove)}: ${wb.refutation.map((s) => `${s.color} ${displayCoord(s)}`).join(", ")}`,
        )
        .join("\n"),
    );
  }

  parts.push(
    "",
    "--- SOLUTION NOTE (ground truth, in the student's language) ---",
    localized(puzzle.solutionNote, locale),
  );

  const common = parts.join("\n");

  const byLocale: Record<Locale, string> = {
    zh: [
      "请务必用中文（简体）回答。",
      "可以自然地使用围棋术语：尖冲、打入、本手、急所、先手、手筋、做眼、扑、接、渡等。",
      "口吻友好，不要说教。",
    ].join("\n"),
    en: [
      "Reply in English.",
      "You may naturally use Go terms: atari, sente/gote, aji, tesuji, shape, eye, vital point, hane, nobi, keima.",
      "Warm, not preachy.",
    ].join("\n"),
    ja: [
      "必ず日本語で答えてください。",
      "自然に囲碁用語を使ってください：ツケ、ノビ、ハネ、コスミ、急所、先手・後手、ヨセ、手筋、欠け眼。",
      "親しみやすく、上から目線にならないように。",
    ].join("\n"),
    ko: [
      "반드시 한국어로 답하세요.",
      "바둑 용어를 자연스럽게 사용하세요: 급소, 사석, 선수/후수, 호구, 건너붙임, 끝내기, 맥.",
      "친근하고 설교조가 아닌 톤으로.",
    ].join("\n"),
  };

  return `${common}\n\n--- STYLE ---\n${byLocale[locale]}`;
}
