#!/usr/bin/env node

/**
 * Batch-generate puzzle solutionNote content with a model provider.
 *
 * The script keeps a local SQLite progress database under data_pipeline/
 * and only applies accepted generations to the committed JSON data.
 */

const dns = require("node:dns");
dns.setDefaultResultOrder("ipv4first");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const ROOT = process.cwd();
loadEnvFile(".env.local");
loadEnvFile(".env");

const DATA_DIR = path.join(ROOT, "content", "data");
const PIPELINE_DIR = path.join(ROOT, "data_pipeline");
const DB_PATH = path.join(PIPELINE_DIR, "gemini_solutions.sqlite");
const CLASSICAL_PATH = path.join(DATA_DIR, "classicalPuzzles.json");
const ELIGIBLE_PATH = path.join(DATA_DIR, "coachEligibleIds.json");
const PROVIDER = resolveProvider();
const MODEL = resolveModel(PROVIDER);
const LOCALES = ["zh", "en", "ja", "ko"];
const DEFAULT_BATCH_SIZE = 45;
const DEFAULT_CONCURRENCY = 1;
const MAX_CONCURRENCY = positiveIntEnv(
  "SOLUTION_NOTE_MAX_CONCURRENCY",
  PROVIDER === "mimo-api" ? 24 : PROVIDER === "deepseek" ? 24 : 8,
);
const CLI_TIMEOUT_MS = 180_000;
const API_TIMEOUT_MS = positiveIntEnv("SOLUTION_NOTE_API_TIMEOUT_MS", 180_000);
const API_MAX_TOKENS = positiveIntEnv(
  "SOLUTION_NOTE_MAX_TOKENS",
  PROVIDER === "deepseek" ? 16384 : 4096,
);
const CLI_MAX_BUFFER_BYTES = 20 * 1024 * 1024;
const CLI_CWD = path.join(os.homedir(), ".cache", "go-daily-gemini-cli-workspace");
const ACTIVE_GEMINI_CHILDREN = new Set();

function loadEnvFile(fileName) {
  try {
    require("dotenv").config({ path: path.join(ROOT, fileName), quiet: true });
  } catch {
    // dotenv is a dev dependency; production-like callers can pass env vars directly.
  }
}

function env(name) {
  return process.env[name]?.trim() || "";
}

function positiveIntEnv(name, fallback) {
  const raw = env(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer when set.`);
  }
  return parsed;
}

function resolveProvider() {
  const explicit = env("SOLUTION_NOTE_PROVIDER");
  if (explicit) return explicit;
  if (env("DEEPSEEK_API_KEY")) return "deepseek";
  if (env("MIMO_API_KEY") || env("XIAOMI_API_KEY")) return "mimo-api";
  return "gemini-cli";
}

function resolveModel(provider) {
  if (provider === "deepseek") {
    return env("DEEPSEEK_MODEL") || "deepseek-v4-flash";
  }
  if (provider === "mimo-api") {
    return env("MIMO_MODEL") || env("XIAOMI_MODEL") || "mimo-v2.5-pro";
  }
  if (provider === "gemini-cli") {
    return env("GEMINI_SOLUTION_MODEL") || "gemini-3-flash-preview";
  }
  throw new Error(`Unsupported solution note provider: ${provider}`);
}

const MIN_NOTE_LENGTH = {
  zh: 24,
  en: 48,
  ja: 24,
  ko: 24,
};

const EXPLANATION_PATTERNS = {
  zh: [/因为/, /如果/, /之后/, /随后/, /从而/, /否则/, /才能/, /先.*再/],
  en: [
    /because/i,
    /\bif\b/i,
    /\bonce\b/i,
    /\bafter\b/i,
    /\bthen\b/i,
    /otherwise/i,
    /allows?/i,
    /prevents?/i,
  ],
  ja: [/ため/, /もし/, /その後/, /そこで/, /先に/, /〜と/, /できる/, /止め/],
  ko: [/때문/, /만약/, /이후/, /그러면/, /먼저/, /그래서/, /막을 수/, /확보/],
};

const GENERIC_NOTE_PATTERNS = {
  zh: [/点击.?查看正解/, /查看盘面上的关键点/, /标记出的?急所位置/, /急所位置/],
  en: [/tap ['"]view solution['"]/i, /reveal the key point/i, /vital point highlighted/i],
  ja: [/「正解を見る」/, /急所が盤上に表示/, /急所が示され/],
  ko: [/'정답 보기'/, /급소가 표시/, /핵심 점이 표시/],
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureDirs();
  installSignalHandlers();

  if (options.help) {
    printHelp();
    return;
  }

  const sourcePuzzles = loadOriginJson("content/data/classicalPuzzles.json");
  const originEligible = loadOriginJson("content/data/coachEligibleIds.json");
  const puzzleById = new Map(sourcePuzzles.map((puzzle) => [puzzle.id, puzzle]));

  if (options.restoreBaseline) {
    restoreBaseline(sourcePuzzles, originEligible);
    return;
  }

  const db = openDb();
  ensureQueue(db, sourcePuzzles);
  recoverInterruptedWork(db);

  if (options.applyBatch !== null) {
    const result = applyAcceptedSolutions(db, sourcePuzzles, originEligible, options.applyBatch);
    printApplyResult(result);
    return;
  }

  const selected = selectPuzzles(db, puzzleById, options);
  if (selected.length === 0) {
    console.log("No puzzles selected. Queue is empty for the requested criteria.");
    return;
  }

  if (options.dryRun) {
    console.log(
      `Dry run selected ${selected.length} puzzle(s): ${selected.map((p) => p.id).join(", ")}`,
    );
    console.log("\n--- Prompt preview for first selected puzzle ---\n");
    console.log(buildPrompt(selected[0]));
    return;
  }

  const batchId = createBatch(db, options, selected.length);
  console.log(
    `Processing ${selected.length} puzzle(s) with ${PROVIDER}/${MODEL} at concurrency ${options.concurrency}.`,
  );
  const stats = await processSelectedPuzzles(db, batchId, selected, options.concurrency);

  finishBatch(db, batchId, stats);
  const applyResult = applyAcceptedSolutions(db, sourcePuzzles, originEligible, batchId);
  printBatchSummary(batchId, stats, applyResult);
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    limit: null,
    batchSize: DEFAULT_BATCH_SIZE,
    concurrency: DEFAULT_CONCURRENCY,
    resume: false,
    retryFailed: false,
    ids: null,
    force: false,
    restoreBaseline: false,
    applyBatch: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--resume") options.resume = true;
    else if (arg === "--retry-failed") options.retryFailed = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--restore-baseline") options.restoreBaseline = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--limit") options.limit = numberArg(argv[++i], "--limit");
    else if (arg.startsWith("--limit="))
      options.limit = numberArg(arg.slice("--limit=".length), "--limit");
    else if (arg === "--batch-size") options.batchSize = numberArg(argv[++i], "--batch-size");
    else if (arg.startsWith("--batch-size=")) {
      options.batchSize = numberArg(arg.slice("--batch-size=".length), "--batch-size");
    } else if (arg === "--concurrency") {
      options.concurrency = concurrencyArg(argv[++i]);
    } else if (arg.startsWith("--concurrency=")) {
      options.concurrency = concurrencyArg(arg.slice("--concurrency=".length));
    } else if (arg === "--ids") {
      options.ids = parseIds(argv[++i]);
    } else if (arg.startsWith("--ids=")) {
      options.ids = parseIds(arg.slice("--ids=".length));
    } else if (arg === "--apply-batch") {
      options.applyBatch = numberArg(argv[++i], "--apply-batch");
    } else if (arg.startsWith("--apply-batch=")) {
      options.applyBatch = numberArg(arg.slice("--apply-batch=".length), "--apply-batch");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function concurrencyArg(value) {
  const parsed = numberArg(value, "--concurrency");
  if (parsed > MAX_CONCURRENCY) {
    throw new Error(`--concurrency expects a value between 1 and ${MAX_CONCURRENCY}.`);
  }
  return parsed;
}

function numberArg(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} expects a positive integer.`);
  }
  return parsed;
}

function parseIds(value) {
  if (!value) throw new Error("--ids expects a comma-separated ID list.");
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function printHelp() {
  console.log(`Usage:
  npm run mimo:solutions -- --dry-run --limit 3
  npm run mimo:solutions -- --limit 3
  npm run mimo:solutions -- --batch-size 45 --resume
  npm run mimo:solutions -- --batch-size 45 --concurrency 12 --resume
  npm run mimo:solutions -- --retry-failed --batch-size 45
  npm run mimo:solutions -- --ids p-00001,p-00002
  npm run mimo:solutions -- --apply-batch 1
  npm run mimo:solutions -- --restore-baseline

Options:
  --dry-run            Preview selected IDs and prompt without calling the provider.
  --limit N            Process at most N puzzles.
  --batch-size N       Process N queued puzzles when --limit is omitted (default 45).
  --concurrency N      Run up to N provider calls at once (default 1, max ${MAX_CONCURRENCY}).
  --resume             Continue queued work. This is the default behavior.
  --retry-failed       Select failed/needs_review puzzles instead of queued puzzles.
  --ids A,B            Process specific puzzle IDs.
  --force              Reprocess selected IDs even if they are already accepted/applied.
  --apply-batch N      Re-apply accepted/applied results, optionally scoped to one batch.
  --restore-baseline   Restore puzzle JSON and coach allowlist from origin/main.
`);
}

function ensureDirs() {
  fs.mkdirSync(PIPELINE_DIR, { recursive: true });
  fs.mkdirSync(CLI_CWD, { recursive: true });
}

function installSignalHandlers() {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      terminateActiveGeminiChildren("SIGTERM");
      process.exit(128 + (signal === "SIGINT" ? 2 : 15));
    });
  }
}

function terminateActiveGeminiChildren(signal) {
  for (const child of ACTIVE_GEMINI_CHILDREN) {
    terminateGeminiChild(child, signal);
  }
}

function loadOriginJson(repoPath) {
  const raw = execFileSync("git", ["show", `origin/main:${repoPath}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

function restoreBaseline(sourcePuzzles, originEligible) {
  fs.writeFileSync(CLASSICAL_PATH, JSON.stringify(sourcePuzzles, null, 2));
  fs.writeFileSync(ELIGIBLE_PATH, `${JSON.stringify(originEligible, null, 2)}\n`);
  console.log(
    `Restored ${sourcePuzzles.length} puzzles and ${originEligible.length} coach-ready IDs from origin/main.`,
  );
}

function openDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    create table if not exists batches (
      id integer primary key autoincrement,
      created_at text not null,
      finished_at text,
      model text not null,
      provider text not null,
      batch_size integer not null,
      requested_count integer not null,
      accepted_count integer not null default 0,
      failed_count integer not null default 0,
      needs_review_count integer not null default 0,
      status text not null
    );

    create table if not exists solutions (
      puzzle_id text primary key,
      status text not null,
      batch_id integer,
      attempts integer not null default 0,
      last_error text,
      prompt_text text,
      response_text text,
      parsed_json text,
      validation_json text,
      applied_at text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists solution_attempts (
      id integer primary key autoincrement,
      puzzle_id text not null,
      batch_id integer,
      attempt_no integer not null,
      started_at text not null,
      finished_at text not null,
      exit_code integer,
      stdout text,
      stderr text,
      response_text text,
      parsed_json text,
      validation_json text,
      status text not null,
      error text
    );
  `);
  return db;
}

function ensureQueue(db, puzzles) {
  const insert = db.prepare(`
    insert into solutions (puzzle_id, status, created_at, updated_at)
    values (?, 'queued', ?, ?)
    on conflict(puzzle_id) do nothing
  `);
  const now = isoNow();
  for (const puzzle of puzzles) {
    insert.run(puzzle.id, now, now);
  }
}

function recoverInterruptedWork(db) {
  const now = isoNow();
  const processingRows = db
    .prepare("select puzzle_id from solutions where status = 'processing'")
    .all();
  const runningBatches = db.prepare("select id from batches where status = 'running'").all();

  if (processingRows.length > 0) {
    db.prepare(
      `update solutions
       set status = 'queued',
           last_error = 'interrupted-before-finish',
           batch_id = null,
           updated_at = ?
       where status = 'processing'`,
    ).run(now);
    console.log(
      `Recovered ${processingRows.length} interrupted puzzle(s) back to queued: ${processingRows
        .map((row) => row.puzzle_id)
        .join(", ")}`,
    );
  }

  if (runningBatches.length === 0) return;

  const countByStatus = db.prepare(
    `select
       sum(case when status in ('accepted', 'applied') then 1 else 0 end) as accepted_count,
       sum(case when status = 'failed' then 1 else 0 end) as failed_count,
       sum(case when status = 'needs_review' then 1 else 0 end) as needs_review_count
     from solutions
     where batch_id = ?`,
  );
  const updateBatch = db.prepare(
    `update batches
     set finished_at = ?,
         accepted_count = ?,
         failed_count = ?,
         needs_review_count = ?,
         status = 'interrupted'
     where id = ?`,
  );

  for (const batch of runningBatches) {
    const counts = countByStatus.get(batch.id);
    updateBatch.run(
      now,
      Number(counts.accepted_count ?? 0),
      Number(counts.failed_count ?? 0),
      Number(counts.needs_review_count ?? 0),
      batch.id,
    );
  }
  console.log(
    `Marked interrupted batch(es): ${runningBatches.map((batch) => batch.id).join(", ")}`,
  );
}

function selectPuzzles(db, puzzleById, options) {
  const limit = options.limit ?? options.batchSize;

  if (options.ids?.length) {
    const rows = options.ids.map((id) => {
      const puzzle = puzzleById.get(id);
      if (!puzzle) throw new Error(`Unknown puzzle ID: ${id}`);
      return puzzle;
    });
    if (options.force) return rows.slice(0, limit);
    const placeholders = options.ids.map(() => "?").join(",");
    const existing = db
      .prepare(`select puzzle_id, status from solutions where puzzle_id in (${placeholders})`)
      .all(...options.ids);
    const statusById = new Map(existing.map((row) => [row.puzzle_id, row.status]));
    return rows
      .filter((puzzle) => !["accepted", "applied"].includes(statusById.get(puzzle.id)))
      .slice(0, limit);
  }

  const statuses = options.retryFailed ? ["failed", "needs_review"] : ["queued"];
  const placeholders = statuses.map(() => "?").join(",");
  const ids = db
    .prepare(
      `select puzzle_id from solutions
       where status in (${placeholders})
       order by puzzle_id asc
       limit ?`,
    )
    .all(...statuses, limit)
    .map((row) => row.puzzle_id);
  return ids.map((id) => puzzleById.get(id)).filter(Boolean);
}

function createBatch(db, options, selectedCount) {
  const info = db
    .prepare(
      `insert into batches
       (created_at, model, provider, batch_size, requested_count, status)
       values (?, ?, ?, ?, ?, 'running')`,
    )
    .run(isoNow(), MODEL, PROVIDER, options.batchSize, selectedCount);
  return Number(info.lastInsertRowid);
}

function finishBatch(db, batchId, stats) {
  db.prepare(
    `update batches
     set finished_at = ?, accepted_count = ?, failed_count = ?, needs_review_count = ?, status = 'finished'
     where id = ?`,
  ).run(isoNow(), stats.accepted, stats.failed, stats.needsReview, batchId);
}

async function processSelectedPuzzles(db, batchId, selected, concurrency) {
  const stats = { accepted: 0, failed: 0, needsReview: 0 };
  const workerCount = Math.min(concurrency, selected.length);
  let nextIndex = 0;

  async function worker(workerIndex) {
    while (nextIndex < selected.length) {
      const puzzle = selected[nextIndex++];
      const result = await processPuzzle(db, batchId, puzzle, workerIndex);
      if (result.status === "accepted") stats.accepted++;
      else if (result.status === "needs_review") stats.needsReview++;
      else stats.failed++;
      console.log(
        `[w${workerIndex + 1}] ${puzzle.id}: ${result.status}${
          result.error ? ` (${result.error})` : ""
        }`,
      );
    }
  }

  await Promise.all(Array.from({ length: workerCount }, (_, index) => worker(index)));
  return stats;
}

async function processPuzzle(db, batchId, puzzle, workerIndex = 0) {
  const startedAt = isoNow();
  const prompt = buildPrompt(puzzle);
  const current = db.prepare("select attempts from solutions where puzzle_id = ?").get(puzzle.id);
  const attemptNo = Number(current?.attempts ?? 0) + 1;

  db.prepare(
    `update solutions
     set status = 'processing', batch_id = ?, attempts = ?, prompt_text = ?, updated_at = ?
     where puzzle_id = ?`,
  ).run(batchId, attemptNo, prompt, startedAt, puzzle.id);

  const generation = await runGeneration(prompt, workerIndex);
  const finishedAt = isoNow();
  let status = "failed";
  let error = "";
  let responseText = "";
  let parsed = null;
  let validation = null;

  if (generation.error) {
    error = generation.error;
  } else {
    const wrapperResult = parseWrapper(generation.stdout);
    if (!wrapperResult.ok) {
      error = wrapperResult.error;
    } else {
      responseText = wrapperResult.responseText;
      const responseResult = parseResponseJson(responseText);
      if (!responseResult.ok) {
        error = responseResult.error;
      } else {
        parsed = responseResult.value;
        validation = validateSolution(puzzle, parsed, responseText);
        if (validation.ok) status = "accepted";
        else {
          status = validation.needsReview ? "needs_review" : "failed";
          error = validation.errors.join("; ");
        }
      }
    }
  }

  db.prepare(
    `insert into solution_attempts
     (puzzle_id, batch_id, attempt_no, started_at, finished_at, exit_code, stdout, stderr,
      response_text, parsed_json, validation_json, status, error)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    puzzle.id,
    batchId,
    attemptNo,
    startedAt,
    finishedAt,
    generation.status,
    generation.stdout,
    generation.stderr,
    responseText,
    parsed ? JSON.stringify(parsed) : null,
    validation ? JSON.stringify(validation) : null,
    status,
    error || null,
  );

  db.prepare(
    `update solutions
     set status = ?, last_error = ?, response_text = ?, parsed_json = ?, validation_json = ?, updated_at = ?
     where puzzle_id = ?`,
  ).run(
    status,
    error || null,
    responseText || null,
    parsed ? JSON.stringify(parsed) : null,
    validation ? JSON.stringify(validation) : null,
    finishedAt,
    puzzle.id,
  );

  return { status, error };
}

function buildPrompt(puzzle) {
  const blackStones = puzzle.stones.filter((stone) => stone.color === "black");
  const whiteStones = puzzle.stones.filter((stone) => stone.color === "white");
  const payload = {
    id: puzzle.id,
    boardSize: puzzle.boardSize,
    toPlay: puzzle.toPlay,
    tag: puzzle.tag,
    difficulty: puzzle.difficulty,
    correct: puzzle.correct,
    blackStones: blackStones.map(({ x, y }) => [x, y]),
    whiteStones: whiteStones.map(({ x, y }) => [x, y]),
  };

  return `You are an elite Go (Weiqi/Baduk) problem analyst.

Write the final ground-truth solution note for this puzzle. This note will be used by an AI coach, so it must be accurate, cold, technical, and concise.

Rules:
- Output ONLY one valid JSON object. Do not use Markdown fences.
- The JSON object must have exactly these keys: "en", "zh", "ja", "ko".
- Every value must start with "[SYSTEM ANCHOR]".
- Explain why the listed correct first move is the vital point, using shape, liberties, eye space, tesuji, sente/gote, or endgame logic as appropriate.
- Briefly explain why obvious alternatives fail, but do not invent long concrete variations that are not forced by the position.
- Every language must explicitly contain cause or failure logic using natural phrasing such as "because/if", "因为/如果", "ため/もし", or "때문/만약".
- Use the original 0-indexed project coordinates in the form "(x,y)" when naming points.
- Mention at least one accepted correct coordinate exactly as given below.
- The UI may show a cropped local window for 19x19 problems, so do not over-explain coordinates; describe the local shape as well.
- Keep each language concise: normally one paragraph, maximum two short paragraphs.

Puzzle JSON:
${JSON.stringify(payload, null, 2)}`;
}

async function runGeneration(prompt, workerIndex = 0) {
  if (PROVIDER === "deepseek") return runDeepSeek(prompt);
  if (PROVIDER === "mimo-api") return runMimo(prompt);
  if (PROVIDER === "gemini-cli") return runGemini(prompt, workerIndex);
  return {
    status: null,
    stdout: "",
    stderr: "",
    error: `Unsupported solution note provider: ${PROVIDER}`,
  };
}

async function runDeepSeek(prompt) {
  const apiKey = env("DEEPSEEK_API_KEY");
  const baseUrl = (env("DEEPSEEK_BASE_URL") || "https://api.deepseek.com").replace(/\/+$/, "");
  if (!apiKey) {
    return { status: null, stdout: "", stderr: "", error: "DEEPSEEK_API_KEY is required." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: API_MAX_TOKENS,
      }),
      signal: controller.signal,
    });

    const responseBody = await response.text();
    if (!response.ok) {
      return {
        status: response.status,
        stdout: "",
        stderr: responseBody,
        error: `DeepSeek API returned ${response.status}`,
      };
    }

    const parsed = JSON.parse(responseBody);
    const msg = parsed?.choices?.[0]?.message;
    const content = msg?.content || msg?.reasoning_content;
    if (typeof content !== "string" || !content.trim()) {
      return {
        status: response.status,
        stdout: responseBody,
        stderr: "",
        error: "DeepSeek API response did not contain content or reasoning_content.",
      };
    }

    return {
      status: response.status,
      stdout: JSON.stringify({ response: content }),
      stderr: "",
      error: "",
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const cause = error?.cause?.message || error?.cause?.code || "";
    const extra = cause ? ` (cause: ${cause})` : "";
    const message =
      error?.name === "AbortError"
        ? `DeepSeek API timed out after ${API_TIMEOUT_MS}ms`
        : `DeepSeek API failed: ${detail}${extra}`;
    return { status: null, stdout: "", stderr: "", error: message };
  } finally {
    clearTimeout(timeout);
  }
}

async function runMimo(prompt) {
  const apiKey = env("MIMO_API_KEY") || env("XIAOMI_API_KEY");
  const baseUrl = (env("MIMO_BASE_URL") || env("XIAOMI_BASE_URL")).replace(/\/+$/, "");
  if (!apiKey) {
    return { status: null, stdout: "", stderr: "", error: "MIMO_API_KEY is required." };
  }
  if (!baseUrl) {
    return { status: null, stdout: "", stderr: "", error: "MIMO_BASE_URL is required." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: API_MAX_TOKENS,
      }),
      signal: controller.signal,
    });

    const responseBody = await response.text();
    if (!response.ok) {
      return {
        status: response.status,
        stdout: "",
        stderr: responseBody,
        error: `MiMo API returned ${response.status}`,
      };
    }

    const parsed = JSON.parse(responseBody);
    const content = parsed?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return {
        status: response.status,
        stdout: responseBody,
        stderr: "",
        error: "MiMo API response did not contain choices[0].message.content.",
      };
    }

    return {
      status: response.status,
      stdout: JSON.stringify({ response: content }),
      stderr: "",
      error: "",
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const cause = error?.cause?.message || error?.cause?.code || "";
    const extra = cause ? ` (cause: ${cause})` : "";
    const message =
      error?.name === "AbortError"
        ? `MiMo API timed out after ${API_TIMEOUT_MS}ms`
        : `MiMo API failed: ${detail}${extra}`;
    return { status: null, stdout: "", stderr: "", error: message };
  } finally {
    clearTimeout(timeout);
  }
}

function runGemini(prompt, workerIndex = 0) {
  return new Promise((resolve) => {
    const cwd = workerCliCwd(workerIndex);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let exceededBuffer = false;
    let resolved = false;

    const child = spawn(
      "gemini",
      [
        "-p",
        prompt,
        "-m",
        MODEL,
        "--output-format",
        "json",
        "--approval-mode",
        "plan",
        "--skip-trust",
      ],
      {
        cwd,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    ACTIVE_GEMINI_CHILDREN.add(child);

    const timeout = setTimeout(() => {
      timedOut = true;
      terminateGeminiChild(child, "SIGTERM");
      setTimeout(() => {
        if (!resolved) terminateGeminiChild(child, "SIGKILL");
      }, 5_000).unref();
    }, CLI_TIMEOUT_MS);

    const settle = (payload) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      ACTIVE_GEMINI_CHILDREN.delete(child);
      resolve(payload);
    };

    const checkBuffer = () => {
      if (
        Buffer.byteLength(stdout, "utf8") + Buffer.byteLength(stderr, "utf8") >
        CLI_MAX_BUFFER_BYTES
      ) {
        exceededBuffer = true;
        terminateGeminiChild(child, "SIGTERM");
      }
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      checkBuffer();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      checkBuffer();
    });
    child.on("error", (error) => {
      settle({ status: null, stdout, stderr, error: error.message });
    });
    child.on("close", (code, signal) => {
      const error = exceededBuffer
        ? `Gemini output exceeded ${CLI_MAX_BUFFER_BYTES} bytes`
        : timedOut
          ? `Gemini timed out after ${CLI_TIMEOUT_MS}ms`
          : code === 0
            ? ""
            : signal
              ? `Gemini exited ${code ?? "null"} (${signal})`
              : `Gemini exited ${code}`;
      settle({ status: code, stdout, stderr, error });
    });
  });
}

function workerCliCwd(workerIndex) {
  const cwd = path.join(CLI_CWD, `worker-${workerIndex + 1}`);
  fs.mkdirSync(cwd, { recursive: true });
  return cwd;
}

function terminateGeminiChild(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process may already have exited.
    }
  }
}

function parseWrapper(stdout) {
  const parsed = parseJsonObject(stdout);
  if (!parsed.ok) return parsed;
  if (!parsed.value || typeof parsed.value.response !== "string") {
    return { ok: false, error: "Gemini wrapper JSON did not contain a string response." };
  }
  return { ok: true, responseText: parsed.value.response };
}

function parseResponseJson(responseText) {
  if (responseText.includes("```")) {
    return { ok: false, error: "Response contains Markdown fences." };
  }
  return parseJsonObject(responseText);
}

function parseJsonObject(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { ok: false, error: "No JSON object found." };
    }
    try {
      return { ok: true, value: JSON.parse(text.slice(start, end + 1)) };
    } catch (error) {
      return { ok: false, error: `JSON parse failed: ${error.message}` };
    }
  }
}

function validateSolution(puzzle, solution, responseText) {
  const errors = [];
  const warnings = [];

  if (!solution || typeof solution !== "object" || Array.isArray(solution)) {
    return {
      ok: false,
      needsReview: false,
      errors: ["Parsed response is not an object."],
      warnings,
    };
  }

  const keys = Object.keys(solution).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...LOCALES].sort())) {
    errors.push(`response keys must be exactly ${LOCALES.join(", ")}`);
  }

  for (const locale of LOCALES) {
    const text = solution[locale];
    if (typeof text !== "string" || !text.trim()) {
      errors.push(`${locale} is missing or empty`);
      continue;
    }
    if (!text.trim().startsWith("[SYSTEM ANCHOR]"))
      errors.push(`${locale} missing [SYSTEM ANCHOR]`);
    if (text.length < MIN_NOTE_LENGTH[locale]) errors.push(`${locale} note is too short`);
    if (text.includes("```")) errors.push(`${locale} contains Markdown fence`);
    if (!containsCorrectCoord(text, puzzle.correct))
      warnings.push(`${locale} does not mention a correct coordinate`);
    const badCoord = findOutOfBoundsCoord(text, puzzle.boardSize);
    if (badCoord) errors.push(`${locale} contains out-of-bounds coordinate ${badCoord}`);
  }

  if (responseText.includes("```")) errors.push("raw response contains Markdown fence");
  if (warnings.length === LOCALES.length)
    errors.push("no locale mentions an accepted correct coordinate");

  const eligibility = checkCoachEligibilityLikeApp({ ...puzzle, solutionNote: solution });
  if (!eligibility.eligible) {
    errors.push(`coach eligibility failed: ${eligibility.reason}`);
  }

  return {
    ok: errors.length === 0,
    needsReview: errors.length > 0 && errors.every((error) => error.includes("coordinate")),
    errors,
    warnings,
    eligibility,
  };
}

function containsCorrectCoord(text, correctMoves) {
  return correctMoves.some((coord) => {
    const pattern = new RegExp(`\\(\\s*${coord.x}\\s*,\\s*${coord.y}\\s*\\)`);
    return pattern.test(text);
  });
}

function findOutOfBoundsCoord(text, boardSize) {
  const matches = text.matchAll(/\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g);
  for (const match of matches) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) return match[0];
  }
  return "";
}

function checkCoachEligibilityLikeApp(puzzle) {
  const noteLengths = Object.fromEntries(
    LOCALES.map((locale) => [locale, (puzzle.solutionNote?.[locale] ?? "").trim().length]),
  );
  const averageNoteLength = Math.round(
    LOCALES.reduce((sum, locale) => sum + noteLengths[locale], 0) / LOCALES.length,
  );

  if (!puzzle.correct?.length) return { eligible: false, reason: "missing-correct-answer" };
  if (LOCALES.some((locale) => noteLengths[locale] === 0)) {
    return { eligible: false, reason: "missing-solution-note" };
  }

  const hasVariationSupport = Boolean(
    (puzzle.solutionSequence?.length ?? 0) > 0 || (puzzle.wrongBranches?.length ?? 0) > 0,
  );

  const genericLocaleCount = LOCALES.filter((locale) =>
    GENERIC_NOTE_PATTERNS[locale].some((pattern) => pattern.test(puzzle.solutionNote[locale])),
  ).length;

  if (genericLocaleCount >= 2 && !hasVariationSupport) {
    return { eligible: false, reason: "generic-solution-note" };
  }

  if (LOCALES.some((locale) => noteLengths[locale] < MIN_NOTE_LENGTH[locale])) {
    return { eligible: false, reason: "short-solution-note" };
  }

  const explanationLocaleCount = LOCALES.filter((locale) =>
    EXPLANATION_PATTERNS[locale].some((pattern) => pattern.test(puzzle.solutionNote[locale])),
  ).length;
  if (explanationLocaleCount < 2 && !hasVariationSupport) {
    return { eligible: false, reason: "insufficient-explanation" };
  }
  if (averageNoteLength < 72 && !hasVariationSupport) {
    return { eligible: false, reason: "partial-explanation" };
  }
  return { eligible: true, reason: "eligible" };
}

function applyAcceptedSolutions(db, sourcePuzzles, originEligible, batchId) {
  const rows =
    batchId === null
      ? db
          .prepare(
            "select puzzle_id, parsed_json from solutions where status in ('accepted', 'applied')",
          )
          .all()
      : db
          .prepare(
            "select puzzle_id, parsed_json from solutions where batch_id = ? and status in ('accepted', 'applied')",
          )
          .all(batchId);

  const allAcceptedRows = db
    .prepare(
      `select s.puzzle_id, s.parsed_json, coalesce(b.model, ?) as model, coalesce(b.provider, ?) as provider
       from solutions s
       left join batches b on b.id = s.batch_id
       where s.status in ('accepted', 'applied')`,
    )
    .all(MODEL, PROVIDER);

  const acceptedById = new Map();
  for (const row of allAcceptedRows) {
    if (!row.parsed_json) continue;
    acceptedById.set(row.puzzle_id, {
      solution: JSON.parse(row.parsed_json),
      model: row.model || MODEL,
      provider: row.provider || PROVIDER,
    });
  }

  const acceptedIds = new Set(acceptedById.keys());
  const originEligibleSet = new Set(originEligible);

  const nextPuzzles = sourcePuzzles.map((puzzle) => {
    const accepted = acceptedById.get(puzzle.id);
    if (!accepted) return { ...puzzle };
    const next = {
      ...puzzle,
      solutionNote: accepted.solution,
      _ai_processed: true,
      _ai_model: accepted.model,
      _ai_provider: accepted.provider,
    };
    delete next._needs_reprocessing;
    return next;
  });

  const nextEligible = nextPuzzles
    .filter((puzzle) => originEligibleSet.has(puzzle.id) || acceptedIds.has(puzzle.id))
    .filter((puzzle) => checkCoachEligibilityLikeApp(puzzle).eligible)
    .map((puzzle) => puzzle.id);

  fs.writeFileSync(CLASSICAL_PATH, JSON.stringify(nextPuzzles, null, 2));
  fs.writeFileSync(ELIGIBLE_PATH, `${JSON.stringify(nextEligible, null, 2)}\n`);

  if (rows.length > 0) {
    const now = isoNow();
    const update = db.prepare(
      "update solutions set status = 'applied', applied_at = ?, updated_at = ? where puzzle_id = ? and status = 'accepted'",
    );
    for (const row of rows) update.run(now, now, row.puzzle_id);
  }

  return {
    appliedThisBatch: rows.length,
    acceptedTotal: acceptedById.size,
    puzzleCount: nextPuzzles.length,
    coachEligibleCount: nextEligible.length,
  };
}

function printApplyResult(result) {
  console.log(
    `Applied ${result.appliedThisBatch} accepted solution(s). ` +
      `Accepted total: ${result.acceptedTotal}. Coach-ready IDs: ${result.coachEligibleCount}/${result.puzzleCount}.`,
  );
}

function printBatchSummary(batchId, stats, applyResult) {
  console.log("\nBatch complete.");
  console.log(`Batch ID: ${batchId}`);
  console.log(`Accepted: ${stats.accepted}`);
  console.log(`Needs review: ${stats.needsReview}`);
  console.log(`Failed: ${stats.failed}`);
  printApplyResult(applyResult);
  console.log("\nNext checks:");
  console.log("  npm run validate:puzzles");
  console.log("  npm run validate:messages");
}

function isoNow() {
  return new Date().toISOString();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
