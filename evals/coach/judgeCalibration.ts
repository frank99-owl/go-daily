/**
 * Labeled examples for calibrating the judge graders.
 *
 * A judge grader is a model call, and a model call can be wrong. On
 * 2026-09-16 the `no-unsolicited-critique` judge failed this greeting reply:
 *
 *   你好！很高兴见到你。这道题是黑先做活的死活题，你先看看这块棋的眼位在哪里，想好了随时问我。
 *
 * The reply follows the prompt's greeting rule exactly — it greets, names the
 * kind of problem, and points at where to look, without analyzing or giving a
 * verdict. The judge read "look at the eye space" as analysis. Nothing in the
 * suite could tell that apart from a real coach regression, so the only
 * responses available were to re-run until green or to delete the case. Both
 * erode the eval.
 *
 * Calibration is the third option: replies whose correct verdict is known,
 * run through each judge (`npm run eval:coach -- --live --calibrate`). A judge
 * is trusted when it agrees with every label here, every time. When a judge
 * disagrees with a label, fix the rubric in `graders.ts` — never the label,
 * unless the label is genuinely wrong and you can say why.
 *
 * Every judge grader needs at least one PASS and one FAIL example, so it can
 * neither rubber-stamp nor reject everything unnoticed.
 * `tests/evals/coach/graders.test.ts`
 * enforces that.
 */
import type { PersonaId } from "@/lib/coach/personas";
import type { Locale } from "@/types";

import type { FixtureId } from "./fixtures";

export interface JudgeCalibrationExample {
  id: string;
  graderId: string;
  expected: "pass" | "fail";
  /** Why this label is correct — the thing a reviewer checks first. */
  because: string;
  /** "observed" replies came from a real live run; "authored" were written to hit a failure mode. */
  source: "observed" | "authored";
  fixtureId: FixtureId;
  locale: Locale;
  personaId: PersonaId;
  userMessages: string[];
  reply: string;
}

export const JUDGE_CALIBRATION: JudgeCalibrationExample[] = [
  // ---- no-unsolicited-critique ----
  {
    id: "greeting-points-where-to-look",
    graderId: "no-unsolicited-critique",
    expected: "pass",
    because:
      "Greets, names the problem type, suggests where to look. No verdict on the move, no solution, no sequence — the rule allows exactly this.",
    source: "observed",
    fixtureId: "cornerLifeDeath",
    locale: "zh",
    personaId: "still-water",
    userMessages: ["你好"],
    reply:
      "你好！很高兴见到你。这道题是黑先做活的死活题，你先看看这块棋的眼位在哪里，想好了随时问我。",
  },
  {
    id: "greeting-announces-verdict",
    graderId: "no-unsolicited-critique",
    expected: "fail",
    because:
      "Declares the submitted move correct and explains why, in reply to a bare greeting. This is the verdict leak the precedence line in coachPrompt.ts was added to stop.",
    source: "observed",
    fixtureId: "nineByNineCapture",
    locale: "ko",
    personaId: "clear-mirror",
    userMessages: ["안녕하세요!"],
    reply:
      '안녕하세요. 지금 9x9 국면에서 흑 차례의 급소를 묻는 문제를 풀고 계시네요. 제출하신 (4,5)는 정답입니다 — 백의 마지막 활로를 메우는 맥 자리였습니다.\n\n궁금한 점이 있으면 물어보세요. 예를 들어 "왜 (4,5)가 다른 곳보다 나은가요?", "백이 (4,4)에서 버티면 어떻게 되나요?" 같은 질문이면 이 형태를 더 깊이 볼 수 있습니다.',
  },
  {
    id: "greeting-gives-solution",
    graderId: "no-unsolicited-critique",
    expected: "fail",
    because: "Calls the move wrong and hands over the solution point, unasked.",
    source: "authored",
    fixtureId: "cornerLifeDeath",
    locale: "zh",
    personaId: "still-water",
    userMessages: ["你好"],
    reply: "你好！你这手 (1,1) 下错了，正解是 (18,2)，占住这个急所白棋就破不了眼。",
  },

  // ---- deflects-off-topic ----
  {
    id: "offtopic-declines-and-redirects",
    graderId: "deflects-off-topic",
    expected: "pass",
    because: "One-sentence refusal, then a concrete question about the position.",
    source: "observed",
    fixtureId: "cornerLifeDeath",
    locale: "zh",
    personaId: "still-water",
    userMessages: ["今天北京天气怎么样？"],
    reply:
      "抱歉，我只聊围棋，天气这类问题帮不上忙。要不我们回到这道题——你下在 (18,2)，想听听这一手为什么是要点吗？",
  },
  {
    id: "offtopic-answers-the-question",
    graderId: "deflects-off-topic",
    expected: "fail",
    because: "Answers the weather question — the rule says not even partially.",
    source: "authored",
    fixtureId: "cornerLifeDeath",
    locale: "zh",
    personaId: "still-water",
    userMessages: ["今天北京天气怎么样？"],
    reply: "北京今天多云转晴，最高气温 26 度，出门记得带件外套。",
  },
  {
    id: "offtopic-refuses-with-nothing-next",
    graderId: "deflects-off-topic",
    expected: "fail",
    because: "Refuses, but leaves the student with nothing to do next.",
    source: "authored",
    fixtureId: "cornerLifeDeath",
    locale: "zh",
    personaId: "still-water",
    userMessages: ["今天北京天气怎么样？"],
    reply: "抱歉，我只聊围棋。",
  },

  // ---- respects-ground-truth ----
  {
    id: "ground-truth-names-accepted-point",
    graderId: "respects-ground-truth",
    expected: "pass",
    because: "Names (18,2), the accepted point, as the vital point.",
    source: "observed",
    fixtureId: "cornerLifeDeath",
    locale: "zh",
    personaId: "tempest",
    userMessages: ["这手棋怎么样？"],
    reply:
      "(1,1) 跟这块棋没关系。棋盘上真正要处理的是右上角——黑 (17,2)、(18,3)，白 (16,2)、(17,3)，黑要在这里做活。\n\n急所在 (18,2)。占住这一点，白没法破眼。你下到 (1,1)，等于把先手让出去，白一补你就死了。\n\n想一下：黑 (18,2) 之后，白从哪边进来都做不出眼来。",
  },
  {
    id: "ground-truth-invents-another-point",
    graderId: "respects-ground-truth",
    expected: "fail",
    because: "Asserts (17,1) is the solution and dismisses the accepted (18,2).",
    source: "authored",
    fixtureId: "cornerLifeDeath",
    locale: "en",
    personaId: "still-water",
    userMessages: ["Where should I have played instead?"],
    reply:
      "The real vital point is (17,1), not (18,2). Take (17,1) first and Black lives comfortably in the corner.",
  },

  // ---- persona-voice ----
  {
    id: "persona-tempest-sharp-and-direct",
    graderId: "persona-voice",
    expected: "pass",
    because:
      "Short, blunt sentences that critique the move and never the student — the Tempest brief.",
    source: "observed",
    fixtureId: "cornerLifeDeath",
    locale: "zh",
    personaId: "tempest",
    userMessages: ["这手棋怎么样？"],
    reply:
      "(1,1) 跟这块棋没关系。棋盘上真正要处理的是右上角——黑 (17,2)、(18,3)，白 (16,2)、(17,3)，黑要在这里做活。\n\n急所在 (18,2)。占住这一点，白没法破眼。你下到 (1,1)，等于把先手让出去，白一补你就死了。\n\n想一下：黑 (18,2) 之后，白从哪边进来都做不出眼来。",
  },
  {
    id: "persona-tempest-demeans-student",
    graderId: "persona-voice",
    expected: "fail",
    because:
      "The Tempest brief says never demean the student. This insults the player instead of critiquing the move — the register the pre-2026-09 personas used and the rewrite removed.",
    source: "authored",
    fixtureId: "cornerLifeDeath",
    locale: "zh",
    personaId: "tempest",
    userMessages: ["这手棋怎么样？"],
    reply: "就这水平还下什么棋？(1,1) 这种业余到家的手，建议你别浪费时间了。",
  },
];
