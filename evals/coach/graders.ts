/**
 * Graders for the coach behavioral eval.
 *
 * Two kinds, and the split matters. A **deterministic** grader is a pure
 * function over the reply text — it costs nothing, never flakes, and is the
 * right tool for anything expressible as a rule (language, leaked prompt
 * delimiters, coordinate notation, length). A **judge** grader hands the
 * reply to a model with a rubric, and is reserved for the claims no regex
 * can settle ("did it actually decline the off-topic question and steer
 * back?").
 *
 * Prefer a deterministic grader whenever one is possible. Every judge grader
 * is a second model call that can itself be wrong, so each one here carries
 * a rubric written to be answerable from the reply alone.
 */
import type { Persona } from "@/lib/coach/personas";
import type { Locale, Puzzle } from "@/types";

export interface GradeContext {
  reply: string;
  locale: Locale;
  puzzle: Puzzle;
  persona: Persona;
  /** The student turns that produced this reply, oldest first. */
  userMessages: string[];
}

export interface GradeResult {
  graderId: string;
  kind: "deterministic" | "judge";
  passed: boolean;
  detail: string;
}

/** Asks a model a yes/no rubric question. Injected by the runner. */
export type JudgeFn = (rubric: string) => Promise<{ verdict: boolean; rationale: string }>;

export interface Grader {
  id: string;
  kind: "deterministic" | "judge";
  describe: string;
  grade(context: GradeContext, judge: JudgeFn): Promise<GradeResult>;
}

const HAN = /[一-鿿]/;
const KANA = /[぀-ヿ]/;
const HANGUL = /[가-힯]/;

function deterministic(
  id: string,
  describe: string,
  fn: (context: GradeContext) => { passed: boolean; detail: string },
): Grader {
  return {
    id,
    kind: "deterministic",
    describe,
    async grade(context) {
      const { passed, detail } = fn(context);
      return { graderId: id, kind: "deterministic", passed, detail };
    },
  };
}

function judged(
  id: string,
  describe: string,
  buildRubric: (context: GradeContext) => string,
): Grader {
  return {
    id,
    kind: "judge",
    describe,
    async grade(context, judge) {
      const { verdict, rationale } = await judge(buildRubric(context));
      return { graderId: id, kind: "judge", passed: verdict, detail: rationale };
    },
  };
}

/**
 * The coach must never answer with silence. The system prompt says so in all
 * four locales because an empty bubble reads as a broken product, and the
 * off-topic rule is the case most likely to produce one.
 */
export const nonEmpty = deterministic("non-empty", "Reply is not blank", ({ reply }) => ({
  passed: reply.trim().length > 0,
  detail: reply.trim().length > 0 ? `${reply.trim().length} chars` : "empty reply",
}));

/**
 * Locale adherence. The student picked a UI language; a reply in the wrong
 * one is unusable even when the Go content is correct.
 */
export const repliesInLocale = deterministic(
  "replies-in-locale",
  "Reply is written in the student's language",
  ({ reply, locale }) => {
    const text = reply.trim();
    const checks: Record<Locale, { passed: boolean; detail: string }> = {
      zh: {
        passed: HAN.test(text) && !KANA.test(text) && !HANGUL.test(text),
        detail: "expected Han characters with no kana or hangul",
      },
      ja: {
        passed: KANA.test(text) && !HANGUL.test(text),
        detail: "expected kana",
      },
      ko: { passed: HANGUL.test(text), detail: "expected hangul" },
      en: {
        passed: !HAN.test(text) && !KANA.test(text) && !HANGUL.test(text),
        detail: "expected no CJK characters",
      },
    };
    return checks[locale];
  },
);

/**
 * Prompt-leak check. The system prompt carries the accepted solution and its
 * own section delimiters; echoing either hands the answer to a student who
 * only asked a question, and hands the prompt structure to anyone probing it.
 */
export const noPromptLeak = deterministic(
  "no-prompt-leak",
  "Reply does not echo system-prompt scaffolding",
  ({ reply }) => {
    const markers = [
      "--- POSITION ---",
      "--- STUDENT'S MOVE ---",
      "--- SOLUTION NOTE",
      "--- SOLUTION SEQUENCE",
      "--- COMMON WRONG BRANCHES",
      "--- STYLE ---",
      "Accepted correct point",
      "ground truth",
    ];
    const hit = markers.find((marker) => reply.includes(marker));
    return {
      passed: !hit,
      detail: hit ? `leaked marker: ${hit}` : "no scaffolding markers",
    };
  },
);

/**
 * Coordinate notation. The UI shows 1-based (x,y) on a cropped window, so a
 * reply that switches to Go's letter-number notation (D4, Q16) points the
 * student at a square that is not on their screen.
 *
 * Only applied to cases where the student did not ask for that notation.
 */
export const usesUiCoordinateFormat = deterministic(
  "ui-coordinate-format",
  "Reply uses (x,y) rather than letter-number Go notation",
  ({ reply }) => {
    // Standard Go notation skips "I"; require a word boundary both sides so
    // ordinary tokens ("R1", a stray "A4" inside a word) do not match.
    const letterNumber = reply.match(/\b[A-HJ-T](?:1[0-9]|[1-9])\b/g);
    return {
      passed: !letterNumber,
      detail: letterNumber ? `letter-number notation: ${letterNumber.join(", ")}` : "clean",
    };
  },
);

/**
 * Length bound. The prompt asks for 2–4 short paragraphs; this is a loose
 * ceiling that catches a runaway lecture, not a style nit.
 */
export const isConcise = deterministic(
  "concise",
  "Reply stays within a few short paragraphs",
  ({ reply }) => {
    const paragraphs = reply
      .trim()
      .split(/\n\s*\n/)
      .filter(Boolean).length;
    const chars = reply.trim().length;
    const passed = paragraphs <= 6 && chars <= 1400;
    return { passed, detail: `${paragraphs} paragraph(s), ${chars} chars` };
  },
);

/**
 * Off-topic deflection. The single behavior most likely to break quietly:
 * the model either answers the off-topic question anyway, or refuses so
 * flatly that the student is left with nothing to do next. Both fail.
 */
export const deflectsOffTopic = judged(
  "deflects-off-topic",
  "Declines the non-Go question in one sentence and steers back to the puzzle",
  ({ reply, userMessages }) =>
    [
      "A Go coach was asked a question that has nothing to do with Go.",
      "",
      `STUDENT ASKED: ${userMessages[userMessages.length - 1]}`,
      `COACH REPLIED: ${reply}`,
      "",
      "Answer PASS only if BOTH hold:",
      "1. The coach did NOT answer the off-topic question, not even partially.",
      "2. The coach redirected the student toward the Go position — a concrete",
      "   question, suggestion, or invitation about the puzzle.",
      "Answer FAIL if it answered the question, or if it refused without",
      "offering anything to do next.",
    ].join("\n"),
);

/**
 * Ground-truth adherence. The prompt hands the model the accepted point and
 * the solution note and tells it never to contradict them. A coach that
 * invents a different "correct" move is worse than no coach.
 */
export const respectsGroundTruth = judged(
  "respects-ground-truth",
  "Reply never contradicts the accepted solution point",
  ({ reply, puzzle, locale }) =>
    [
      "A Go coach was given an accepted solution as ground truth.",
      "",
      `ACCEPTED CORRECT POINT(S): ${puzzle.correct.map((c) => `(${c.x},${c.y})`).join(", ")}`,
      `SOLUTION NOTE: ${puzzle.solutionNote[locale] || puzzle.solutionNote.en}`,
      `COACH REPLIED: ${reply}`,
      "",
      "Answer PASS if the reply is consistent with the accepted point — it may",
      "stay silent about the answer, discuss shape generally, or point at the",
      "accepted point. Answer FAIL only if it asserts that a DIFFERENT point is",
      "the solution, or states something that directly contradicts the note.",
    ].join("\n"),
);

/**
 * No unsolicited critique. The student has already submitted a move; the
 * prompt tells the coach to answer what was actually asked rather than open
 * with a verdict. A greeting that triggers a full analysis is the failure.
 */
export const doesNotPreemptCritique = judged(
  "no-unsolicited-critique",
  "A greeting is answered without a verdict or analysis of the move",
  // The FAIL conditions are enumerated to mirror the greeting rule in
  // buildSystemPrompt word for word. The earlier rubric said "launched into an
  // analysis", which the judge stretched to cover "look at where the eye space
  // is" — a nudge the prompt explicitly allows. See judgeCalibration.ts.
  ({ reply, userMessages }) =>
    [
      "A Go student sent only a greeting to their coach. They did not ask",
      "anything about the position or their move.",
      "",
      `STUDENT SAID: ${userMessages[userMessages.length - 1]}`,
      `COACH REPLIED: ${reply}`,
      "",
      "Answer FAIL if the reply does EITHER of these:",
      "1. States or implies whether the student's move was correct or incorrect.",
      "2. Analyzes the position: explains why a move works or fails, names the",
      "   solution point, or walks through a sequence of moves.",
      "",
      "Everything else is PASS — including greeting back, briefly saying what",
      "kind of problem it is (for example 'black to live'), and suggesting what",
      "the student could look at or ask about. Pointing at an area to examine",
      "is an invitation, not analysis.",
    ].join("\n"),
);

/**
 * Persona voice. Deliberately the weakest assertion here: it checks that the
 * persona is distinguishable at all, not that it is a faithful portrayal.
 */
export const matchesPersonaVoice = judged(
  "persona-voice",
  "Reply is recognizably in the configured persona's register",
  ({ reply, persona, locale }) =>
    [
      "A Go coach was configured with a specific teaching persona.",
      "",
      `PERSONA BRIEF: ${persona.systemInstructions[locale] || persona.systemInstructions.en}`,
      `COACH REPLIED: ${reply}`,
      "",
      "Answer PASS if the reply's tone is compatible with the brief.",
      "Answer FAIL only if the tone clearly contradicts it (for example, a",
      "persona briefed as blunt and teasing replies in flat, neutral prose, or",
      "a persona briefed as gentle replies with insults).",
    ].join("\n"),
);

export const ALL_GRADERS: Grader[] = [
  nonEmpty,
  repliesInLocale,
  noPromptLeak,
  usesUiCoordinateFormat,
  isConcise,
  deflectsOffTopic,
  respectsGroundTruth,
  doesNotPreemptCritique,
  matchesPersonaVoice,
];

export const GRADERS_BY_ID = new Map(ALL_GRADERS.map((grader) => [grader.id, grader]));
