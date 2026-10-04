import {
  anthropicModelForTier,
  type Model,
  type Tier
} from "../data/models";

export type Complexity = "Easy" | "Medium" | "Hard";
export type DecisionEngine = "jev" | "laya";

export type WorkloadProfile = {
  inputTokens: number;
  outputTokens: number;
  baseSeconds: number;
};

export type Analysis = {
  complexity: Complexity;
  tier: Tier;
  confidence: number;
  probabilities: Record<Tier, number>;
  signals: Array<{ label: string; value: string }>;
};

export type LanePlan = {
  model: Model;
  inputTokens: number;
  outputTokens: number;
  modelCost: number;
  totalCost: number;
  totalSeconds: number;
};

export type RoutePlan = LanePlan & {
  decisionSeconds: number;
  jevCost: number;
  analysis: Analysis;
};

export type RunPlan = {
  route: RoutePlan;
  direct: LanePlan;
};

const JEV_INPUT_PRICE = 0.042;

const includesAny = (source: string, words: string[]) =>
  words.some((word) => source.includes(word));

export function analyzePrompt(prompt: string): Analysis {
  const source = prompt.toLowerCase();

  const hardSignals = [
    "race condition",
    "concurrent",
    "distributed",
    "architecture",
    "schema migration",
    "data migration",
    "deadlock",
    "memory leak",
    "rollback",
    "cross-service",
    "multi-file",
    "multi file",
    "root cause",
    "production incident",
    "consistency failure",
    "multiple services",
    "multiple modules",
    "multiple files"
  ];

  const mediumSignals = [
    "validation bug",
    "retry behavior",
    "pagination",
    "cache invalidation",
    "stale cache",
    "normalize",
    "feature flag",
    "query optimization",
    "api error",
    "async state",
    "regression test",
    "refactor the",
    "implement pagination",
    "preserve current behavior"
  ];

  const easySignals = [
    "fix a typo",
    "rename one local",
    "remove the unused import",
    "update one short ui label",
    "format the configuration object",
    "find where the exported helper",
    "add one concise comment",
    "replace one duplicated inline string union",
    "rename one test description",
    "replace the duplicated string literal",
    "do not change anything else",
    "do not modify files"
  ];

  const hardCount = hardSignals.filter((signal) => source.includes(signal)).length;
  const mediumCount = mediumSignals.filter((signal) => source.includes(signal)).length;
  const easyCount = easySignals.filter((signal) => source.includes(signal)).length;

  let complexity: Complexity;
  let tier: Tier;
  let confidence: number;
  let probabilities: Record<Tier, number>;

  if (hardCount >= 1) {
    complexity = "Hard";
    tier = "strong";
    confidence = hardCount >= 2 ? 95 : 91;
    probabilities = { fast: 3, balanced: 10, strong: 87 };
  } else if (easyCount >= 1 && hardCount === 0) {
    complexity = "Easy";
    tier = "fast";
    confidence = easyCount >= 2 ? 97 : 93;
    probabilities = { fast: 90, balanced: 8, strong: 2 };
  } else if (mediumCount >= 1 || prompt.length > 260) {
    complexity = "Medium";
    tier = "balanced";
    confidence = 89;
    probabilities = { fast: 10, balanced: 81, strong: 9 };
  } else {
    complexity = "Easy";
    tier = "fast";
    confidence = 88;
    probabilities = { fast: 84, balanced: 13, strong: 3 };
  }

  return {
    complexity,
    tier,
    confidence,
    probabilities,
    signals: [
      {
        label: "Complexity",
        value:
          complexity === "Hard"
            ? "High"
            : complexity === "Medium"
              ? "Medium"
              : "Low"
      },
      {
        label: "Context depth",
        value:
          prompt.length > 500
            ? "High"
            : prompt.length > 240
              ? "Medium"
              : "Low"
      },
      {
        label: "Routing basis",
        value:
          hardCount > 0
            ? "High-risk signals"
            : easyCount > 0
              ? "Bounded task"
              : mediumCount > 0
                ? "Multi-step task"
                : "Low complexity"
      }
    ]
  };
}

const outputByComplexity: Record<Complexity, number> = {
  Easy: 520,
  Medium: 1150,
  Hard: 2100
};

const contextByComplexity: Record<Complexity, number> = {
  Easy: 1800,
  Medium: 5200,
  Hard: 11200
};

const secondsByComplexity: Record<Complexity, number> = {
  Easy: 2.9,
  Medium: 5.15,
  Hard: 8.25
};

function tokenEstimate(prompt: string, complexity: Complexity): WorkloadProfile {
  const promptTokens = Math.max(80, Math.ceil(prompt.length / 4));
  return {
    inputTokens: promptTokens + contextByComplexity[complexity],
    outputTokens: outputByComplexity[complexity],
    baseSeconds: secondsByComplexity[complexity]
  };
}

const complexityRank: Record<Complexity, number> = {
  Easy: 0,
  Medium: 1,
  Hard: 2
};

const tierRank: Record<Tier, number> = {
  fast: 0,
  balanced: 1,
  strong: 2
};

type WorkloadAdjustment = {
  inputMultiplier: number;
  outputMultiplier: number;
  runtimeMultiplier: number;
  mismatchLevels: number;
};

/**
 * Simulation-only capability mismatch model.
 *
 * A workload describes the amount of work when an appropriately sized model
 * handles the task. If a fixed baseline is below the task's required tier,
 * the simulator expands context/input, generated output and runtime to model
 * extra agent loops, retries and re-reading of context.
 *
 * These multipliers are assumptions for the simulator, not vendor benchmark
 * measurements. They intentionally apply only when the model is under-tiered.
 */
function workloadAdjustment(
  model: Model,
  complexity: Complexity
): WorkloadAdjustment {
  const mismatchLevels = Math.max(
    0,
    complexityRank[complexity] - tierRank[model.tier]
  );

  if (mismatchLevels >= 2) {
    return {
      inputMultiplier: 4,
      outputMultiplier: 5,
      runtimeMultiplier: 3.8,
      mismatchLevels
    };
  }

  if (mismatchLevels === 1) {
    return {
      inputMultiplier: 1.65,
      outputMultiplier: 2,
      runtimeMultiplier: 1.8,
      mismatchLevels
    };
  }

  return {
    inputMultiplier: 1,
    outputMultiplier: 1,
    runtimeMultiplier: 1,
    mismatchLevels: 0
  };
}

function adaptWorkloadForModel(
  workload: WorkloadProfile,
  model: Model,
  complexity: Complexity
) {
  const adjustment = workloadAdjustment(model, complexity);

  return {
    inputTokens: Math.round(workload.inputTokens * adjustment.inputMultiplier),
    outputTokens: Math.round(workload.outputTokens * adjustment.outputMultiplier),
    baseSeconds: workload.baseSeconds * adjustment.runtimeMultiplier,
    mismatchLevels: adjustment.mismatchLevels
  };
}

function modelCost(model: Model, inputTokens: number, outputTokens: number) {
  return (
    (inputTokens / 1_000_000) * model.inputPrice +
    (outputTokens / 1_000_000) * model.outputPrice
  );
}

export function makeRunPlan(
  prompt: string,
  directModel: Model,
  workload?: WorkloadProfile,
  decisionEngine: DecisionEngine = "jev"
): RunPlan {
  const analysis = analyzePrompt(prompt);
  const routeModel = anthropicModelForTier(analysis.tier);
  const baseWorkload = workload ?? tokenEstimate(prompt, analysis.complexity);
  const routeWorkload = adaptWorkloadForModel(
    baseWorkload,
    routeModel,
    analysis.complexity
  );
  const directWorkload = adaptWorkloadForModel(
    baseWorkload,
    directModel,
    analysis.complexity
  );

  const routeModelCost = modelCost(
    routeModel,
    routeWorkload.inputTokens,
    routeWorkload.outputTokens
  );

  const directModelCost = modelCost(
    directModel,
    directWorkload.inputTokens,
    directWorkload.outputTokens
  );

  const jevInputTokens = Math.max(120, Math.ceil(prompt.length / 4) + 180);
  const jevCost =
    decisionEngine === "laya"
      ? 0
      : (jevInputTokens / 1_000_000) * JEV_INPUT_PRICE;

  let latencyHash = 2166136261;
  for (let index = 0; index < prompt.length; index += 1) {
    latencyHash ^= prompt.charCodeAt(index);
    latencyHash = Math.imul(latencyHash, 16777619);
  }
  const latencyUnit = (latencyHash >>> 0) / 4294967295;
  const complexityBase =
    analysis.complexity === "Easy"
      ? 0.105
      : analysis.complexity === "Medium"
        ? 0.135
        : 0.165;
  const lengthPenalty = Math.min(prompt.length, 900) / 900 * 0.045;
  const jitter = latencyUnit * 0.09;
  const decisionSeconds =
    decisionEngine === "laya"
      ? 0.0395
      : complexityBase + lengthPenalty + jitter;
  return {
    route: {
      model: routeModel,
      inputTokens: routeWorkload.inputTokens,
      outputTokens: routeWorkload.outputTokens,
      modelCost: routeModelCost,
      jevCost,
      totalCost: routeModelCost + jevCost,
      decisionSeconds,
      totalSeconds: Math.max(
        1.8,
        decisionSeconds + routeWorkload.baseSeconds * routeModel.speed
      ),
      analysis
    },
    direct: {
      model: directModel,
      inputTokens: directWorkload.inputTokens,
      outputTokens: directWorkload.outputTokens,
      modelCost: directModelCost,
      totalCost: directModelCost,
      totalSeconds: Math.max(
        1.8,
        directWorkload.baseSeconds * directModel.speed
      )
    }
  };
}
