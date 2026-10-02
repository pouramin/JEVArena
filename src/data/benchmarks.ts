import type { WorkloadProfile } from "../lib/simulator";

export type BenchmarkLevel = "Easy" | "Medium" | "Hard";
export type BenchmarkScope = "Easy" | "Medium" | "Hard" | "Full";

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

const EASY_ACTIONS: readonly ActionTemplate[] = [
  ["README typo", "Fix a typo in the {target} and do not change anything else."],
  ["Rename local symbol", "Rename one local variable in the {target} and update only its direct references."],
  ["Remove unused import", "Remove the unused import reported by the linter in the {target}."],
  ["Copy update", "Update one short UI label in the {target} without changing behavior."],
  ["Formatting cleanup", "Format the configuration object in the {target} to match the surrounding style."],
  ["Find usage", "Find where the exported helper from the {target} is used and list the relevant file paths. Do not modify files."],
  ["Short comment", "Add one concise comment in the {target} explaining the existing retry delay."],
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
  ["Schema migration", "Design a backwards-compatible database migration for the {target} with a safe rollout and rollback path."],
  ["Production memory leak", "Investigate a production memory leak around the {target}, identify the root cause across the lifecycle, and implement a verified fix."],
  ["Cache consistency", "Resolve a distributed cache consistency failure in the {target} that exposes stale state across application instances."],
  ["Multi-file refactor", "Refactor the {target} across multiple files to separate parsing, validation, and orchestration while preserving public behavior."],
  ["Deadlock investigation", "Investigate an intermittent database deadlock involving the {target}, identify the conflicting transaction path, and implement a safe fix."],
  ["Cross-service rollback", "Design a failure-safe rollback strategy for the {target} across multiple services while preserving consistency during partial failures."],
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
  "file upload flow"
];

const CONTEXTS = [
  "The project already has tests for the surrounding behavior.",
  "Keep existing public interfaces stable.",
  "Avoid unrelated cleanup.",
  "Use the conventions already present in the repository.",
  "Preserve backwards compatibility.",
  "Do not introduce a new dependency.",
  "Keep the change focused and reviewable.",
  "Existing callers must continue to work unchanged."
];

const EXTRA_CONSTRAINTS = [
  "Include a focused test for the changed behavior.",
  "Do not change unrelated files.",
  "Keep error messages backwards compatible.",
  "Preserve the current API response shape.",
  "Reuse existing helpers where possible.",
  "Do not change environment configuration.",
  "Keep logging behavior unchanged.",
  "Avoid changing public types unless required."
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

function makeCase(
  level: BenchmarkLevel,
  ordinal: number,
  random: RandomSource
): BenchmarkCase {
  const action = pick(actionsFor(level), random);
  const target = pick(TARGETS, random);
  const context = pick(CONTEXTS, random);
  const extra = pick(EXTRA_CONSTRAINTS, random);
  const prompt =
    action[1].replace("{target}", target) + " " + context + " " + extra;
  const prefix = level === "Easy" ? "E" : level === "Medium" ? "M" : "H";

  return {
    id: prefix + String(ordinal + 1).padStart(2, "0"),
    level,
    title: action[0] + " · " + target,
    prompt,
    workload: workloadFor(level, random),
    variantKey: [action[0], target, context, extra].join(" | ")
  };
}

function uniqueCases(
  level: BenchmarkLevel,
  count: number,
  random: RandomSource
) {
  const cases: BenchmarkCase[] = [];
  const seen = new Set<string>();
  let attempts = 0;

  while (cases.length < count && attempts < count * 50) {
    const candidate = makeCase(level, cases.length, random);
    attempts += 1;
    if (seen.has(candidate.variantKey)) continue;
    seen.add(candidate.variantKey);
    cases.push(candidate);
  }

  return cases.map((item, index) => ({
    ...item,
    id:
      (level === "Easy" ? "E" : level === "Medium" ? "M" : "H") +
      String(index + 1).padStart(2, "0")
  }));
}

export function createBenchmarkSeed() {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}

export function generateBenchmarkSuite(
  scope: BenchmarkScope,
  seed = createBenchmarkSeed()
) {
  const random = mulberry32(seed);

  if (scope === "Easy") return uniqueCases("Easy", 8, random);
  if (scope === "Medium") return uniqueCases("Medium", 8, random);
  if (scope === "Hard") return uniqueCases("Hard", 8, random);

  return [
    ...uniqueCases("Easy", 8, random),
    ...uniqueCases("Medium", 8, random),
    ...uniqueCases("Hard", 8, random)
  ];
}

export function suiteSize(scope: BenchmarkScope) {
  return scope === "Full" ? 24 : 8;
}

export const GENERATED_POOL_NOTE =
  "Prompts are generated from combinatorial task, target, context, and constraint templates, producing thousands of possible variants per difficulty level.";
