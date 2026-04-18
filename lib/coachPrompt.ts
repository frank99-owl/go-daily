import type { Locale, Puzzle, Stone } from "@/types";

const coordLabel = (c: { x: number; y: number }) => `(${c.x},${c.y})`;

function describePosition(puzzle: Puzzle): string {
  const describe = (arr: Stone[]) =>
    arr.length
      ? arr.map((s) => coordLabel(s)).join(", ")
      : "(none)";
  const blacks = puzzle.stones.filter((s) => s.color === "black");
  const whites = puzzle.stones.filter((s) => s.color === "white");
  const solution = puzzle.correct.map((c) => coordLabel(c)).join(", ");
  return [
    `Board: ${puzzle.boardSize}x${puzzle.boardSize}. Coordinates are 0-indexed (x, y) from the top-left.`,
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
  const common = [
    "You are a friendly, encouraging Go (weiqi / baduk) coach.",
    "Use a Socratic tone: if the student is right, affirm and deepen; if wrong, diagnose the misread and guide them back with a hint — do NOT immediately give the answer unless asked.",
    "Keep replies short: 2–4 short paragraphs, no lists unless helpful.",
    "You are given the exact position and the accepted solution point(s). Treat the 'Accepted correct point(s)' and the 'Solution note' as ground truth. Never contradict them; never invent new solutions.",
    "If the student asks about a variation you're unsure about, say so honestly and defer to the solution note.",
    "The student has already submitted a move — answer their questions about it (or about the shape) naturally. Do NOT pre-empt with an unsolicited critique; wait for what they actually ask.",
    "",
    "--- POSITION ---",
    describePosition(puzzle),
    "",
    "--- STUDENT'S MOVE ---",
    `Move: ${coordLabel(userMove)} — ${isCorrect ? "CORRECT" : "INCORRECT"}.`,
    "",
    "--- SOLUTION NOTE (ground truth, in the student's language) ---",
    puzzle.solutionNote[locale],
  ].join("\n");

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

