import { describe, expect, it, vi } from "vitest";
import {
  PROMPT_POOL,
  generateBenchmarkSuite,
  resolveBatchSeed
} from "../data/benchmarks";
import { MODELS, getModel, modelsForProvider } from "../data/models";
import {
  costDeltaDisposition,
  routeTimelineEvents
} from "./presentation";
import { analyzePrompt, makeRunPlan, type Complexity, type WorkloadProfile } from "./simulator";

const representative: Record<Complexity, { prompt: string; workload: WorkloadProfile }> = {
  Easy: {
    prompt: "Fix a typo in the README and do not change anything else.",
    workload: { inputTokens: 3600, outputTokens: 725, baseSeconds: 3.85 }
  },
  Medium: {
    prompt: "Fix the validation bug, add a regression test, and preserve current behavior.",
    workload: { inputTokens: 15000, outputTokens: 2850, baseSeconds: 9.75 }
  },
  Hard: {
    prompt: "Investigate a distributed race condition across multiple services, find the root cause, and implement a safe rollback.",
    workload: { inputTokens: 49000, outputTokens: 7500, baseSeconds: 26 }
  }
};

describe("benchmark pool integrity", () => {
  it("contains 1,500 unique prompts split 500/500/500", () => {
    expect(PROMPT_POOL).toHaveLength(1500);
    expect(new Set(PROMPT_POOL.map((item) => item.variantKey)).size).toBe(1500);
    expect(PROMPT_POOL.filter((item) => item.level === "Easy")).toHaveLength(500);
    expect(PROMPT_POOL.filter((item) => item.level === "Medium")).toHaveLength(500);
    expect(PROMPT_POOL.filter((item) => item.level === "Hard")).toHaveLength(500);
  });

  it("honors a 100-case custom mix without replacement", () => {
    const suite = generateBenchmarkSuite("Full", 123456789, {
      easy: 8,
      medium: 8,
      hard: 84
    });

    expect(suite).toHaveLength(100);
    expect(new Set(suite.map((item) => item.variantKey)).size).toBe(100);
    expect(suite.filter((item) => item.level === "Easy")).toHaveLength(8);
    expect(suite.filter((item) => item.level === "Medium")).toHaveLength(8);
    expect(suite.filter((item) => item.level === "Hard")).toHaveLength(84);
  });

  it("keeps the displayed seed for a rerun and regenerates only for a new suite", () => {
    const seedFactory = vi.fn(() => 999);

    expect(resolveBatchSeed(123, false, seedFactory)).toBe(123);
    expect(seedFactory).not.toHaveBeenCalled();

    expect(resolveBatchSeed(123, true, seedFactory)).toBe(999);
    expect(seedFactory).toHaveBeenCalledTimes(1);
  });
});

describe("benchmark prompt classifier", () => {
  it("matches every generated benchmark label", () => {
    for (const item of PROMPT_POOL) {
      expect(analyzePrompt(item.prompt).complexity, item.id).toBe(item.level);
    }
  });

  it("does not let an easy-edit phrase hide a medium signal", () => {
    const result = analyzePrompt(
      "Fix a typo, add a regression test, and preserve current behavior."
    );
    expect(result.complexity).toBe("Medium");
    expect(result.tier).toBe("balanced");
    expect(
      result.signals.find((signal) => signal.label === "Routing basis")?.value
    ).toBe("Multi-step task");
  });
});

describe("Single Run workload profile", () => {
  it("uses representative batch-midpoint workloads for Easy/Medium/Hard", () => {
    const expected: Record<Complexity, [number, number, number]> = {
      Easy: [3600, 725, 3.85],
      Medium: [15000, 2850, 9.75],
      Hard: [49000, 7500, 26]
    };

    for (const level of ["Easy", "Medium", "Hard"] as Complexity[]) {
      const model =
        level === "Easy"
          ? getModel("claude-haiku-4-5")
          : level === "Medium"
            ? getModel("claude-sonnet-5-5")
            : getModel("claude-opus-5-5");
      const plan = makeRunPlan(representative[level].prompt, model);
      expect(plan.direct.inputTokens, level).toBe(expected[level][0]);
      expect(plan.direct.outputTokens, level).toBe(expected[level][1]);
      expect(
        plan.direct.totalSeconds / model.runtimeFactor,
        level
      ).toBeCloseTo(expected[level][2], 8);
    }
  });
});

describe("capability mismatch model", () => {
  it("uses benchmark ground truth even when the router under-classifies", () => {
    const haiku = getModel("claude-haiku-4-5");
    const workload = { inputTokens: 20_000, outputTokens: 4_000, baseSeconds: 20 };
    const plan = makeRunPlan(
      "Fix a typo in the README and do not change anything else.",
      haiku,
      workload,
      "jev",
      "Hard"
    );

    expect(plan.route.analysis.complexity).toBe("Easy");
    expect(plan.route.model.id).toBe("claude-haiku-4-5");
    expect(plan.route.mismatchLevels).toBe(2);
    expect(plan.direct.mismatchLevels).toBe(2);
    expect(plan.direct.inputTokens).toBe(80_000);
    expect(plan.direct.outputTokens).toBe(20_000);
  });

  it("applies no mismatch multiplier to correct-tier or stronger models", () => {
    const opus = getModel("claude-opus-5-5");
    const workload = representative.Hard.workload;
    const plan = makeRunPlan(
      representative.Hard.prompt,
      opus,
      workload,
      "jev",
      "Hard"
    );

    expect(plan.direct.mismatchLevels).toBe(0);
    expect(plan.direct.inputTokens).toBe(workload.inputTokens);
    expect(plan.direct.outputTokens).toBe(workload.outputTokens);
  });

  it("does not clamp valid fast runtimes to a UI animation floor", () => {
    const luna = getModel("gpt-6-luna");
    const haiku = getModel("claude-haiku-4-5");
    const workload = {
      inputTokens: 1200,
      outputTokens: 250,
      baseSeconds: 2.2
    };

    const direct = makeRunPlan(
      representative.Easy.prompt,
      luna,
      workload,
      "jev",
      "Easy"
    ).direct;
    const layaRoute = makeRunPlan(
      representative.Easy.prompt,
      haiku,
      workload,
      "laya",
      "Easy"
    ).route;

    expect(direct.totalSeconds).toBeCloseTo(2.2 * luna.runtimeFactor, 8);
    expect(layaRoute.totalSeconds).toBeCloseTo(
      0.0395 + 2.2 * haiku.runtimeFactor,
      8
    );
    expect(direct.totalSeconds).toBeLessThan(1.8);
    expect(layaRoute.totalSeconds).toBeLessThan(1.8);
  });

  it("keeps cost and runtime positive and increases workload severity for every configured model", () => {
    for (const model of MODELS) {
      const easy = makeRunPlan(
        representative.Easy.prompt,
        model,
        representative.Easy.workload,
        "jev",
        "Easy"
      ).direct;
      const medium = makeRunPlan(
        representative.Medium.prompt,
        model,
        representative.Medium.workload,
        "jev",
        "Medium"
      ).direct;
      const hard = makeRunPlan(
        representative.Hard.prompt,
        model,
        representative.Hard.workload,
        "jev",
        "Hard"
      ).direct;

      expect(easy.totalCost, model.id).toBeGreaterThan(0);
      expect(medium.totalCost, model.id).toBeGreaterThan(easy.totalCost);
      expect(hard.totalCost, model.id).toBeGreaterThan(medium.totalCost);

      expect(easy.totalSeconds, model.id).toBeGreaterThan(0);
      expect(medium.totalSeconds, model.id).toBeGreaterThan(easy.totalSeconds);
      expect(hard.totalSeconds, model.id).toBeGreaterThan(medium.totalSeconds);
    }
  });
});

describe("decision engines and route mapping", () => {
  it("maps easy/medium/hard to Haiku/Sonnet/Opus", () => {
    const direct = getModel("claude-opus-5-5");

    expect(
      makeRunPlan(representative.Easy.prompt, direct).route.model.id
    ).toBe("claude-haiku-4-5");
    expect(
      makeRunPlan(representative.Medium.prompt, direct).route.model.id
    ).toBe("claude-sonnet-5-5");
    expect(
      makeRunPlan(representative.Hard.prompt, direct).route.model.id
    ).toBe("claude-opus-5-5");
  });

  it("models Laya with zero API decision fee and fixed 39.5 ms latency", () => {
    const direct = getModel("claude-sonnet-5-5");
    const plan = makeRunPlan(
      representative.Medium.prompt,
      direct,
      representative.Medium.workload,
      "laya",
      "Medium"
    );

    expect(plan.route.jevCost).toBe(0);
    expect(plan.route.decisionSeconds).toBeCloseTo(0.0395, 8);
  });

  it("models JEV at the published $0.042 per million input-token rate", () => {
    const direct = getModel("claude-sonnet-5-5");
    const prompt = representative.Medium.prompt;
    const plan = makeRunPlan(
      prompt,
      direct,
      representative.Medium.workload,
      "jev",
      "Medium"
    );
    const estimatedDecisionTokens = Math.max(
      120,
      Math.ceil(prompt.length / 4) + 180
    );
    const expected = (estimatedDecisionTokens / 1_000_000) * 0.042;

    expect(plan.route.jevCost).toBeCloseTo(expected, 12);
  });
});

describe("model-family sanity", () => {
  it("has exactly one fast, balanced, and strong model for each provider", () => {
    for (const provider of ["anthropic", "openai"] as const) {
      const models = modelsForProvider(provider);
      expect(models).toHaveLength(3);
      expect(models.filter((model) => model.tier === "fast")).toHaveLength(1);
      expect(models.filter((model) => model.tier === "balanced")).toHaveLength(1);
      expect(models.filter((model) => model.tier === "strong")).toHaveLength(1);
    }
  });

  it("makes the matching tier the fastest simulated fit for each task level", () => {
    const taskLevels: Array<[Complexity, "fast" | "balanced" | "strong"]> = [
      ["Easy", "fast"],
      ["Medium", "balanced"],
      ["Hard", "strong"]
    ];

    for (const provider of ["anthropic", "openai"] as const) {
      const models = modelsForProvider(provider);

      for (const [level, expectedTier] of taskLevels) {
        const runtimes = models.map((model) => ({
          tier: model.tier,
          seconds: makeRunPlan(
            representative[level].prompt,
            model,
            representative[level].workload,
            "jev",
            level
          ).direct.totalSeconds
        }));
        const fastest = [...runtimes].sort((a, b) => a.seconds - b.seconds)[0];

        expect(fastest.tier, provider + " " + level).toBe(expectedTier);
      }
    }
  });
});

describe("configured standard list prices", () => {
  it("keeps the six model rates used by the October 2026 simulator profile", () => {
    const expected: Record<string, [number, number]> = {
      "claude-haiku-4-5": [1, 5],
      "claude-sonnet-5-5": [2, 10],
      "claude-opus-5-5": [4, 20],
      "gpt-6-luna": [0.1, 0.5],
      "gpt-6.1-sol": [2, 10],
      "gpt-6-astra": [10, 50]
    };

    for (const model of MODELS) {
      expect([model.inputPrice, model.outputPrice], model.id).toEqual(
        expected[model.id]
      );
    }
  });
});


describe("presentation consistency", () => {
  it("uses the same 0.2% tie band for cost verdicts and labels", () => {
    expect(costDeltaDisposition(0.2)).toBe("tie");
    expect(costDeltaDisposition(-0.2)).toBe("tie");
    expect(costDeltaDisposition(0.21)).toBe("route");
    expect(costDeltaDisposition(-0.21)).toBe("direct");
  });

  it("keeps routed timeline events chronological through model completion", () => {
    const events = routeTimelineEvents({
      totalSeconds: 1.6235,
      decisionSeconds: 0.0395,
      modelName: "Haiku 4.5",
      engineLabel: "Laya"
    });

    expect(events[0]).toEqual({ label: "Prompt received", at: 0 });
    expect(events[events.length - 1]).toEqual({
      label: "Response complete",
      at: 1.6235
    });
    expect(events.some((event) => event.label === "Haiku 4.5 started")).toBe(true);

    for (let index = 1; index < events.length; index += 1) {
      expect(events[index].at).toBeGreaterThanOrEqual(events[index - 1].at);
    }
  });
});
