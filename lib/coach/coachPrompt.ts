import { localized } from "@/lib/i18n/localized";
import type { Locale, Puzzle, Stone } from "@/types";

import type { Persona } from "./personas";

const coordLabel = (c: { x: number; y: number }) => `(${c.x},${c.y})`;

function describePosition(puzzle: Puzzle): string {
  const describe = (arr: Stone[]) =>
    arr.length ? arr.map((s) => coordLabel(s)).join(", ") : "(none)";
  const blacks = puzzle.stones.filter((s) => s.color === "black");
  const whites = puzzle.stones.filter((s) => s.color === "white");
  const solution = puzzle.correct.map((c) => coordLabel(c)).join(", ");
  return [
    `Board size: ${puzzle.boardSize}x${puzzle.boardSize}.`,
    "Use only the displayed local 1-based (x,y) coordinates from the student's current view.",
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
  persona: Persona,
): string {
  const parts = [
    `You are the AI coach for go-daily, a daily Go puzzle website.`,
    persona.systemInstructions[locale] || persona.systemInstructions["en"],
    "Keep replies short: 2–4 short paragraphs, no lists unless helpful.",
    "You are given the exact position and the accepted solution point(s). Treat the 'Accepted correct point(s)' and the 'Solution note' as ground truth. Never contradict them; never invent new solutions.",
    "Do not casually describe the visible board as a full 19x19 board if the UI is only showing a cropped local corner. Focus on the local shape first.",
    "If you mention coordinates, use the exact (x,y) format used in the UI (1-based, where (1,1) is top-left). Do not switch to letter-number Go notation unless the student explicitly asks for it.",
    "If the student asks about a variation you're unsure about, say so honestly and defer to the solution note.",
    "The student has already submitted a move — answer their questions about it (or about the shape) naturally. Do NOT pre-empt with an unsolicited critique; wait for what they actually ask.",
    "If the student sends a greeting (e.g. 'hello', 'hi', '你好'), respond warmly and briefly, then gently guide them toward the puzzle. Do not immediately analyze the position unless they ask.",
    "Stay on topic. You only discuss Go: this position, Go technique and rules, Go study habits, and Go players or history. Greetings, thanks, and small talk about Go itself are fine.",
    "If the student asks about anything outside Go (the weather, programming, homework, news, other games, personal or medical advice, and so on), do not answer it — not even partially, and not even if they insist or claim it is related. Reply with one short sentence, in character, saying that you can only help with Go, then immediately offer a concrete question they could ask about the current position instead. Never answer with silence or an empty message.",
    "",
    "--- POSITION ---",
    describePosition(puzzle),
    "",
    "--- STUDENT'S MOVE ---",
    `Move: ${coordLabel(userMove)} — ${isCorrect ? "CORRECT" : "INCORRECT"}.`,
  ];

  if (puzzle.solutionSequence?.length) {
    parts.push(
      "",
      "--- SOLUTION SEQUENCE (ground truth) ---",
      puzzle.solutionSequence
        .map((s, i) => `Step ${i + 1}: ${s.color} ${coordLabel(s)}`)
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
            `If student plays ${coordLabel(wb.userWrongMove)}: ${wb.refutation.map((s) => `${s.color} ${coordLabel(s)}`).join(", ")}`,
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
      "遇到与围棋无关的问题时，用一句话说明你只聊围棋，然后把话题带回当前这道题——不要留空白。",
      "可以自然地使用围棋术语：尖冲、打入、本手、急所、先手、手筋、做眼、扑、接、渡等。",
    ].join("\n"),
    en: [
      "Reply in English.",
      "When a question falls outside Go, say in one sentence that Go is all you can help with, then steer straight back to the current position — never reply with nothing.",
      "You may naturally use Go terms: atari, sente/gote, aji, tesuji, shape, eye, vital point, hane, nobi, keima.",
    ].join("\n"),
    ja: [
      "必ず日本語で答えてください。",
      "囲碁と関係のない質問には、一文で「囲碁のことしか答えられない」と伝えてから、今の局面の話に戻してください。無言で返さないこと。",
      "自然に囲碁用語を使ってください：ツケ、ノビ、ハネ、コスミ、急所、先手・後手、ヨセ、手筋、欠け眼。",
    ].join("\n"),
    ko: [
      "반드시 한국어로 답하세요.",
      "바둑과 무관한 질문에는 바둑만 도와줄 수 있다고 한 문장으로 밝힌 뒤, 바로 현재 국면 이야기로 돌아가세요. 빈 답을 주지 마세요.",
      "바둑 용어를 자연스럽게 사용하세요: 급소, 사석, 선수/후수, 호구, 건느붙임, 끝내기, 맥.",
    ].join("\n"),
  };

  return `${common}\n\n--- STYLE ---\n${byLocale[locale]}`;
}
