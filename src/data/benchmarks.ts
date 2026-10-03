import type { WorkloadProfile } from "../lib/simulator";

export type BenchmarkLevel = "Easy" | "Medium" | "Hard";
export type BenchmarkScope = "Easy" | "Medium" | "Hard" | "Full";
export type WorkloadMix = { easy: number; medium: number; hard: number };

export const DEFAULT_WORKLOAD_MIX: WorkloadMix = { easy: 8, medium: 8, hard: 8 };

export type BenchmarkCase = {
  id: string;
  level: BenchmarkLevel;
  title: string;
  prompt: string;
  workload: WorkloadProfile;
  variantKey: string;
};

type RandomSource = () => number;
type ActionTemplate = readonly [string, string];

const POOL_PER_LEVEL = 500;
export const PROMPT_POOL_SIZE = POOL_PER_LEVEL * 3;

const EASY_ACTIONS: readonly ActionTemplate[] = [
  ["README typo", "Fix a typo in the {target} and do not change anything else."],
  ["Rename local symbol", "Rename one local variable in the {target} and update only its direct references."],
  ["Remove unused import", "Remove the unused import reported by the linter in the {target}."],
  ["Copy update", "Update one short UI label in the {target} without changing behavior."],
  ["Formatting cleanup", "Format the configuration object in the {target} to match the surrounding style."],
  ["Find usage", "Find where the exported helper from the {target} is used and list the relevant file paths. Do not modify files."],
  ["Short comment", "Add one concise comment in the {target} explaining the existing delay."],
  ["Type cleanup", "Replace one duplicated inline string union in the {target} with the existing shared type."],
  ["Test name cleanup", "Rename one test description in the {target} so it matches the behavior it already tests."],
  ["Literal cleanup", "Replace the duplicated string literal in the {target} with the existing constant."]
];

const MEDIUM_ACTIONS: readonly ActionTemplate[] = [
  ["Validation bug", "Fix the validation bug in the {target}, add a regression test, and preserve current valid behavior."],
  ["Retry handling", "Improve the retry behavior in the {target} for transient failures and add focused tests."],
  ["Component refactor", "Refactor the {target} to remove duplicated state logic without changing public behavior."],
  ["Pagination feature", "Implement pagination in the {target} using the existing response metadata and add tests."],
  ["Cache invalidation", "Fix the stale cache bug in the {target} and add a regression test."],
  ["Input normalization", "Normalize user input in the {target} before validation and persistence, then update tests."],
  ["Feature flag wiring", "Wire the existing feature flag into the {target} while preserving the current fallback."],
  ["Query optimization", "Refactor the database query used by the {target} to avoid repeated lookups while preserving the result shape."],
  ["API error mapping", "Fix inconsistent API error mapping in the {target} and add tests for the affected status codes."],
  ["Async state bug", "Fix the async state bug in the {target} that can show stale UI after a successful request."]
];

const HARD_ACTIONS: readonly ActionTemplate[] = [
  ["Concurrent session race", "Investigate the root cause of a concurrent session race condition in the {target}, implement a safe fix, and add regression tests."],
  ["Cross-module redesign", "Redesign the architecture around the {target} so responsibilities are isolated across multiple modules without breaking current behavior."],
  ["Distributed duplication", "Find why distributed workers around the {target} can process the same job twice under load and implement an idempotent fix."],
  ["Schema migration", "Design a backwards-compatible database schema migration for the {target} with a safe rollout and rollback path."],
  ["Production memory leak", "Investigate a production memory leak around the {target}, identify the root cause across the lifecycle, and implement a verified fix."],
  ["Cache consistency", "Resolve a distributed cache consistency failure in the {target} that exposes stale state across application instances."],
  ["Multi-file refactor", "Refactor the {target} across multiple files to separate parsing, validation, and orchestration while preserving public behavior."],
  ["Deadlock investigation", "Investigate an intermittent database deadlock involving the {target}, identify the conflicting transaction path, and implement a safe fix."],
  ["Cross-service rollback", "Design a failure-safe cross-service rollback strategy for the {target} while preserving consistency during partial failures."],
  ["Large data migration", "Plan and implement a multi-stage data migration for the {target} while keeping old and new application versions compatible during rollout."]
];

const TARGETS = [
  "account settings flow",
  "checkout service",
  "notification pipeline",
  "session module",
  "dashboard component",
  "background job runner",
  "profile API",
  "billing adapter",
  "search endpoint",
  "permissions service",
  "websocket session manager",
  "file upload flow",
  "analytics pipeline",
  "admin dashboard",
  "subscription service",
  "team invitation flow",
  "audit log service",
  "email delivery adapter",
  "report generation flow",
  "project import service"
];

const EASY_CONTEXTS = [
  "Keep the change local to the named file.",
  "Do not add tests for this tiny edit.",
  "Avoid unrelated cleanup.",
  "Preserve behavior exactly.",
  "Use the existing style in the file.",
  "Do not introduce a new dependency.",
  "Keep the diff to the smallest practical change.",
  "Do not change any public interface."
];

const EASY_CONSTRAINTS = [
  "Change only what is necessary.",
  "Do not touch unrelated files.",
  "Keep the diff minimal.",
  "Do not refactor surrounding code.",
  "Leave public behavior unchanged.",
  "Return only the requested change.",
  "Keep existing formatting conventions.",
  "Do not add new configuration."
];

const MEDIUM_CONTEXTS = [
  "The project already has tests for the surrounding behavior.",
  "Keep existing public interfaces stable.",
  "Use the conventions already present in the repository.",
  "Preserve backwards compatibility.",
  "Existing callers must continue to work unchanged.",
  "Keep the change focused and reviewable.",
  "The affected flow has several existing edge cases.",
  "The implementation should remain easy to review."
];

const MEDIUM_CONSTRAINTS = [
  "Include a focused regression test.",
  "Preserve the current API response shape.",
  "Reuse existing helpers where possible.",
  "Do not change environment configuration.",
  "Keep logging behavior unchanged.",
  "Avoid unrelated cleanup.",
  "Cover the failure path as well as the happy path.",
  "Keep the public types stable."
];

const HARD_CONTEXTS = [
  "The issue crosses multiple files and execution boundaries.",
  "The failure is intermittent and appears under realistic load.",
  "Backwards compatibility matters during the rollout.",
  "The system has existing tests but no coverage for this failure mode.",
  "Multiple application instances can observe the affected state.",
  "The change must remain safe during partial deployment.",
  "The failure only appears when several operations overlap.",
  "The fix has to work during a rolling deployment."
];

const HARD_CONSTRAINTS = [
  "Add regression coverage for the identified failure mode.",
  "Document the root cause before implementing the fix.",
  "Include a safe rollout or rollback strategy where relevant.",
  "Preserve existing public interfaces unless the fix requires otherwise.",
  "Avoid masking the symptom without addressing the root cause.",
  "Keep data consistency intact during failures.",
  "Include a concurrency-focused test where appropriate.",
  "Explain the system boundary that caused the failure."
];

function mulberry32(seed: number): RandomSource {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: RandomSource): T {
  return items[Math.floor(random() * items.length)];
}

function integer(min: number, max: number, random: RandomSource) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function shuffle<T>(items: readonly T[], random: RandomSource) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function workloadFor(level: BenchmarkLevel, random: RandomSource): WorkloadProfile {
  if (level === "Easy") {
    return {
      inputTokens: integer(1200, 6000, random),
      outputTokens: integer(250, 1200, random),
      baseSeconds: integer(22, 55, random) / 10
    };
  }

  if (level === "Medium") {
    return {
      inputTokens: integer(6000, 24000, random),
      outputTokens: integer(1200, 4500, random),
      baseSeconds: integer(55, 140, random) / 10
    };
  }

  return {
    inputTokens: integer(18000, 80000, random),
    outputTokens: integer(3000, 12000, random),
    baseSeconds: integer(120, 400, random) / 10
  };
}

function actionsFor(level: BenchmarkLevel) {
  if (level === "Easy") return EASY_ACTIONS;
  if (level === "Medium") return MEDIUM_ACTIONS;
  return HARD_ACTIONS;
}

function contextFor(level: BenchmarkLevel, random: RandomSource) {
  if (level === "Easy") {
    return {
      context: pick(EASY_CONTEXTS, random),
      extra: pick(EASY_CONSTRAINTS, random)
    };
  }

  if (level === "Medium") {
    return {
      context: pick(MEDIUM_CONTEXTS, random),
      extra: pick(MEDIUM_CONSTRAINTS, random)
    };
  }

  return {
    context: pick(HARD_CONTEXTS, random),
    extra: pick(HARD_CONSTRAINTS, random)
  };
}

function makeCase(
  level: BenchmarkLevel,
  ordinal: number,
  random: RandomSource
): BenchmarkCase {
  const action = pick(actionsFor(level), random);
  const target = pick(TARGETS, random);
  const { context, extra } = contextFor(level, random);
  const prompt =
    action[1].replace("{target}", target) + " " + context + " " + extra;
  const prefix = level === "Easy" ? "E" : level === "Medium" ? "M" : "H";

  return {
    id: prefix + String(ordinal + 1).padStart(3, "0"),
    level,
    title: action[0] + " · " + target,
    prompt,
    workload: workloadFor(level, random),
    variantKey: [action[0], target, context, extra].join(" | ")
  };
}

function buildLevelPool(
  level: BenchmarkLevel,
  count: number,
  seed: number
): BenchmarkCase[] {
  const random = mulberry32(seed);
  const pool: BenchmarkCase[] = [];
  const seen = new Set<string>();
  let attempts = 0;

  while (pool.length < count && attempts < count * 100) {
    const candidate = makeCase(level, pool.length, random);
    attempts += 1;
    if (seen.has(candidate.variantKey)) continue;
    seen.add(candidate.variantKey);
    pool.push(candidate);
  }

  if (pool.length < count) {
    throw new Error("Could not build the requested benchmark prompt pool.");
  }

  return pool;
}

const EASY_POOL = buildLevelPool("Easy", POOL_PER_LEVEL, 11031991);
const MEDIUM_POOL = buildLevelPool("Medium", POOL_PER_LEVEL, 24071995);
const HARD_POOL = buildLevelPool("Hard", POOL_PER_LEVEL, 17122001);

export const PROMPT_POOL = [
  ...EASY_POOL,
  ...MEDIUM_POOL,
  ...HARD_POOL
];

function sampleLevel(
  pool: readonly BenchmarkCase[],
  count: number,
  random: RandomSource
) {
  return shuffle(pool, random).slice(0, count);
}

export function createBenchmarkSeed() {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}

export function generateBenchmarkSuite(
  scope: BenchmarkScope,
  seed = createBenchmarkSeed(),
  mix: WorkloadMix = DEFAULT_WORKLOAD_MIX
) {
  const random = mulberry32(seed);

  if (scope === "Easy") return sampleLevel(EASY_POOL, 8, random);
  if (scope === "Medium") return sampleLevel(MEDIUM_POOL, 8, random);
  if (scope === "Hard") return sampleLevel(HARD_POOL, 8, random);

  const total = mix.easy + mix.medium + mix.hard;
  const safeMix = total > 0 && total <= 100 ? mix : DEFAULT_WORKLOAD_MIX;
  const mixed = [
    ...sampleLevel(EASY_POOL, safeMix.easy, random),
    ...sampleLevel(MEDIUM_POOL, safeMix.medium, random),
    ...sampleLevel(HARD_POOL, safeMix.hard, random)
  ];

  return shuffle(mixed, random);
}

export function suiteSize(scope: BenchmarkScope, mix: WorkloadMix = DEFAULT_WORKLOAD_MIX) {
  return scope === "Full" ? mix.easy + mix.medium + mix.hard : 8;
}

export const GENERATED_POOL_NOTE =
  "1,500 unique prompts are pre-generated in the local pool: 500 Easy, 500 Medium, and 500 Hard. Full mode can sample any custom mix up to 100 prompts, without replacement, then shuffles the selected cases before execution.";
