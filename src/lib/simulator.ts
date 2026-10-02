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
  let score = 0;

  const hardSignals = [
    "security",
    "authentication",
    "race condition",
    "concurrent",
    "architecture",
    "migration",
    "root cause",
    "distributed",
    "database",
    "production",
    "multi-file",
    "multi file",
    "deadlock",
    "memory leak",
    "consistency",
    "privilege",
    "rollback",
    "cross-service"
  ];

  const mediumSignals = [
    "bug",
    "fix",
    "refactor",
    "feature",
    "test",
    "validation",
    "api",
    "component",
    "implement",
    "pagination",
    "cache",
    "retry",
    "query"
  ];

  const easySignals = [
    "typo",
    "rename",
    "readme",
    "format",
    "find",
    "comment",
    "copy",
    "unused import",
    "label",
    "string"
  ];

  if (includesAny(source, hardSignals)) score += 3;
  if (includesAny(source, mediumSignals)) score += 2;
  if (includesAny(source, easySignals)) score -= 1;
  if (prompt.length > 280) score += 1;
  if (prompt.length > 650) score += 1;

  if (score >= 4) {
    return {
      complexity: "Hard",
      tier: "strong",
      confidence: 92,
      probabilities: { fast: 4, balanced: 12, strong: 84 },
      signals: [
        { label: "Complexity", value: "High" },
        { label: "Context depth", value: prompt.length > 500 ? "High" : "Medium" },
        {
          label: "Risk",
          value: includesAny(source, [
            "security",
            "authentication",
            "database",
            "production",
            "privilege"
          ])
            ? "Elevated"
            : "Normal"
        }
      ]
    };
  }

  if (score >= 1) {
    return {
      complexity: "Medium",
      tier: "balanced",
      confidence: 89,
      probabilities: { fast: 10, balanced: 81, strong: 9 },
      signals: [
        { label: "Complexity", value: "Medium" },
        { label: "Context depth", value: "Medium" },
        {
          label: "Risk",
          value: includesAny(source, ["security", "authentication"])
            ? "Elevated"
            : "Normal"
        }
      ]
    };
  }

  return {
    complexity: "Easy",
    tier: "fast",
    confidence: 95,
    probabilities: { fast: 91, balanced: 7, strong: 2 },
    signals: [
      { label: "Complexity", value: "Low" },
      { label: "Context depth", value: "Low" },
      { label: "Risk", value: "Low" }
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
