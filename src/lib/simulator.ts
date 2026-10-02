import {
  anthropicModelForTier,
  type Model,
  type Tier
} from "../data/models";

export type Complexity = "Easy" | "Medium" | "Hard";

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
    "multiple modules"
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

  if (hardCount >= 1 || (mediumCount >= 2 && prompt.length > 320)) {
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

function modelCost(model: Model, inputTokens: number, outputTokens: number) {
  return (
    (inputTokens / 1_000_000) * model.inputPrice +
    (outputTokens / 1_000_000) * model.outputPrice
  );
}

export function makeRunPlan(
  prompt: string,
  directModel: Model,
  workload?: WorkloadProfile
): RunPlan {
  const analysis = analyzePrompt(prompt);
  const routeModel = anthropicModelForTier(analysis.tier);
  const tokenUsage = workload ?? tokenEstimate(prompt, analysis.complexity);

  const routeModelCost = modelCost(
    routeModel,
    tokenUsage.inputTokens,
    tokenUsage.outputTokens
  );

  const directModelCost = modelCost(
    directModel,
    tokenUsage.inputTokens,
    tokenUsage.outputTokens
  );

  const jevInputTokens = Math.max(120, Math.ceil(prompt.length / 4) + 180);
  const jevCost = (jevInputTokens / 1_000_000) * JEV_INPUT_PRICE;
  const decisionSeconds = 0.17 + Math.min(prompt.length, 900) / 9000;
  const baseSeconds = tokenUsage.baseSeconds;

  return {
    route: {
      model: routeModel,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      modelCost: routeModelCost,
      jevCost,
      totalCost: routeModelCost + jevCost,
      decisionSeconds,
      totalSeconds: Math.max(
        1.8,
        decisionSeconds + baseSeconds * routeModel.speed
      ),
      analysis
    },
    direct: {
      model: directModel,
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      modelCost: directModelCost,
      totalCost: directModelCost,
      totalSeconds: Math.max(1.8, baseSeconds * directModel.speed)
    }
  };
}
