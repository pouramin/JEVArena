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
  BENCHMARK_CASES,
  casesForScope,
  type BenchmarkCase,
  type BenchmarkScope
} from "./data/benchmarks";
import { makeRunPlan, type RunPlan } from "./lib/simulator";

type Phase = "idle" | "countdown" | "running" | "done";
type Expectation = "Auto" | "Easy" | "Medium" | "Hard";
type WorkspaceMode = "single" | "batch";
type BatchPhase = "idle" | "running" | "done";

type BatchResult = {
  caseId: string;
  title: string;
  expected: string;
  prompt: string;
  predicted: string;
  confidence: number;
  routedModel: string;
  directModel: string;
  routeCost: number;
  directCost: number;
  costDelta: number;
  routeTime: number;
  directTime: number;
  timeDelta: number;
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

const tierLabel: Record<Tier, string> = {
  fast: "FAST",
  balanced: "BALANCED",
  strong: "STRONG"
};

function formatTime(seconds: number) {
  return seconds.toFixed(3) + " s";
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

function deltaWinner(delta: number) {
  if (delta > 0.2) return "JEV Route";
  if (delta < -0.2) return "Direct";
  return "Tie";
}

function percentageDelta(baseline: number, candidate: number) {
  if (!baseline) return 0;
  return ((baseline - candidate) / baseline) * 100;
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
  done
}: {
  kind: "route" | "direct";
  elapsed: number;
  plan: RunPlan;
  done: boolean;
}) {
  const route = plan.route;
  const total = kind === "route" ? route.totalSeconds : plan.direct.totalSeconds;
  const decision = kind === "route" ? route.decisionSeconds : 0;
  const events =
    kind === "route"
      ? [
          { label: "Prompt received", at: 0.04 },
          { label: "JEV decision", at: decision },
          { label: "Model routed", at: decision + 0.18 },
          { label: "Response complete", at: total }
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

export default function App() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("single");

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [modelId, setModelId] = useState("claude-opus-5-5");
  const [expectation, setExpectation] = useState<Expectation>("Auto");
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [runCount, setRunCount] = useState(0);
  const [presentation, setPresentation] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<RunPlan | null>(null);

  const [batchScope, setBatchScope] = useState<BenchmarkScope>("Full");
  const [batchPhase, setBatchPhase] = useState<BatchPhase>("idle");
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);

  const directModel = getModel(modelId);
  const previewPlan = useMemo(
    () => makeRunPlan(prompt, directModel),
    [prompt, directModel]
  );
  const livePlan = currentPlan ?? previewPlan;
  const selectedCases = useMemo(
    () => casesForScope(batchScope),
    [batchScope]
  );

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
      const plan = makeRunPlan(item.prompt, directModel);
      const routeCostDelta = percentageDelta(
        plan.direct.totalCost,
        plan.route.totalCost
      );
      const routeTimeDelta = percentageDelta(
        plan.direct.totalSeconds,
        plan.route.totalSeconds
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
        routeCost: plan.route.totalCost,
        directCost: plan.direct.totalCost,
        costDelta: routeCostDelta,
        routeTime: plan.route.totalSeconds,
        directTime: plan.direct.totalSeconds,
        timeDelta: routeTimeDelta,
        routingMatch: plan.route.analysis.complexity === item.level
      };

      setBatchResults((results) => [...results, result]);

      if (batchIndex + 1 >= selectedCases.length) {
        setBatchIndex(selectedCases.length);
        setBatchPhase("done");
      } else {
        setBatchIndex((index) => index + 1);
      }
    }, 360);

    return () => window.clearTimeout(timer);
  }, [batchPhase, batchIndex, selectedCases, directModel]);

  const isLocked = phase === "countdown" || phase === "running";
  const isRaceActive = phase === "countdown" || phase === "running";

  const routeProgress =
    phase === "running" || phase === "done"
      ? Math.min(elapsed / livePlan.route.totalSeconds, 1)
      : 0;

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

  const routeCost =
    phase === "idle" || phase === "countdown"
      ? 0
      : livePlan.route.totalCost * routeProgress;

  const directCost =
    phase === "idle" || phase === "countdown"
      ? 0
      : livePlan.direct.totalCost * directProgress;

  const routeSaving =
    percentageDelta(livePlan.direct.totalCost, livePlan.route.totalCost);
  const timeSaving =
    percentageDelta(livePlan.direct.totalSeconds, livePlan.route.totalSeconds);

  const sameModel = livePlan.route.model.id === livePlan.direct.model.id;

  const verdictHeadline = sameModel
    ? "Same model. JEV added only routing overhead."
    : routeSaving > 0.2
      ? "JEV routing used less money on this task."
      : routeSaving < -0.2
        ? "The direct path used less money on this task."
        : "Cost was effectively tied on this task.";

  const confidenceStyle = {
    "--confidence": livePlan.route.analysis.confidence + "%"
  } as CSSProperties;

  const batchCurrent = selectedCases[Math.min(batchIndex, selectedCases.length - 1)];
  const batchProgress =
    batchPhase === "done"
      ? 100
      : selectedCases.length
        ? (batchResults.length / selectedCases.length) * 100
        : 0;

  const batchTotals = useMemo(() => {
    const routeCostTotal = batchResults.reduce(
      (sum, item) => sum + item.routeCost,
      0
    );
    const directCostTotal = batchResults.reduce(
      (sum, item) => sum + item.directCost,
      0
    );
    const routeTimeTotal = batchResults.reduce(
      (sum, item) => sum + item.routeTime,
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
      routeCostTotal,
      directCostTotal,
      routeTimeTotal,
      directTimeTotal,
      confidenceAverage,
      routingMatches,
      distribution,
      costDelta: percentageDelta(directCostTotal, routeCostTotal),
      timeDelta: percentageDelta(directTimeTotal, routeTimeTotal)
    };
  }, [batchResults]);

  const run = () => {
    if (!prompt.trim() || isLocked) return;

    const plan = makeRunPlan(prompt, directModel);
    setCurrentPlan(plan);
    setElapsed(0);
    setCountdown(3);
    setRunCount((count) => count + 1);
    setPhase("countdown");
  };

  const reset = () => {
    setPhase("idle");
    setCountdown(3);
    setElapsed(0);
    setCurrentPlan(null);
  };

  const startBatch = () => {
    if (batchPhase === "running") return;
    setBatchResults([]);
    setBatchIndex(0);
    setBatchPhase("running");
    setRunCount((count) => count + selectedCases.length);
  };

  const resetBatch = () => {
    setBatchPhase("idle");
    setBatchIndex(0);
    setBatchResults([]);
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

  const togglePresentation = async () => {
    const next = !presentation;
    setPresentation(next);

    try {
      if (next && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // CSS presentation mode still works if browser fullscreen is blocked.
    }
  };

  const exportBatchCsv = () => {
    if (!batchResults.length) return;

    const header = [
      "Case ID",
      "Title",
      "Expected Level",
      "JEV Predicted Level",
      "Confidence %",
      "Routed Model",
      "Direct Model",
      "JEV Route Cost USD",
      "Direct Cost USD",
      "Cost Saving %",
      "JEV Route Time s",
      "Direct Time s",
      "Time Saving %",
      "Routing Match",
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
      item.routeCost.toFixed(8),
      item.directCost.toFixed(8),
      item.costDelta.toFixed(2),
      item.routeTime.toFixed(4),
      item.directTime.toFixed(4),
      item.timeDelta.toFixed(2),
      item.routingMatch,
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
      batchTotals.routeCostTotal.toFixed(8),
      batchTotals.directCostTotal.toFixed(8),
      batchTotals.costDelta.toFixed(2),
      batchTotals.routeTimeTotal.toFixed(4),
      batchTotals.directTimeTotal.toFixed(4),
      batchTotals.timeDelta.toFixed(2),
      batchTotals.routingMatches + "/" + batchResults.length,
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
    <main className={"app-shell" + (presentation ? " presentation" : "")}>
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

        <div className="topbar-actions">
          <span className="run-counter">{runCount} runs</span>
          <button
            className="ghost-button"
            type="button"
            onClick={togglePresentation}
          >
            {presentation ? "Exit present" : "Present"}
          </button>
        </div>
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
              : "Run the same benchmark 8 or 24 times."}
          </h1>
        </div>
        <p>
          {workspaceMode === "single"
            ? "JEV chooses the model on the left. You choose the direct baseline on the right. Cost and latency race in real time."
            : "Choose a difficulty suite, lock a direct baseline, then let JEVArena run every case in sequence and build a comparison report."}
        </p>
      </section>

      <div className="workspace-switch" aria-label="Test type">
        <button
          type="button"
          className={workspaceMode === "single" ? "active" : ""}
          disabled={isLocked || batchPhase === "running"}
          onClick={() => switchWorkspace("single")}
        >
          <strong>Single Run</strong>
          <small>One prompt · visual race</small>
        </button>
        <button
          type="button"
          className={workspaceMode === "batch" ? "active" : ""}
          disabled={isLocked || batchPhase === "running"}
          onClick={() => switchWorkspace("batch")}
        >
          <strong>Auto Benchmark</strong>
          <small>8 / 24 cases · export results</small>
        </button>
      </div>

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
                <IconMark label="J" />
                <div>
                  <span className="lane-kicker">ROUTED PATH</span>
                  <h2>JEV Route</h2>
                </div>
              </div>
              <span className="status-pill status-jev">
                {phase === "idle"
                  ? "READY"
                  : phase === "countdown"
                    ? "ARMED"
                    : routeDone
                      ? "DONE"
                      : "LIVE"}
              </span>
            </div>

            <div className="route-stage">
              {phase === "idle" || phase === "countdown" ? (
                <div className="decision-idle">
                  <div
                    className={
                      "decision-orb" + (phase === "countdown" ? " armed" : "")
                    }
                  >
                    <span />
                    <b>JEV</b>
                  </div>
                  <p>
                    {phase === "countdown"
                      ? "Prompt locked. Waiting for the start."
                      : "Decision hidden until the race starts."}
                  </p>
                  <small>
                    JEV will classify the task and reveal the selected model
                    only after launch.
                  </small>
                </div>
              ) : !decisionVisible ? (
                <div className="decision-loading" aria-live="polite">
                  <div className="decision-orb working">
                    <span />
                    <b>JEV</b>
                  </div>
                  <strong>Reading the task...</strong>
                  <small>Scoring complexity, risk and context depth</small>
                </div>
              ) : (
                <div className="decision-result" aria-live="polite">
                  <div className="decision-banner">
                    <div>
                      <span className="micro-label">JEV DECISION</span>
                      <strong>{livePlan.route.analysis.complexity}</strong>
                    </div>
                    <div className="confidence-ring" style={confidenceStyle}>
                      <strong>{livePlan.route.analysis.confidence}%</strong>
                      <span>confidence</span>
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

            <div className="metrics-grid">
              <Metric
                label="TIME"
                value={formatTime(
                  phase === "idle" || phase === "countdown"
                    ? 0
                    : Math.min(elapsed, livePlan.route.totalSeconds)
                )}
                sub={
                  decisionVisible
                    ? formatTime(livePlan.route.decisionSeconds) + " JEV"
                    : "decision + model"
                }
                accent="jev"
              />
              <Metric
                label="COST"
                value={formatMoney(routeCost)}
                sub={
                  decisionVisible
                    ? formatMoney(livePlan.route.jevCost) + " JEV"
                    : "route total"
                }
                accent="jev"
              />
            </div>

            <Timeline
              kind="route"
              elapsed={phase === "running" || phase === "done" ? elapsed : 0}
              plan={livePlan}
              done={routeDone}
            />

            <div className="lane-foot">
              <span>Input {formatTokens(livePlan.route.inputTokens)}</span>
              <span>Output {formatTokens(livePlan.route.outputTokens)}</span>
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
                <span>JEV decision</span>
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
              Simulation mode uses identical token estimates and configured
              list prices. Timing remains illustrative until Live mode is
              connected.
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
              <span>Input {formatTokens(livePlan.direct.inputTokens)}</span>
              <span>Output {formatTokens(livePlan.direct.outputTokens)}</span>
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
                <span>JEV ROUTE</span>
                <strong>{livePlan.route.model.compactName}</strong>
                <b>{formatMoney(livePlan.route.totalCost)}</b>
                <small>{formatTime(livePlan.route.totalSeconds)}</small>
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
                  {routeSaving >= 0 ? "with JEV routing" : "routing overhead"}
                </small>
              </div>

              <div className="saving-card">
                <span>TIME DELTA</span>
                <strong>
                  {(timeSaving >= 0 ? "−" : "+") +
                    Math.abs(timeSaving).toFixed(1) +
                    "%"}
                </strong>
                <small>
                  {timeSaving >= 0 ? "with JEV routing" : "routing overhead"}
                </small>
              </div>
            </div>

            <div className="verdict-grid">
              <div className="verdict-card">
                <span>COST</span>
                <strong>{deltaWinner(routeSaving)}</strong>
                <small>{Math.abs(routeSaving).toFixed(1)}% delta</small>
              </div>
              <div className="verdict-card">
                <span>TIME</span>
                <strong>{deltaWinner(timeSaving)}</strong>
                <small>{Math.abs(timeSaving).toFixed(1)}% delta</small>
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
                <IconMark label="J" />
                <div>
                  <span className="lane-kicker">AUTOMATED ROUTE</span>
                  <h2>JEV Aggregate</h2>
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

            <div className="batch-hero-stat">
              <span>ROUTING MATCH</span>
              <strong>
                {batchResults.length
                  ? (
                      (batchTotals.routingMatches / batchResults.length) *
                      100
                    ).toFixed(0) + "%"
                  : "—"}
              </strong>
              <small>
                {batchTotals.routingMatches}/{batchResults.length || 0} matched
                the expected difficulty label
              </small>
            </div>

            <div className="distribution-card">
              <div className="distribution-head">
                <span>ROUTE DISTRIBUTION</span>
                <strong>{batchResults.length} decisions</strong>
              </div>
              {[
                ["Haiku", batchTotals.distribution.haiku],
                ["Sonnet", batchTotals.distribution.sonnet],
                ["Opus", batchTotals.distribution.opus]
              ].map(([label, count]) => {
                const value = Number(count);
                const pct = batchResults.length
                  ? (value / batchResults.length) * 100
                  : 0;
                const style = {
                  "--bar-width": pct + "%"
                } as CSSProperties;

                return (
                  <div className="distribution-row" key={String(label)}>
                    <div>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                    <div className="probability-track">
                      <span className="probability-fill batch-fill" style={style} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="metrics-grid">
              <Metric
                label="TOTAL TIME"
                value={formatTime(batchTotals.routeTimeTotal)}
                sub="JEV decision + routed model"
                accent="jev"
              />
              <Metric
                label="TOTAL COST"
                value={formatMoney(batchTotals.routeCostTotal)}
                sub="cumulative route cost"
                accent="jev"
              />
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
                <span>JEV cases completed</span>
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
            <div className="prompt-head">
              <div>
                <span className="lane-kicker">AUTO BENCHMARK</span>
                <h2>Run a controlled test suite.</h2>
              </div>
              {batchPhase === "done" ? (
                <button
                  className="text-button"
                  onClick={resetBatch}
                  type="button"
                >
                  New suite
                </button>
              ) : null}
            </div>

            <div className="suite-selector">
              {(["Easy", "Medium", "Hard", "Full"] as BenchmarkScope[]).map(
                (scope) => {
                  const count =
                    scope === "Full"
                      ? BENCHMARK_CASES.length
                      : casesForScope(scope).length;
                  return (
                    <button
                      type="button"
                      key={scope}
                      className={batchScope === scope ? "active" : ""}
                      disabled={batchPhase === "running"}
                      onClick={() => {
                        setBatchScope(scope);
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

            <div className="batch-progress-card">
              <div className="batch-progress-head">
                <div>
                  <span>PROGRESS</span>
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
              disabled={batchPhase === "running"}
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
                  {selectedCases.length} prompts will run one after another
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

            <div className="metrics-grid">
              <Metric
                label="TOTAL TIME"
                value={formatTime(batchTotals.directTimeTotal)}
                sub="model only"
                accent="direct"
              />
              <Metric
                label="TOTAL COST"
                value={formatMoney(batchTotals.directCostTotal)}
                sub="cumulative direct cost"
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
                    ? "JEV routing reduced total simulated cost."
                    : batchTotals.costDelta < -0.2
                      ? "The direct baseline used less simulated cost."
                      : "Total simulated cost was effectively tied."}
                </h2>
              </div>
              <div className="batch-result-actions">
                <div className="result-status">
                  <span className="result-dot" />
                  {batchResults.length} CASES COMPLETE
                </div>
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
                <span>COST SAVING</span>
                <strong>
                  {(batchTotals.costDelta >= 0 ? "−" : "+") +
                    Math.abs(batchTotals.costDelta).toFixed(1) +
                    "%"}
                </strong>
                <small>
                  {formatMoney(batchTotals.routeCostTotal)} vs{" "}
                  {formatMoney(batchTotals.directCostTotal)}
                </small>
              </div>
              <div className="summary-card">
                <span>TIME DELTA</span>
                <strong>
                  {(batchTotals.timeDelta >= 0 ? "−" : "+") +
                    Math.abs(batchTotals.timeDelta).toFixed(1) +
                    "%"}
                </strong>
                <small>
                  {formatTime(batchTotals.routeTimeTotal)} vs{" "}
                  {formatTime(batchTotals.directTimeTotal)}
                </small>
              </div>
              <div className="summary-card">
                <span>ROUTING MATCH</span>
                <strong>
                  {batchResults.length
                    ? (
                        (batchTotals.routingMatches / batchResults.length) *
                        100
                      ).toFixed(0) + "%"
                    : "—"}
                </strong>
                <small>
                  {batchTotals.routingMatches}/{batchResults.length} expected
                  difficulty labels
                </small>
              </div>
              <div className="summary-card">
                <span>QUALITY</span>
                <strong>Not measured</strong>
                <small>Requires Live coding-task evaluation</small>
              </div>
            </div>

            <div className="batch-table-wrap">
              <table className="batch-table">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Expected</th>
                    <th>JEV</th>
                    <th>Confidence</th>
                    <th>Route</th>
                    <th>Cost Δ</th>
                    <th>Time Δ</th>
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
                        {(item.costDelta >= 0 ? "−" : "+") +
                          Math.abs(item.costDelta).toFixed(1) +
                          "%"}
                      </td>
                      <td>
                        {(item.timeDelta >= 0 ? "−" : "+") +
                          Math.abs(item.timeDelta).toFixed(1) +
                          "%"}
                      </td>
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
