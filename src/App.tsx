import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties
} from "react";
import {
  getModel,
  modelsForProvider,
  type Model,
  type Provider,
  type Tier
} from "./data/models";
import {
  GENERATED_POOL_NOTE,
  createBenchmarkSeed,
  generateBenchmarkSuite,
  suiteSize,
  type BenchmarkScope,
  type WorkloadMix
} from "./data/benchmarks";
import { makeRunPlan, type DecisionEngine, type RunPlan } from "./lib/simulator";

type Phase = "idle" | "countdown" | "running" | "done";
type Expectation = "Auto" | "Easy" | "Medium" | "Hard";
type WorkspaceMode = "single" | "batch";
type BatchPhase = "idle" | "running" | "done";
type WorkloadPreset = "Balanced" | "Light" | "Developer" | "Custom";
type StrategyKey = "jev" | "haiku" | "sonnet" | "opus";
type StrategyPoint = { run: number; jev: number; haiku: number; sonnet: number; opus: number };

type BatchResult = {
  caseId: string;
  title: string;
  expected: string;
  prompt: string;
  predicted: string;
  confidence: number;
  routedModel: string;
  directModel: string;
  jevDecisionCost: number;
  routedModelCost: number;
  routeCost: number;
  directCost: number;
  costDelta: number;
  decisionTime: number;
  routedModelTime: number;
  directTime: number;
  routedInputTokens: number;
  routedOutputTokens: number;
  directInputTokens: number;
  directOutputTokens: number;
  routeMismatchLevels: number;
  directMismatchLevels: number;
  routingMatch: boolean;
};

const DEFAULT_PROMPT =
  "Investigate an intermittent authentication race condition that appears under concurrent requests. Find the root cause, implement a safe fix, and add a regression test.";

const PRESETS = [
  {
    label: "Quick edit",
    prompt: "Fix the typo in the README heading and do not change anything else."
  },
  {
    label: "Everyday coding",
    prompt:
      "Fix the form validation bug, add a regression test, and keep the existing behavior unchanged."
  },
  {
    label: "Deep debugging",
    prompt: DEFAULT_PROMPT
  }
];

const WORKLOAD_PRESETS: Record<Exclude<WorkloadPreset, "Custom">, WorkloadMix> = {
  Balanced: { easy: 8, medium: 8, hard: 8 },
  Light: { easy: 14, medium: 7, hard: 3 },
  Developer: { easy: 6, medium: 11, hard: 7 }
};

const MAX_WORKLOAD_PROMPTS = 100;

const ENGINE_META: Record<
  DecisionEngine,
  {
    label: string;
    icon: string;
    routeTitle: string;
    aggregateTitle: string;
    decisionLabel: string;
    decisionCostLabel: string;
    profileKicker: string;
    profileValue: string;
    profileNote: string;
  }
> = {
  jev: {
    label: "JEV",
    icon: "J",
    routeTitle: "JEV Route",
    aggregateTitle: "JEV Aggregate",
    decisionLabel: "JEV DECISION",
    decisionCostLabel: "JEV DECISION COST",
    profileKicker: "SIMULATION PROFILE",
    profileValue: "Variable simulated latency · $0.042 / 1M input",
    profileNote: "Routing decision and timing are simulated"
  },
  laya: {
    label: "Laya",
    icon: "L",
    routeTitle: "Laya Route",
    aggregateTitle: "Laya Aggregate",
    decisionLabel: "LAYA DECISION",
    decisionCostLabel: "LAYA DECISION COST",
    profileKicker: "PUBLISHED PROFILE",
    profileValue: "39.5 ms · Tesla T4 · English checkpoint · $0 API fee",
    profileNote: "BENCHMARKS.md · self-hosted; hardware/electricity excluded · routing choice simulated"
  }
};

const STRATEGY_META: Record<StrategyKey, { label: string; className: string }> = {
  jev: { label: "JEV Route", className: "jev" },
  haiku: { label: "Always Haiku", className: "haiku" },
  sonnet: { label: "Always Sonnet", className: "sonnet" },
  opus: { label: "Always Opus", className: "opus" }
};

const tierLabel: Record<Tier, string> = {
  fast: "FAST",
  balanced: "BALANCED",
  strong: "STRONG"
};

function formatTime(seconds: number) {
  return seconds.toFixed(3) + " s";
}

function formatRuntimeSeconds(seconds: number) {
  return seconds.toFixed(seconds >= 100 ? 1 : 2) + " s";
}

function formatRuntimeContext(seconds: number) {
  if (seconds < 60) {
    return "capability-adjusted cumulative simulated runtime";
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return (
    "≈ " +
    minutes +
    "m " +
    remainder.toFixed(1) +
    "s · capability-adjusted cumulative runtime"
  );
}

function formatMoney(value: number) {
  if (value < 0.001) return "$" + value.toFixed(6);
  if (value < 0.1) return "$" + value.toFixed(4);
  return "$" + value.toFixed(3);
}

function formatTokens(value: number) {
  if (value >= 1000) return (value / 1000).toFixed(1) + "K";
  return String(value);
}

function deltaWinner(delta: number, routeLabel = "JEV Route") {
  if (delta > 0.2) return routeLabel;
  if (delta < -0.2) return "Direct";
  return "Tie";
}

function percentageDelta(baseline: number, candidate: number) {
  if (!baseline) return 0;
  return ((baseline - candidate) / baseline) * 100;
}

function deltaText(delta: number, engineLabel = "JEV") {
  if (Math.abs(delta) < 0.05) return "0.0% · tied";
  return Math.abs(delta).toFixed(1) + "% · " +
    (delta > 0 ? engineLabel + " cheaper" : engineLabel + " more expensive");
}

function formatLatency(seconds: number) {
  const ms = seconds * 1000;
  return (ms < 100 ? ms.toFixed(1) : ms.toFixed(0)) + " ms";
}

function formatDecisionTotal(seconds: number) {
  return seconds >= 1
    ? seconds.toFixed(3) + " s"
    : formatLatency(seconds);
}

function csvEscape(value: string | number | boolean) {
  const text = String(value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function IconMark({ label }: { label: string }) {
  return (
    <span className="icon-mark" aria-hidden="true">
      {label}
    </span>
  );
}

function Metric({
  label,
  value,
  sub,
  accent
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "jev" | "direct";
}) {
  return (
    <div className={"metric" + (accent ? " metric-" + accent : "")}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {sub ? <span className="metric-sub">{sub}</span> : null}
    </div>
  );
}

function ProbabilityBar({
  label,
  value,
  active
}: {
  label: string;
  value: number;
  active: boolean;
}) {
  const style = { "--bar-width": value + "%" } as CSSProperties;
  return (
    <div className={"probability-row" + (active ? " active" : "")}>
      <div className="probability-label">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="probability-track">
        <span className="probability-fill" style={style} />
      </div>
    </div>
  );
}

function Timeline({
  kind,
  elapsed,
  plan,
  done,
  engineLabel = "JEV"
}: {
  kind: "route" | "direct";
  elapsed: number;
  plan: RunPlan;
  done: boolean;
  engineLabel?: string;
}) {
  const route = plan.route;
  const total = kind === "route" ? route.totalSeconds : plan.direct.totalSeconds;
  const decision = kind === "route" ? route.decisionSeconds : 0;
  const events =
    kind === "route"
      ? [
          { label: "Prompt received", at: 0.04 },
          { label: engineLabel + " analyzing", at: Math.max(0.02, decision * 0.45) },
          { label: "Routing decision ready", at: decision }
        ]
      : [
          { label: "Prompt received", at: 0.04 },
          { label: "Direct model started", at: 0.18 },
          { label: "Generating response", at: total * 0.42 },
          { label: "Response complete", at: total }
        ];

  const nextIndex = events.findIndex((next) => elapsed < next.at);

  return (
    <div className="timeline" aria-label={kind + " execution timeline"}>
      {events.map((event, index) => {
        const reached = done || elapsed >= event.at;
        const active =
          reached &&
          !done &&
          index ===
            (nextIndex === -1
              ? events.length - 1
              : Math.max(0, nextIndex - 1));

        return (
          <div
            className={
              "timeline-item" +
              (reached ? " reached" : "") +
              (active ? " current" : "")
            }
            key={event.label}
          >
            <span className="timeline-dot" />
            <span>{event.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ModelOption({
  model,
  selected,
  disabled,
  onSelect
}: {
  model: Model;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={"model-option" + (selected ? " selected" : "")}
      onClick={onSelect}
      disabled={disabled}
      type="button"
    >
      <span className="model-radio" />
      <span className="model-copy">
        <strong>{model.name}</strong>
        <small>{model.descriptor}</small>
      </span>
      <span className={"tier-pill tier-" + model.tier}>
        {tierLabel[model.tier]}
      </span>
    </button>
  );
}

function DirectSelector({
  provider,
  directModel,
  locked,
  onProvider,
  onModel
}: {
  provider: Provider;
  directModel: Model;
  locked: boolean;
  onProvider: (provider: Provider) => void;
  onModel: (id: string) => void;
}) {
  if (locked) {
    return (
      <div className="direct-focus-stage">
        <span className="focus-kicker">LOCKED BASELINE</span>
        <div className="focus-model-mark">M</div>
        <h3>{directModel.name}</h3>
        <p>
          {directModel.providerLabel} · {tierLabel[directModel.tier]}
        </p>
        <div className="focus-price-row">
          <span>{"Input $" + directModel.inputPrice + "/M"}</span>
          <span>{"Output $" + directModel.outputPrice + "/M"}</span>
        </div>
        <span className="no-router focus-no-router">NO ROUTER</span>
      </div>
    );
  }

  return (
    <>
      <div className="provider-switch">
        <button
          type="button"
          className={provider === "anthropic" ? "active" : ""}
          onClick={() => onProvider("anthropic")}
        >
          Anthropic
        </button>
        <button
          type="button"
          className={provider === "openai" ? "active" : ""}
          onClick={() => onProvider("openai")}
        >
          OpenAI
        </button>
      </div>

      <div className="model-list">
        {modelsForProvider(provider).map((model) => (
          <ModelOption
            key={model.id}
            model={model}
            selected={model.id === directModel.id}
            disabled={false}
            onSelect={() => onModel(model.id)}
          />
        ))}
      </div>

      <div className="direct-selected">
        <div>
          <span className="micro-label">DIRECT CALL</span>
          <strong>{directModel.name}</strong>
        </div>
        <span className="no-router">NO ROUTER</span>
      </div>
    </>
  );
}

function DecisionEngineSwitch({
  engine,
  locked,
  onEngine
}: {
  engine: DecisionEngine;
  locked: boolean;
  onEngine: (engine: DecisionEngine) => void;
}) {
  const meta = ENGINE_META[engine];

  return (
    <div className="engine-control">
      <div className="provider-switch engine-switch" aria-label="Decision engine">
        <button
          type="button"
          className={engine === "jev" ? "active" : ""}
          disabled={locked}
          onClick={() => onEngine("jev")}
        >
          JEV
        </button>
        <button
          type="button"
          className={engine === "laya" ? "active" : ""}
          disabled={locked}
          onClick={() => onEngine("laya")}
        >
          Laya
        </button>
      </div>
      <div className={"engine-profile engine-profile-" + engine}>
        <span>{meta.profileKicker}</span>
        <strong>{meta.profileValue}</strong>
        <small>{meta.profileNote}</small>
      </div>
    </div>
  );
}

function CostRaceChart({
  points,
  totalRuns,
  strategyLabels
}: {
  points: StrategyPoint[];
  totalRuns: number;
  strategyLabels: Record<StrategyKey, string>;
}) {
  const width = 720;
  const height = 230;
  const pad = { left: 44, right: 18, top: 18, bottom: 32 };
  const maxRun = Math.max(1, totalRuns);
  const maxCost = Math.max(0.001, ...points.flatMap((point) => [point.jev, point.haiku, point.sonnet, point.opus]));

  const x = (run: number) =>
    pad.left + (run / maxRun) * (width - pad.left - pad.right);
  const y = (cost: number) =>
    height - pad.bottom - (cost / maxCost) * (height - pad.top - pad.bottom);

  const polyline = (key: StrategyKey) =>
    points.map((point) => `${x(point.run)},${y(point[key])}`).join(" ");

  const grid = [0.25, 0.5, 0.75, 1];

  return (
    <div className="cost-race-chart">
      <div className="cost-race-head">
        <div>
          <span>CUMULATIVE COST</span>
          <strong>Same prompts · four strategies</strong>
        </div>
        <small>{points[points.length - 1]?.run ?? 0}/{totalRuns} runs</small>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cumulative strategy cost chart">
        {grid.map((ratio) => (
          <g key={ratio}>
            <line
              className="chart-grid-line"
              x1={pad.left}
              x2={width - pad.right}
              y1={y(maxCost * ratio)}
              y2={y(maxCost * ratio)}
            />
            <text className="chart-axis-label" x={4} y={y(maxCost * ratio) + 4}>
              {formatMoney(maxCost * ratio)}
            </text>
          </g>
        ))}
        {(["jev", "haiku", "sonnet", "opus"] as StrategyKey[]).map((key) => (
          <polyline
            key={key}
            className={`cost-line ${STRATEGY_META[key].className}`}
            points={polyline(key)}
            fill="none"
          />
        ))}
        <text className="chart-axis-label chart-axis-end" x={width - pad.right} y={height - 8}>
          {maxRun} prompts
        </text>
      </svg>
      <div className="cost-race-legend">
        {(["jev", "haiku", "sonnet", "opus"] as StrategyKey[]).map((key) => (
          <div key={key} className={`legend-item ${STRATEGY_META[key].className}`}>
            <span />
            <strong>{strategyLabels[key]}</strong>
            <b>{formatMoney(points[points.length - 1]?.[key] ?? 0)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("single");
  const [decisionEngine, setDecisionEngine] = useState<DecisionEngine>("jev");

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [modelId, setModelId] = useState("claude-opus-5-5");
  const [expectation, setExpectation] = useState<Expectation>("Auto");
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [currentPlan, setCurrentPlan] = useState<RunPlan | null>(null);

  const [batchScope, setBatchScope] = useState<BenchmarkScope>("Full");
  const [batchPhase, setBatchPhase] = useState<BatchPhase>("idle");
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchSeed, setBatchSeed] = useState(() => createBenchmarkSeed());
  const [workloadPreset, setWorkloadPreset] = useState<WorkloadPreset>("Balanced");
  const [workloadMix, setWorkloadMix] = useState<WorkloadMix>({ easy: 8, medium: 8, hard: 8 });

  const directModel = getModel(modelId);
  const engineMeta = ENGINE_META[decisionEngine];
  const previewPlan = useMemo(
    () => makeRunPlan(prompt, directModel, undefined, decisionEngine),
    [prompt, directModel, decisionEngine]
  );
  const livePlan = currentPlan ?? previewPlan;
  const selectedCases = useMemo(
    () => generateBenchmarkSuite(batchScope, batchSeed, workloadMix),
    [batchScope, batchSeed, workloadMix]
  );

  const workloadTotal = workloadMix.easy + workloadMix.medium + workloadMix.hard;
  const workloadValid =
    batchScope !== "Full" ||
    (workloadTotal > 0 && workloadTotal <= MAX_WORKLOAD_PROMPTS);

  useEffect(() => {
    if (phase !== "countdown") return;

    const timer = window.setTimeout(() => {
      if (countdown > 0) {
        setCountdown((value) => value - 1);
      } else {
        setPhase("running");
      }
    }, countdown === 0 ? 420 : 620);

    return () => window.clearTimeout(timer);
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== "running" || !currentPlan) return;

    const start = performance.now();
    const maxDuration =
      Math.max(
        currentPlan.route.totalSeconds,
        currentPlan.direct.totalSeconds
      ) + 0.08;

    const interval = window.setInterval(() => {
      const seconds = (performance.now() - start) / 1000;
      setElapsed(Math.min(seconds, maxDuration));

      if (seconds >= maxDuration) {
        window.clearInterval(interval);
        setElapsed(maxDuration);
        setPhase("done");
      }
    }, 24);

    return () => window.clearInterval(interval);
  }, [phase, currentPlan]);

  useEffect(() => {
    if (batchPhase !== "running") return;

    const item = selectedCases[batchIndex];
    if (!item) {
      setBatchPhase("done");
      return;
    }

    const timer = window.setTimeout(() => {
      const plan = makeRunPlan(
        item.prompt,
        directModel,
        item.workload,
        decisionEngine,
        item.level
      );
      const routeCostDelta = percentageDelta(
        plan.direct.totalCost,
        plan.route.totalCost
      );
      const result: BatchResult = {
        caseId: item.id,
        title: item.title,
        expected: item.level,
        prompt: item.prompt,
        predicted: plan.route.analysis.complexity,
        confidence: plan.route.analysis.confidence,
        routedModel: plan.route.model.name,
        directModel: plan.direct.model.name,
        jevDecisionCost: plan.route.jevCost,
        routedModelCost: plan.route.modelCost,
        routeCost: plan.route.totalCost,
        directCost: plan.direct.totalCost,
        costDelta: routeCostDelta,
        decisionTime: plan.route.decisionSeconds,
        routedModelTime: Math.max(
          0,
          plan.route.totalSeconds - plan.route.decisionSeconds
        ),
        directTime: plan.direct.totalSeconds,
        routedInputTokens: plan.route.inputTokens,
        routedOutputTokens: plan.route.outputTokens,
        directInputTokens: plan.direct.inputTokens,
        directOutputTokens: plan.direct.outputTokens,
        routeMismatchLevels: plan.route.mismatchLevels,
        directMismatchLevels: plan.direct.mismatchLevels,
        routingMatch: plan.route.analysis.complexity === item.level
      };

      setBatchResults((results) => [...results, result]);

      if (batchIndex + 1 >= selectedCases.length) {
        setBatchIndex(selectedCases.length);
        setBatchPhase("done");
      } else {
        setBatchIndex((index) => index + 1);
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [batchPhase, batchIndex, selectedCases, directModel, decisionEngine]);

  const isLocked = phase === "countdown" || phase === "running";
  const isRaceActive = phase === "countdown" || phase === "running";

  const directProgress =
    phase === "running" || phase === "done"
      ? Math.min(elapsed / livePlan.direct.totalSeconds, 1)
      : 0;

  const decisionVisible =
    phase === "done" ||
    (phase === "running" && elapsed >= livePlan.route.decisionSeconds);

  const routeDone =
    phase === "done" ||
    (phase === "running" && elapsed >= livePlan.route.totalSeconds);

  const directDone =
    phase === "done" ||
    (phase === "running" && elapsed >= livePlan.direct.totalSeconds);

  const directCost =
    phase === "idle" || phase === "countdown"
      ? 0
      : livePlan.direct.totalCost * directProgress;

  const jevDecisionCostLive =
    phase === "idle" || phase === "countdown"
      ? 0
      : livePlan.route.jevCost *
        Math.min(
          livePlan.route.decisionSeconds
            ? elapsed / livePlan.route.decisionSeconds
            : 1,
          1
        );

  const routedModelCostLive =
    phase === "idle" || phase === "countdown" || !decisionVisible
      ? 0
      : livePlan.route.modelCost *
        Math.min(
          Math.max(
            0,
            (elapsed - livePlan.route.decisionSeconds) /
              Math.max(
                0.001,
                livePlan.route.totalSeconds - livePlan.route.decisionSeconds
              )
          ),
          1
        );

  const totalRouteCostLive = jevDecisionCostLive + routedModelCostLive;

  const routeSaving =
    percentageDelta(livePlan.direct.totalCost, livePlan.route.totalCost);
  const sameModel = livePlan.route.model.id === livePlan.direct.model.id;

  const verdictHeadline = sameModel
    ? decisionEngine === "laya"
      ? "Same model. Laya adds decision latency, but no API fee."
      : "Same model. JEV added only routing overhead."
    : routeSaving > 0.2
      ? engineMeta.label + " routing used less money on this task."
      : routeSaving < -0.2
        ? "The direct path used less money on this task."
        : "Cost was effectively tied on this task.";

  const confidenceStyle = {
    "--confidence": livePlan.route.analysis.confidence + "%"
  } as CSSProperties;

  const batchCurrent = selectedCases[Math.min(batchIndex, selectedCases.length - 1)];
  const batchCurrentPlan = useMemo(
    () =>
      batchCurrent
        ? makeRunPlan(
            batchCurrent.prompt,
            directModel,
            batchCurrent.workload,
            decisionEngine,
            batchCurrent.level
          )
        : null,
    [batchCurrent, directModel, decisionEngine]
  );

  const routingFeed = useMemo(() => {
    const completed: Array<{
      key: string;
      caseId: string;
      title: string;
      predicted: string;
      confidence: number;
      model: string;
      decisionTime: number;
      status: "done" | "live";
    }> = batchResults.map((item, index) => ({
      key: item.caseId + "-" + index,
      caseId: item.caseId,
      title: item.title,
      predicted: item.predicted,
      confidence: item.confidence,
      model: item.routedModel,
      decisionTime: item.decisionTime,
      status: "done" as const
    }));

    if (
      batchPhase === "running" &&
      batchCurrent &&
      batchCurrentPlan &&
      !completed.some((item) => item.caseId === batchCurrent.id)
    ) {
      completed.push({
        key: batchCurrent.id + "-live",
        caseId: batchCurrent.id,
        title: batchCurrent.title,
        predicted: batchCurrentPlan.route.analysis.complexity,
        confidence: batchCurrentPlan.route.analysis.confidence,
        model: batchCurrentPlan.route.model.name,
        decisionTime: batchCurrentPlan.route.decisionSeconds,
        status: "live" as const
      });
    }

    return completed.slice(-8).reverse();
  }, [batchResults, batchPhase, batchCurrent, batchCurrentPlan]);

  const batchProgress =
    batchPhase === "done"
      ? 100
      : selectedCases.length
        ? (batchResults.length / selectedCases.length) * 100
        : 0;

  const batchTotals = useMemo(() => {
    const jevDecisionCostTotal = batchResults.reduce(
      (sum, item) => sum + item.jevDecisionCost,
      0
    );
    const routedModelCostTotal = batchResults.reduce(
      (sum, item) => sum + item.routedModelCost,
      0
    );
    const routeCostTotal = batchResults.reduce(
      (sum, item) => sum + item.routeCost,
      0
    );
    const directCostTotal = batchResults.reduce(
      (sum, item) => sum + item.directCost,
      0
    );
    const decisionTimeTotal = batchResults.reduce(
      (sum, item) => sum + item.decisionTime,
      0
    );
    const routedModelTimeTotal = batchResults.reduce(
      (sum, item) => sum + item.routedModelTime,
      0
    );
    const directTimeTotal = batchResults.reduce(
      (sum, item) => sum + item.directTime,
      0
    );
    const confidenceAverage = batchResults.length
      ? batchResults.reduce((sum, item) => sum + item.confidence, 0) /
        batchResults.length
      : 0;
    const routingMatches = batchResults.filter(
      (item) => item.routingMatch
    ).length;

    const distribution = batchResults.reduce(
      (acc, item) => {
        if (item.routedModel.includes("Haiku")) acc.haiku += 1;
        else if (item.routedModel.includes("Sonnet")) acc.sonnet += 1;
        else if (item.routedModel.includes("Opus")) acc.opus += 1;
        return acc;
      },
      { haiku: 0, sonnet: 0, opus: 0 }
    );

    return {
      jevDecisionCostTotal,
      routedModelCostTotal,
      routeCostTotal,
      directCostTotal,
      decisionTimeTotal,
      routedModelTimeTotal,
      directTimeTotal,
      averageDecisionTime: batchResults.length
        ? decisionTimeTotal / batchResults.length
        : 0,
      confidenceAverage,
      routingMatches,
      distribution,
      costDelta: percentageDelta(directCostTotal, routeCostTotal)
    };
  }, [batchResults]);

  const fixedStrategyModels = useMemo(() => {
    const providerModels = modelsForProvider(provider);
    return {
      haiku:
        providerModels.find((model) => model.tier === "fast") ??
        providerModels[0],
      sonnet:
        providerModels.find((model) => model.tier === "balanced") ??
        providerModels[0],
      opus:
        providerModels.find((model) => model.tier === "strong") ??
        providerModels[providerModels.length - 1]
    };
  }, [provider]);

  const strategyLabels: Record<StrategyKey, string> = {
    jev: engineMeta.label + " Route",
    haiku: "Always " + fixedStrategyModels.haiku.compactName,
    sonnet: "Always " + fixedStrategyModels.sonnet.compactName,
    opus: "Always " + fixedStrategyModels.opus.compactName
  };

  const strategyComparison = useMemo(() => {
    const casesById = new Map(selectedCases.map((item) => [item.id, item]));
    const totals = { jev: 0, haiku: 0, sonnet: 0, opus: 0 };
    const points: StrategyPoint[] = [{ run: 0, ...totals }];

    batchResults.forEach((result, index) => {
      const item = casesById.get(result.caseId);
      if (!item) return;

      totals.jev += result.routeCost;
      totals.haiku += makeRunPlan(
        item.prompt,
        fixedStrategyModels.haiku,
        item.workload,
        decisionEngine,
        item.level
      ).direct.totalCost;
      totals.sonnet += makeRunPlan(
        item.prompt,
        fixedStrategyModels.sonnet,
        item.workload,
        decisionEngine,
        item.level
      ).direct.totalCost;
      totals.opus += makeRunPlan(
        item.prompt,
        fixedStrategyModels.opus,
        item.workload,
        decisionEngine,
        item.level
      ).direct.totalCost;

      points.push({ run: index + 1, ...totals });
    });

    return { totals: { ...totals }, points };
  }, [
    batchResults,
    selectedCases,
    fixedStrategyModels,
    decisionEngine
  ]);

  const liveDistribution = useMemo(() => {
    const counts = { haiku: 0, sonnet: 0, opus: 0 };

    batchResults.forEach((item) => {
      if (item.routedModel.includes("Haiku")) counts.haiku += 1;
      else if (item.routedModel.includes("Sonnet")) counts.sonnet += 1;
      else if (item.routedModel.includes("Opus")) counts.opus += 1;
    });

    if (
      batchPhase === "running" &&
      batchCurrentPlan &&
      batchCurrent &&
      !batchResults.some((item) => item.caseId === batchCurrent.id)
    ) {
      if (batchCurrentPlan.route.model.name.includes("Haiku")) counts.haiku += 1;
      else if (batchCurrentPlan.route.model.name.includes("Sonnet")) counts.sonnet += 1;
      else if (batchCurrentPlan.route.model.name.includes("Opus")) counts.opus += 1;
    }

    return counts;
  }, [batchResults, batchPhase, batchCurrent, batchCurrentPlan]);

  const liveDecisionCount =
    liveDistribution.haiku + liveDistribution.sonnet + liveDistribution.opus;

  const levelSummaries = useMemo(() => {
    return (["Easy", "Medium", "Hard"] as const).map((level) => {
      const items = batchResults.filter((item) => item.expected === level);
      const routeCost = items.reduce((sum, item) => sum + item.routeCost, 0);
      const directCost = items.reduce((sum, item) => sum + item.directCost, 0);
      const decisionTime = items.reduce(
        (sum, item) => sum + item.decisionTime,
        0
      );

      return {
        level,
        count: items.length,
        costDelta: percentageDelta(directCost, routeCost),
        averageDecisionTime: items.length ? decisionTime / items.length : 0,
        routeCost,
        directCost
      };
    });
  }, [batchResults]);

  const run = () => {
    if (!prompt.trim() || isLocked) return;

    const plan = makeRunPlan(prompt, directModel, undefined, decisionEngine);
    setCurrentPlan(plan);
    setElapsed(0);
    setCountdown(3);
    setPhase("countdown");
  };

  const reset = () => {
    setPhase("idle");
    setCountdown(3);
    setElapsed(0);
    setCurrentPlan(null);
  };

  const startBatch = () => {
    if (batchPhase === "running" || !workloadValid) return;
    setBatchSeed(createBenchmarkSeed());
    setBatchResults([]);
    setBatchIndex(0);
    setBatchPhase("running");
  };

  const resetBatch = () => {
    setBatchPhase("idle");
    setBatchIndex(0);
    setBatchResults([]);
  };

  const shuffleBatch = () => {
    setBatchSeed(createBenchmarkSeed());
    setBatchPhase("idle");
    setBatchIndex(0);
    setBatchResults([]);
  };

  const applyWorkloadPreset = (preset: WorkloadPreset) => {
    if (batchPhase === "running") return;
    setWorkloadPreset(preset);
    if (preset !== "Custom") {
      setWorkloadMix({ ...WORKLOAD_PRESETS[preset] });
    }
    setBatchSeed(createBenchmarkSeed());
    resetBatch();
  };

  const updateWorkloadMix = (key: keyof WorkloadMix, value: number) => {
    if (batchPhase === "running") return;
    setWorkloadPreset("Custom");
    setWorkloadMix((current) => {
      const otherTotal =
        (key === "easy" ? 0 : current.easy) +
        (key === "medium" ? 0 : current.medium) +
        (key === "hard" ? 0 : current.hard);
      const allowed = Math.max(0, MAX_WORKLOAD_PROMPTS - otherTotal);

      return {
        ...current,
        [key]: Math.max(0, Math.min(allowed, value))
      };
    });
    setBatchResults([]);
    setBatchIndex(0);
    setBatchPhase("idle");
  };

  const chooseDecisionEngine = (next: DecisionEngine) => {
    if (isLocked || batchPhase === "running" || next === decisionEngine) return;
    setDecisionEngine(next);
    reset();
    resetBatch();
  };

  const chooseProvider = (next: Provider) => {
    setProvider(next);
    const nextModels = modelsForProvider(next);
    const preferred =
      nextModels.find((model) => model.tier === directModel.tier) ??
      nextModels[0];
    setModelId(preferred.id);
    reset();
    resetBatch();
  };

  const selectDirectModel = (id: string) => {
    setModelId(id);
    reset();
    resetBatch();
  };

  const switchWorkspace = (next: WorkspaceMode) => {
    if (isLocked || batchPhase === "running") return;
    setWorkspaceMode(next);
  };

  const exportBatchCsv = () => {
    if (!batchResults.length) return;

    const header = [
      "Case ID",
      "Title",
      "Expected Level",
      engineMeta.label + " Predicted Level",
      "Confidence %",
      "Routed Model",
      "Direct Model",
      engineMeta.label + " Decision Cost USD",
      "Routed Model Cost USD",
      engineMeta.label + " Route Cost USD",
      "Direct Cost USD",
      "Cost Delta vs Direct %",
      engineMeta.label + " Decision Latency ms",
      "Routed Model Runtime s",
      "Direct Model Runtime s",
      "Simulated Tier Match",
      "Routed Effective Input Tokens",
      "Routed Effective Output Tokens",
      "Direct Effective Input Tokens",
      "Direct Effective Output Tokens",
      "Route Mismatch Levels",
      "Direct Mismatch Levels",
      "Suite Seed",
      "Prompt"
    ];

    const rows = batchResults.map((item) => [
      item.caseId,
      item.title,
      item.expected,
      item.predicted,
      item.confidence,
      item.routedModel,
      item.directModel,
      item.jevDecisionCost.toFixed(8),
      item.routedModelCost.toFixed(8),
      item.routeCost.toFixed(8),
      item.directCost.toFixed(8),
      item.costDelta.toFixed(2),
      (item.decisionTime * 1000).toFixed(1),
      item.routedModelTime.toFixed(4),
      item.directTime.toFixed(4),
      item.routingMatch,
      item.routedInputTokens,
      item.routedOutputTokens,
      item.directInputTokens,
      item.directOutputTokens,
      item.routeMismatchLevels,
      item.directMismatchLevels,
      batchSeed,
      item.prompt
    ]);

    rows.push([
      "SUMMARY",
      batchScope + " suite",
      batchResults.length + " cases",
      "",
      batchTotals.confidenceAverage.toFixed(1),
      "Haiku " +
        batchTotals.distribution.haiku +
        " / Sonnet " +
        batchTotals.distribution.sonnet +
        " / Opus " +
        batchTotals.distribution.opus,
      directModel.name,
      batchTotals.jevDecisionCostTotal.toFixed(8),
      batchTotals.routedModelCostTotal.toFixed(8),
      batchTotals.routeCostTotal.toFixed(8),
      batchTotals.directCostTotal.toFixed(8),
      batchTotals.costDelta.toFixed(2),
      (batchTotals.averageDecisionTime * 1000).toFixed(1),
      batchTotals.routedModelTimeTotal.toFixed(4),
      batchTotals.directTimeTotal.toFixed(4),
      batchTotals.routingMatches + "/" + batchResults.length,
      "",
      "",
      "",
      "",
      "",
      "",
      batchSeed,
      "Quality is not evaluated in Simulation mode."
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((value) => csvEscape(value)).join(","))
      .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      "JEVArena-" +
      batchScope.toLowerCase() +
      "-" +
      batchResults.length +
      "-results.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">J</div>
          <div>
            <div className="brand-name">JEVArena</div>
            <div className="brand-sub">Visual model-routing benchmark</div>
          </div>
        </div>

        <div className="topbar-center">
          <div className="mode-switch" aria-label="Benchmark mode">
            <button className="mode active" type="button">
              Simulation
            </button>
            <button
              className="mode"
              disabled
              type="button"
              title="Live API bridge is the next milestone"
            >
              Live <span className="soon">NEXT</span>
            </button>
          </div>
        </div>

        <nav className="topbar-actions" aria-label="External links">
          <a
            className="external-link-button website-link"
            href="https://pouramin.dev/"
            target="_blank"
            rel="noreferrer"
            aria-label="Amin Pour website"
            title="pouramin.dev"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a14.5 14.5 0 0 1 0 18M12 3a14.5 14.5 0 0 0 0 18" />
            </svg>
          </a>
          <a
            className="external-link-button youtube-link"
            href="https://www.youtube.com/@TunnelLab"
            target="_blank"
            rel="noreferrer"
            aria-label="TunnelLab on YouTube"
            title="TunnelLab on YouTube"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                className="youtube-shell"
                d="M21.4 6.4a2.9 2.9 0 0 0-2-2C17.6 4 12 4 12 4s-5.6 0-7.4.4a2.9 2.9 0 0 0-2 2C2.2 8.2 2.2 12 2.2 12s0 3.8.4 5.6a2.9 2.9 0 0 0 2 2C6.4 20 12 20 12 20s5.6 0 7.4-.4a2.9 2.9 0 0 0 2-2c.4-1.8.4-5.6.4-5.6s0-3.8-.4-5.6Z"
              />
              <path className="youtube-play" d="m10 15.2 5-3.2-5-3.2v6.4Z" />
            </svg>
          </a>
          <a
            className="external-link-button telegram-link"
            href="https://t.me/TunneLab"
            target="_blank"
            rel="noreferrer"
            aria-label="TunnelLab on Telegram"
            title="TunnelLab on Telegram"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                className="telegram-shell"
                d="M21.2 4.2 18.1 19c-.2 1-1 1.2-1.8.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.9 8.9-8c.4-.3-.1-.5-.6-.2L5.9 12.8 1.2 11.3c-1-.3-1-1 .2-1.5L19.8 3c.9-.3 1.6.2 1.4 1.2Z"
              />
            </svg>
          </a>
          <a
            className="external-link-button coffee-link"
            href="https://buymeacoffee.com/pouramin"
            target="_blank"
            rel="noreferrer"
            aria-label="Buy me a coffee"
            title="Buy me a coffee"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 8h11v5.4A5.6 5.6 0 0 1 10.4 19H9.6A4.6 4.6 0 0 1 5 14.4V8Z" />
              <path d="M16 10h1.4a2.6 2.6 0 1 1 0 5.2H16" />
              <path d="M7 5.2c.8-.8.8-1.6 0-2.4M11 5.2c.8-.8.8-1.6 0-2.4M15 5.2c.8-.8.8-1.6 0-2.4" />
            </svg>
          </a>
        </nav>
      </header>

      <section className="hero-copy">
        <div>
          <span className="eyebrow">
            {workspaceMode === "single"
              ? "ONE PROMPT · TWO PATHS"
              : "AUTOMATED ROUTING LAB"}
          </span>
          <h1>
            {workspaceMode === "single"
              ? "Watch the routing decision happen."
              : "Sample up to 100 prompts from a 1,500-prompt pool."}
          </h1>
        </div>
        {workspaceMode === "single" ? (
          <p>
            {engineMeta.label} is the decision profile on the left. You choose the
            direct baseline on the right. Cost and latency race in real time.
          </p>
        ) : null}
      </section>


      {workspaceMode === "single" ? (
        <section
          className={
            "arena-grid" +
            (isRaceActive ? " race-active" : "") +
            (phase === "done" ? " race-complete" : "")
          }
        >
          {phase === "countdown" ? (
            <div className="countdown-overlay" aria-live="assertive">
              <div className="countdown-core">
                <span>{countdown === 0 ? "GO" : countdown}</span>
                <small>Same prompt. Both paths.</small>
              </div>
            </div>
          ) : null}

          <article
            className={
              "lane-card jev-lane" +
              (phase === "running" ? " is-running" : "") +
              (routeDone ? " is-done" : "")
            }
          >
            <div className="lane-head">
              <div className="lane-title">
                <IconMark label={engineMeta.icon} />
                <div>
                  <span className="lane-kicker">ROUTED PATH</span>
                  <h2>{engineMeta.routeTitle}</h2>
                </div>
              </div>
              <span className="status-pill status-jev">
                {phase === "idle"
                  ? "READY"
                  : phase === "countdown"
                    ? "ARMED"
                    : routeDone
                      ? "DONE"
                      : decisionVisible
                        ? "MODEL RUNNING"
                        : "DECIDING"}
              </span>
            </div>

            <DecisionEngineSwitch
              engine={decisionEngine}
              locked={isLocked || batchPhase === "running"}
              onEngine={chooseDecisionEngine}
            />

            <div className="route-stage">
              {phase === "idle" || phase === "countdown" ? (
                <div className="decision-idle">
                  <div
                    className={
                      "decision-orb" + (phase === "countdown" ? " armed" : "")
                    }
                  >
                    <span />
                    <b>{engineMeta.label}</b>
                  </div>
                  <p>
                    {phase === "countdown"
                      ? "Prompt locked. Waiting for the start."
                      : "Decision hidden until the race starts."}
                  </p>
                  <small>
                    {decisionEngine === "laya"
                      ? "Routing stays simulated; Laya's published latency and zero API fee are applied."
                      : "JEV will classify the task and reveal the selected model only after launch."}
                  </small>
                </div>
              ) : !decisionVisible ? (
                <div className="decision-loading" aria-live="polite">
                  <div className="decision-orb working">
                    <span />
                    <b>{engineMeta.label}</b>
                  </div>
                  <strong>Reading the task...</strong>
                  <small>Scoring complexity, risk and context depth</small>
                </div>
              ) : (
                <div className="decision-result" aria-live="polite">
                  <div className="decision-banner">
                    <div>
                      <span className="micro-label">
                        {"SIMULATED " + engineMeta.decisionLabel}
                      </span>
                      <strong>{livePlan.route.analysis.complexity}</strong>
                    </div>
                    <div className="confidence-ring" style={confidenceStyle}>
                      <strong>{livePlan.route.analysis.confidence}%</strong>
                      <span>simulated confidence</span>
                    </div>
                  </div>

                  <div className="probabilities">
                    <ProbabilityBar
                      label="Haiku"
                      value={livePlan.route.analysis.probabilities.fast}
                      active={livePlan.route.analysis.tier === "fast"}
                    />
                    <ProbabilityBar
                      label="Sonnet"
                      value={livePlan.route.analysis.probabilities.balanced}
                      active={livePlan.route.analysis.tier === "balanced"}
                    />
                    <ProbabilityBar
                      label="Opus"
                      value={livePlan.route.analysis.probabilities.strong}
                      active={livePlan.route.analysis.tier === "strong"}
                    />
                  </div>

                  <div className="route-choice">
                    <span className="route-arrow">→</span>
                    <div>
                      <span>ROUTED TO</span>
                      <strong>{livePlan.route.model.name}</strong>
                    </div>
                    <span
                      className={
                        "tier-pill tier-" + livePlan.route.model.tier
                      }
                    >
                      {tierLabel[livePlan.route.model.tier]}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="metrics-grid single-router-metrics">
              <Metric
                label={engineMeta.decisionLabel}
                value={formatLatency(
                  phase === "idle" || phase === "countdown"
                    ? 0
                    : Math.min(elapsed, livePlan.route.decisionSeconds)
                )}
                sub={
                  decisionEngine === "laya"
                    ? "published single-question · Tesla T4 · English checkpoint"
                    : "prompt received → route selected"
                }
                accent="jev"
              />
            </div>

            <div className="cost-breakdown-grid">
              <div className="cost-breakdown-item jev-only">
                <span>{engineMeta.decisionCostLabel}</span>
                <strong>{formatMoney(jevDecisionCostLive)}</strong>
                <small>
                  {decisionEngine === "laya"
                    ? "$0 API fee · self-hosted"
                    : "router only"}
                </small>
              </div>
              <div className="cost-breakdown-item routed-models">
                <span>ROUTED MODEL COST</span>
                <strong>{formatMoney(routedModelCostLive)}</strong>
                <small>{decisionVisible ? livePlan.route.model.compactName : "waiting for route"}</small>
              </div>
            </div>

            <Timeline
              kind="route"
              elapsed={phase === "running" || phase === "done" ? elapsed : 0}
              plan={livePlan}
              done={decisionVisible}
              engineLabel={engineMeta.label}
            />

            <div className="lane-foot">
              <span>
                {livePlan.route.mismatchLevels ? "Effective input " : "Input "}
                {formatTokens(livePlan.route.inputTokens)}
              </span>
              <span>
                {livePlan.route.mismatchLevels ? "Effective output " : "Output "}
                {formatTokens(livePlan.route.outputTokens)}
              </span>
            </div>
          </article>

          <article className="prompt-card">
            <div
              className={
                "flow-port flow-port-left" + (isRaceActive ? " active" : "")
              }
              aria-hidden="true"
            >
              <span />
            </div>
            <div
              className={
                "flow-port flow-port-right" + (isRaceActive ? " active" : "")
              }
              aria-hidden="true"
            >
              <span />
            </div>

            <div className="workspace-switch workspace-switch-inline" aria-label="Test type">
              <button
                type="button"
                className="active"
                disabled={isLocked || batchPhase === "running"}
                onClick={() => switchWorkspace("single")}
              >
                <strong>Single Run</strong>
              </button>
              <button
                type="button"
                className=""
                disabled={isLocked || batchPhase === "running"}
                onClick={() => switchWorkspace("batch")}
              >
                <strong>Auto Benchmark</strong>
              </button>
            </div>

            <div className="prompt-head">
              <div>
                <span className="lane-kicker">CONTROL</span>
                <h2>Same prompt, fair race.</h2>
              </div>
              {phase === "done" ? (
                <button className="text-button" onClick={reset} type="button">
                  New run
                </button>
              ) : null}
            </div>

            <div className="preset-row">
              {PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  disabled={isLocked}
                  onClick={() => {
                    setPrompt(preset.prompt);
                    reset();
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <label className="prompt-label" htmlFor="benchmark-prompt">
              Task prompt
            </label>

            <div className="textarea-wrap">
              <textarea
                id="benchmark-prompt"
                value={prompt}
                disabled={isLocked}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  reset();
                }}
                rows={9}
                spellCheck={false}
              />
              <div className="textarea-meta">
                <span>
                  {Math.max(1, Math.ceil(prompt.length / 4))} prompt tokens est.
                </span>
                <span>Shared by both paths</span>
              </div>
            </div>

            <div className="expectation-block">
              <div className="field-title">
                <span>Your expectation</span>
                <small>Optional · useful for blind routing tests</small>
              </div>

              <div className="expectation-row">
                {(["Auto", "Easy", "Medium", "Hard"] as Expectation[]).map(
                  (item) => (
                    <button
                      type="button"
                      key={item}
                      className={expectation === item ? "active" : ""}
                      disabled={isLocked}
                      onClick={() => setExpectation(item)}
                    >
                      {item}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="preflight">
              <div className="preflight-row">
                <span>{engineMeta.label} decision</span>
                <strong className="hidden-decision">
                  {phase === "idle" ? "Hidden until run" : "Locked"}
                </strong>
              </div>
              <div className="preflight-row">
                <span>Route pool</span>
                <strong>Haiku · Sonnet · Opus</strong>
              </div>
              <div className="preflight-row">
                <span>Direct baseline</span>
                <strong>{directModel.compactName}</strong>
              </div>
            </div>

            <button
              className={
                "run-button" +
                (phase === "countdown" || phase === "running" ? " running" : "")
              }
              type="button"
              disabled={!prompt.trim() || isLocked}
              onClick={run}
            >
              <span className="run-icon">
                {phase === "countdown"
                  ? countdown || "GO"
                  : phase === "running"
                    ? "●"
                    : "▶"}
              </span>
              <span>
                <strong>
                  {phase === "countdown"
                    ? "Starting race"
                    : phase === "running"
                      ? "Race in progress"
                      : "Run benchmark"}
                </strong>
                <small>
                  {isLocked
                    ? "Both paths are locked to the same prompt"
                    : "Start both paths at the same time"}
                </small>
              </span>
            </button>

            <p className="method-note">
              {decisionEngine === "laya"
                ? "Laya routing output is simulated. Decision latency uses the project's published 39.5 ms single-question Tesla T4 English-checkpoint benchmark; API fee is modeled as $0 self-hosted, excluding hardware and electricity."
                : "Simulation mode uses configured list prices and capability-adjusted workload estimates. Under-tiered fixed models may consume extra simulated tokens and runtime. JEV timing remains illustrative until Live mode is connected."}
            </p>
          </article>

          <article
            className={
              "lane-card direct-lane" +
              (phase === "running" ? " is-running" : "") +
              (directDone ? " is-done" : "")
            }
          >
            <div className="lane-head">
              <div className="lane-title">
                <IconMark label="M" />
                <div>
                  <span className="lane-kicker">BASELINE</span>
                  <h2>Direct Model</h2>
                </div>
              </div>
              <span className="status-pill status-direct">
                {phase === "idle"
                  ? "MANUAL"
                  : phase === "countdown"
                    ? "ARMED"
                    : directDone
                      ? "DONE"
                      : "LIVE"}
              </span>
            </div>

            <DirectSelector
              provider={provider}
              directModel={phase === "idle" ? directModel : livePlan.direct.model}
              locked={phase !== "idle"}
              onProvider={chooseProvider}
              onModel={selectDirectModel}
            />

            <div className="metrics-grid">
              <Metric
                label="TIME"
                value={formatTime(
                  phase === "idle" || phase === "countdown"
                    ? 0
                    : Math.min(elapsed, livePlan.direct.totalSeconds)
                )}
                sub="model only"
                accent="direct"
              />
              <Metric
                label="COST"
                value={formatMoney(directCost)}
                sub="direct total"
                accent="direct"
              />
            </div>

            <Timeline
              kind="direct"
              elapsed={phase === "running" || phase === "done" ? elapsed : 0}
              plan={livePlan}
              done={directDone}
            />

            <div className="lane-foot">
              <span>
                {livePlan.direct.mismatchLevels ? "Effective input " : "Input "}
                {formatTokens(livePlan.direct.inputTokens)}
              </span>
              <span>
                {livePlan.direct.mismatchLevels ? "Effective output " : "Output "}
                {formatTokens(livePlan.direct.outputTokens)}
              </span>
            </div>
          </article>

          <section
            className={"results-panel" + (phase === "done" ? " visible" : "")}
          >
            <div className="results-heading">
              <div>
                <span className="lane-kicker">BENCHMARK VERDICT</span>
                <h2>{verdictHeadline}</h2>
              </div>
              <div className="result-status">
                <span className="result-dot" />
                SIMULATION COMPLETE
              </div>
            </div>

            <div className="result-comparison">
              <div className="result-path route">
                <span>{engineMeta.label.toUpperCase()} ROUTE</span>
                <strong>{livePlan.route.model.compactName}</strong>
                <b>{formatMoney(livePlan.route.totalCost)}</b>
                <small>
                  {engineMeta.label} decision {formatLatency(livePlan.route.decisionSeconds)}
                </small>
              </div>

              <div className="vs-badge">VS</div>

              <div className="result-path direct">
                <span>DIRECT</span>
                <strong>{livePlan.direct.model.compactName}</strong>
                <b>{formatMoney(livePlan.direct.totalCost)}</b>
                <small>{formatTime(livePlan.direct.totalSeconds)}</small>
              </div>

              <div className="saving-card">
                <span>COST DELTA</span>
                <strong>
                  {(routeSaving >= 0 ? "−" : "+") +
                    Math.abs(routeSaving).toFixed(1) +
                    "%"}
                </strong>
                <small>
                  {routeSaving >= 0
                    ? "with " + engineMeta.label + " routing"
                    : "routing overhead"}
                </small>
              </div>

              <div className="saving-card">
                <span>{engineMeta.decisionLabel}</span>
                <strong>{formatLatency(livePlan.route.decisionSeconds)}</strong>
                <small>router latency only · not model runtime</small>
              </div>
            </div>

            <div className="verdict-grid">
              <div className="verdict-card">
                <span>COST</span>
                <strong>{deltaWinner(routeSaving, engineMeta.routeTitle)}</strong>
                <small>{Math.abs(routeSaving).toFixed(1)}% delta</small>
              </div>
              <div className="verdict-card">
                <span>{engineMeta.decisionLabel}</span>
                <strong>{formatLatency(livePlan.route.decisionSeconds)}</strong>
                <small>router latency only · model runtime excluded</small>
              </div>
              <div className="verdict-card quality">
                <span>QUALITY</span>
                <strong>Not measured</strong>
                <small>Simulation does not evaluate responses</small>
              </div>
            </div>

            <div className="signal-strip">
              {livePlan.route.analysis.signals.map((signal) => (
                <div key={signal.label}>
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                </div>
              ))}
              <div>
                <span>Expected</span>
                <strong>{expectation}</strong>
              </div>
              <div>
                <span>Measurement</span>
                <strong>Simulation</strong>
              </div>
            </div>
          </section>
        </section>
      ) : (
        <section className="batch-arena">
          <article
            className={
              "lane-card jev-lane batch-side-card" +
              (batchPhase === "running" ? " is-running" : "")
            }
          >
            <div className="lane-head">
              <div className="lane-title">
                <IconMark label={engineMeta.icon} />
                <div>
                  <span className="lane-kicker">AUTOMATED ROUTE</span>
                  <h2>{engineMeta.aggregateTitle}</h2>
                </div>
              </div>
              <span className="status-pill status-jev">
                {batchPhase === "idle"
                  ? "READY"
                  : batchPhase === "running"
                    ? "LIVE"
                    : "DONE"}
              </span>
            </div>

            <DecisionEngineSwitch
              engine={decisionEngine}
              locked={isLocked || batchPhase === "running"}
              onEngine={chooseDecisionEngine}
            />

            <div className="batch-hero-stat">
              <span>SIMULATED TIER MATCH</span>
              <strong>
                {batchResults.length
                  ? (
                      (batchTotals.routingMatches / batchResults.length) *
                      100
                    ).toFixed(0) + "%"
                  : "—"}
              </strong>
              <small>
                {batchTotals.routingMatches}/{batchResults.length || 0} predicted difficulty labels matched the benchmark tier
              </small>
            </div>

            <div className="distribution-card">
              <div className="distribution-head">
                <span>ROUTE DISTRIBUTION</span>
                <strong>{liveDecisionCount} decisions</strong>
              </div>
              {[
                ["Haiku", "Easy", liveDistribution.haiku, "easy"],
                ["Sonnet", "Medium", liveDistribution.sonnet, "medium"],
                ["Opus", "Hard", liveDistribution.opus, "hard"]
              ].map(([label, difficulty, count, tone]) => {
                const value = Number(count);
                const pct = Math.min(
                  (value / Math.max(1, selectedCases.length)) * 100,
                  100
                );
                const isLive =
                  batchPhase === "running" &&
                  ((tone === "easy" && batchCurrentPlan?.route.model.name.includes("Haiku")) ||
                    (tone === "medium" && batchCurrentPlan?.route.model.name.includes("Sonnet")) ||
                    (tone === "hard" && batchCurrentPlan?.route.model.name.includes("Opus")));

                return (
                  <div
                    className={
                      "distribution-row distribution-" + tone +
                      (isLive ? " is-live" : "")
                    }
                    key={String(label)}
                  >
                    <div>
                      <span>
                        {label}
                        <small>{difficulty}</small>
                      </span>
                      <strong>{value}</strong>
                    </div>
                    <div className="probability-track distribution-track">
                      <div
                        className={"probability-fill distribution-fill " + tone + (isLive ? " live" : "")}
                        style={{ width: pct + "%", minWidth: value > 0 ? "10px" : "0px" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="metrics-grid decision-metrics-grid">
              <Metric
                label={batchPhase === "done" ? "LAST DECISION" : "CURRENT DECISION"}
                value={formatLatency(
                  batchPhase === "running" && batchCurrentPlan
                    ? batchCurrentPlan.route.decisionSeconds
                    : batchResults.length
                      ? batchResults[batchResults.length - 1].decisionTime
                      : 0
                )}
                sub={
                  decisionEngine === "laya"
                    ? "published single-question · Tesla T4"
                    : "router latency for one prompt"
                }
                accent="jev"
              />
              <Metric
                label="TOTAL DECISION TIME"
                value={
                  batchTotals.decisionTimeTotal >= 1
                    ? batchTotals.decisionTimeTotal.toFixed(3) + " s"
                    : Math.round(batchTotals.decisionTimeTotal * 1000) + " ms"
                }
                sub={
                  batchResults.length
                    ? "avg " + formatLatency(batchTotals.averageDecisionTime)
                    : "sum of " + engineMeta.label + " decisions"
                }
                accent="jev"
              />
            </div>

            <div className="cost-breakdown-grid batch-cost-breakdown">
              <div className="cost-breakdown-item jev-only">
                <span>{engineMeta.decisionCostLabel}</span>
                <strong>{formatMoney(batchTotals.jevDecisionCostTotal)}</strong>
                <small>
                  {decisionEngine === "laya"
                    ? "$0 API fee · self-hosted"
                    : "router only"}
                </small>
              </div>
              <div className="cost-breakdown-item routed-models">
                <span>ROUTED MODELS COST</span>
                <strong>{formatMoney(batchTotals.routedModelCostTotal)}</strong>
                <small>Haiku + Sonnet + Opus</small>
              </div>
            </div>

            <div className="routing-feed-card">
              <div className="routing-feed-head">
                <div>
                  <span>LIVE ROUTING FEED</span>
                  <strong>{"Prompt → " + engineMeta.label + " → Model"}</strong>
                </div>
                <small>
                  {batchPhase === "running"
                    ? "Routing now"
                    : batchPhase === "done"
                      ? "Last decisions"
                      : "Starts with benchmark"}
                </small>
              </div>

              <div className="routing-feed-list">
                {routingFeed.length ? (
                  routingFeed.map((item) => (
                    <div
                      className={
                        "routing-feed-row" +
                        (item.status === "live" ? " live" : "")
                      }
                      key={item.key}
                    >
                      <span className="routing-case">{item.caseId}</span>
                      <div className="routing-prompt">
                        <strong>{item.title}</strong>
                        <small>
                          {item.predicted} · {item.confidence}% · {formatLatency(item.decisionTime)}
                        </small>
                      </div>
                      <span className="routing-arrow">→</span>
                      <span
                        className={
                          "routing-model " +
                          (item.model.includes("Haiku")
                            ? "haiku"
                            : item.model.includes("Sonnet")
                              ? "sonnet"
                              : "opus")
                        }
                      >
                        {item.model.replace("Claude ", "")}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="routing-feed-empty">
                    {"Each prompt will appear here with the model " + engineMeta.label + " routes it to."}
                  </div>
                )}
              </div>
            </div>

            <div className="batch-detail-list">
              <div>
                <span>Avg. confidence</span>
                <strong>
                  {batchResults.length
                    ? batchTotals.confidenceAverage.toFixed(1) + "%"
                    : "—"}
                </strong>
              </div>
              <div>
                <span>{engineMeta.label} cases completed</span>
                <strong>
                  {batchResults.length}/{selectedCases.length}
                </strong>
              </div>
              <div>
                <span>Quality</span>
                <strong>Not measured</strong>
              </div>
            </div>
          </article>

          <article className="prompt-card batch-control-card">
            <div className="workspace-switch workspace-switch-inline" aria-label="Test type">
              <button
                type="button"
                className=""
                disabled={isLocked || batchPhase === "running"}
                onClick={() => switchWorkspace("single")}
              >
                <strong>Single Run</strong>
              </button>
              <button
                type="button"
                className="active"
                disabled={isLocked || batchPhase === "running"}
                onClick={() => switchWorkspace("batch")}
              >
                <strong>Auto Benchmark</strong>
              </button>
            </div>
            <div className="prompt-head">
              <div>
                <span className="lane-kicker">AUTO BENCHMARK</span>
                <h2>Run a controlled test suite.</h2>
              </div>
              {batchPhase === "done" ? (
                <div className="batch-control-actions">
                  <button
                    className="text-button"
                    onClick={shuffleBatch}
                    type="button"
                  >
                    New random suite
                  </button>
                  <button
                    className="text-button reset-button"
                    onClick={resetBatch}
                    type="button"
                  >
                    Reset
                  </button>
                </div>
              ) : null}
            </div>

            <div className="suite-selector">
              {(["Easy", "Medium", "Hard", "Full"] as BenchmarkScope[]).map(
                (scope) => {
                  const count =
                    suiteSize(scope, workloadMix);
                  return (
                    <button
                      type="button"
                      key={scope}
                      className={batchScope === scope ? "active" : ""}
                      disabled={batchPhase === "running"}
                      onClick={() => {
                        setBatchScope(scope);
                        setBatchSeed(createBenchmarkSeed());
                        resetBatch();
                      }}
                    >
                      <strong>{scope}</strong>
                      <small>{count} cases</small>
                    </button>
                  );
                }
              )}
            </div>

            {batchScope === "Full" ? (
              <div className="workload-mix-card">
                <div className="workload-mix-head">
                  <div>
                    <span>WORKLOAD MIX</span>
                    <strong>Choose any mix up to 100 prompts.</strong>
                  </div>
                  <b className={workloadValid ? "mix-valid" : "mix-invalid"}>
                    {workloadTotal}/100
                  </b>
                </div>

                <div className="workload-preset-row">
                  {(["Balanced", "Light", "Developer", "Custom"] as WorkloadPreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={workloadPreset === preset ? "active" : ""}
                      disabled={batchPhase === "running"}
                      onClick={() => applyWorkloadPreset(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <div className="mix-slider-grid">
                  {([
                    ["easy", "Easy", "mix-easy"],
                    ["medium", "Medium", "mix-medium"],
                    ["hard", "Hard", "mix-hard"]
                  ] as const).map(([key, label, className]) => (
                    <label className={"mix-slider " + className} key={key}>
                      <div>
                        <span>{label}</span>
                        <strong>{workloadMix[key]}</strong>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={MAX_WORKLOAD_PROMPTS}
                        step="1"
                        value={workloadMix[key]}
                        disabled={batchPhase === "running"}
                        onChange={(event) => updateWorkloadMix(key, Number(event.target.value))}
                      />
                    </label>
                  ))}
                </div>

                {!workloadValid ? (
                  <div className="mix-warning">Choose at least one prompt. Maximum: 100.</div>
                ) : null}
              </div>
            ) : null}

            <div className="batch-seed-row">
              <span>Random suite seed</span>
              <strong>{batchSeed}</strong>
              <small>{GENERATED_POOL_NOTE}</small>
            </div>

            <div className="batch-progress-card">
              <div className="batch-progress-head">
                <div>
                  <span>EXECUTION PROGRESS</span>
                  <strong>
                    {batchResults.length} / {selectedCases.length}
                  </strong>
                </div>
                <b>{batchProgress.toFixed(0)}%</b>
              </div>
              <div className="batch-progress-track">
                <span style={{ width: batchProgress + "%" }} />
              </div>
            </div>

            <CostRaceChart
              points={strategyComparison.points}
              totalRuns={selectedCases.length}
              strategyLabels={strategyLabels}
            />

            <div className="current-case">
              <span className="micro-label">
                {batchPhase === "running"
                  ? "RUNNING NOW"
                  : batchPhase === "done"
                    ? "SUITE COMPLETE"
                    : "NEXT CASE"}
              </span>
              <strong>
                {batchCurrent
                  ? batchCurrent.id + " · " + batchCurrent.title
                  : "No case selected"}
              </strong>
              <p>
                {batchCurrent
                  ? batchCurrent.prompt
                  : "Choose a suite to start the automated benchmark."}
              </p>
            </div>

            <div className="case-stream">
              {selectedCases.map((item, index) => {
                const result = batchResults.find(
                  (entry) => entry.caseId === item.id
                );
                const isCurrent =
                  batchPhase === "running" && index === batchIndex;

                return (
                  <div
                    className={
                      "case-row" +
                      (result ? " complete" : "") +
                      (isCurrent ? " current" : "")
                    }
                    key={item.id}
                  >
                    <span className="case-id">{item.id}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.level}</small>
                    </div>
                    <span className="case-state">
                      {result
                        ? result.routedModel.replace("Claude ", "")
                        : isCurrent
                          ? "Running"
                          : "Queued"}
                    </span>
                  </div>
                );
              })}
            </div>

            <button
              className={
                "run-button batch-run-button" +
                (batchPhase === "running" ? " running" : "")
              }
              type="button"
              disabled={batchPhase === "running" || !workloadValid}
              onClick={startBatch}
            >
              <span className="run-icon">
                {batchPhase === "running" ? "●" : "▶"}
              </span>
              <span>
                <strong>
                  {batchPhase === "running"
                    ? "Benchmark running"
                    : batchPhase === "done"
                      ? "Run suite again"
                      : "Run automated benchmark"}
                </strong>
                <small>
                  {workloadValid
                    ? selectedCases.length + " prompts will run one after another"
                    : "Choose a workload between 1 and 100 prompts"}
                </small>
              </span>
            </button>
          </article>

          <article
            className={
              "lane-card direct-lane batch-side-card" +
              (batchPhase === "running" ? " is-running" : "")
            }
          >
            <div className="lane-head">
              <div className="lane-title">
                <IconMark label="M" />
                <div>
                  <span className="lane-kicker">FIXED BASELINE</span>
                  <h2>Direct Aggregate</h2>
                </div>
              </div>
              <span className="status-pill status-direct">
                {batchPhase === "idle"
                  ? "MANUAL"
                  : batchPhase === "running"
                    ? "LOCKED"
                    : "DONE"}
              </span>
            </div>

            <DirectSelector
              provider={provider}
              directModel={directModel}
              locked={batchPhase !== "idle"}
              onProvider={chooseProvider}
              onModel={selectDirectModel}
            />

            <div className={"baseline-note tier-" + directModel.tier}>
              <span>BASELINE CONTEXT</span>
              <strong>
                {directModel.tier === "fast"
                  ? "Fast baseline: harder tasks add simulated agent-loop, retry, token, and runtime overhead when this model is under-tiered. Task success/quality is not measured."
                  : directModel.tier === "strong"
                    ? "Strong baseline: routing can save cost by avoiding this model on simpler tasks."
                    : "Balanced baseline: routing trades up or down by task difficulty. Task success/quality is not measured."}
              </strong>
            </div>

            <div className="metrics-grid">
              <Metric
                label="MODEL RUNTIME"
                value={formatRuntimeSeconds(batchTotals.directTimeTotal)}
                sub={formatRuntimeContext(batchTotals.directTimeTotal)}
                accent="direct"
              />
              <Metric
                label="TOTAL COST"
                value={formatMoney(batchTotals.directCostTotal)}
                sub="capability-adjusted cumulative cost"
                accent="direct"
              />
            </div>

            <div className="batch-detail-list">
              <div>
                <span>Baseline model</span>
                <strong>{directModel.compactName}</strong>
              </div>
              <div>
                <span>Cases completed</span>
                <strong>
                  {batchResults.length}/{selectedCases.length}
                </strong>
              </div>
              <div>
                <span>Router overhead</span>
                <strong>None</strong>
              </div>
            </div>
          </article>

          <section
            className={
              "results-panel batch-results" +
              (batchPhase === "done" ? " visible" : "")
            }
          >
            <div className="results-heading">
              <div>
                <span className="lane-kicker">SUITE VERDICT</span>
                <h2>
                  {batchTotals.costDelta > 0.2
                    ? engineMeta.label + " routing had lower simulated cost than the direct baseline."
                    : batchTotals.costDelta < -0.2
                      ? engineMeta.label + " routing had higher simulated cost than the direct baseline."
                      : "Total simulated cost was effectively tied."}
                </h2>
              </div>
              <div className="batch-result-actions">
                <div className="result-status">
                  <span className="result-dot" />
                  {batchResults.length} CASES COMPLETE
                </div>
                <button
                  className="text-button reset-button"
                  type="button"
                  onClick={resetBatch}
                >
                  Reset
                </button>
                <button
                  className="export-button"
                  type="button"
                  onClick={exportBatchCsv}
                >
                  Export CSV
                </button>
              </div>
            </div>

            <div className="batch-summary-grid">
              <div className="summary-card">
                <span>COST VS DIRECT</span>
                <strong className={batchTotals.costDelta >= 0 ? "delta-good" : "delta-bad"}>
                  {deltaText(batchTotals.costDelta, engineMeta.label)}
                </strong>
                <small>
                  {formatMoney(batchTotals.routeCostTotal)} vs{" "}
                  {formatMoney(batchTotals.directCostTotal)}
                </small>
              </div>
              <div className="summary-card">
                <span>{"AVG " + engineMeta.label.toUpperCase() + " DECISION"}</span>
                <strong>{formatLatency(batchTotals.averageDecisionTime)}</strong>
                <small>
                  router only · selected model runtime excluded
                </small>
              </div>
              <div className="summary-card">
                <span>SIMULATED TIER MATCH</span>
                <strong>
                  {batchResults.length
                    ? (
                        (batchTotals.routingMatches / batchResults.length) *
                        100
                      ).toFixed(0) + "%"
                    : "—"}
                </strong>
                <small>
                  {batchTotals.routingMatches}/{batchResults.length} simulated predictions matched benchmark labels · not a quality score
                </small>
              </div>
              <div className="summary-card">
                <span>QUALITY</span>
                <strong>Not measured</strong>
                <small>Requires Live coding-task evaluation</small>
              </div>
            </div>

            <div className="strategy-comparison-panel">
              <div className="strategy-comparison-head">
                <div>
                  <span>FOUR-STRATEGY COST COMPARISON</span>
                  <strong>
                    {"What if every prompt always used one fixed " +
                      directModel.providerLabel +
                      " model?"}
                  </strong>
                </div>
                <small>
                  Cost-only comparison · same prompts · under-tiered models incur
                  simulated extra token/retry overhead · quality not measured
                </small>
              </div>

              <div className="strategy-card-grid">
                <div className="strategy-card strategy-jev">
                  <span>{engineMeta.label.toUpperCase()} ROUTE</span>
                  <strong>{formatMoney(strategyComparison.totals.jev)}</strong>
                  <small>{decisionEngine === "laya" ? "selected models · $0 decision API fee" : "router + selected models"}</small>
                </div>
                <div className="strategy-card strategy-haiku">
                  <span>
                    {"ALWAYS " + fixedStrategyModels.haiku.compactName.toUpperCase()}
                  </span>
                  <strong>{formatMoney(strategyComparison.totals.haiku)}</strong>
                  <small>
                    {deltaText(percentageDelta(strategyComparison.totals.haiku, strategyComparison.totals.jev), engineMeta.label)}
                  </small>
                </div>
                <div className="strategy-card strategy-sonnet">
                  <span>
                    {"ALWAYS " + fixedStrategyModels.sonnet.compactName.toUpperCase()}
                  </span>
                  <strong>{formatMoney(strategyComparison.totals.sonnet)}</strong>
                  <small>
                    {deltaText(percentageDelta(strategyComparison.totals.sonnet, strategyComparison.totals.jev), engineMeta.label)}
                  </small>
                </div>
                <div className="strategy-card strategy-opus">
                  <span>
                    {"ALWAYS " + fixedStrategyModels.opus.compactName.toUpperCase()}
                  </span>
                  <strong>{formatMoney(strategyComparison.totals.opus)}</strong>
                  <small>
                    {deltaText(percentageDelta(strategyComparison.totals.opus, strategyComparison.totals.jev), engineMeta.label)}
                  </small>
                </div>
              </div>

              <CostRaceChart
              points={strategyComparison.points}
              totalRuns={selectedCases.length}
              strategyLabels={strategyLabels}
            />
            </div>

            <div className="level-breakdown">
              {levelSummaries.map((summary) => (
                <div className="level-card" key={summary.level}>
                  <div>
                    <span>{summary.level.toUpperCase()}</span>
                    <strong>{summary.count} cases</strong>
                  </div>
                  <div>
                    <small>Cost vs direct</small>
                    <b className={summary.costDelta >= 0 ? "delta-good" : "delta-bad"}>
                      {summary.count ? deltaText(summary.costDelta, engineMeta.label) : "—"}
                    </b>
                  </div>
                  <div>
                    <small>{"Avg " + engineMeta.label + " decision"}</small>
                    <b>
                      {summary.count
                        ? formatLatency(summary.averageDecisionTime)
                        : "—"}
                    </b>
                  </div>
                </div>
              ))}
            </div>

            <div className="batch-table-wrap">
              <table className="batch-table">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Expected</th>
                    <th>{engineMeta.label}</th>
                    <th>Confidence</th>
                    <th>Route</th>
                    <th>Cost Δ</th>
                    <th>{engineMeta.label} latency</th>
                  </tr>
                </thead>
                <tbody>
                  {batchResults.map((item) => (
                    <tr key={item.caseId}>
                      <td>
                        <strong>{item.caseId}</strong>
                        <span>{item.title}</span>
                      </td>
                      <td>{item.expected}</td>
                      <td>
                        <span
                          className={
                            "match-pill " +
                            (item.routingMatch ? "matched" : "missed")
                          }
                        >
                          {item.predicted}
                        </span>
                      </td>
                      <td>{item.confidence}%</td>
                      <td>{item.routedModel.replace("Claude ", "")}</td>
                      <td>
                        <span className={item.costDelta >= 0 ? "delta-good" : "delta-bad"}>
                          {deltaText(item.costDelta, engineMeta.label)}
                        </span>
                      </td>
                      <td>{formatLatency(item.decisionTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      )}

      <footer className="footer">
        <span>JEVArena · simulation-first benchmark UI</span>
        <span>Configured list-rate comparison · Oct 2026</span>
      </footer>
    </main>
  );
}
