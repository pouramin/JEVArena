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
  analyzePrompt,
  makeRunPlan,
  type RunPlan
} from "./lib/simulator";

type Phase = "idle" | "running" | "done";
type Expectation = "Auto" | "Easy" | "Medium" | "Hard";

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
  sub
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="metric">
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

export default function App() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [modelId, setModelId] = useState("claude-opus-5-5");
  const [expectation, setExpectation] = useState<Expectation>("Auto");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [runCount, setRunCount] = useState(0);
  const [presentation, setPresentation] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<RunPlan | null>(null);

  const directModel = getModel(modelId);
  const previewPlan = useMemo(
    () => makeRunPlan(prompt, directModel),
    [prompt, directModel]
  );
  const livePlan = currentPlan ?? previewPlan;
  const previewAnalysis = useMemo(() => analyzePrompt(prompt), [prompt]);

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

  const isLocked = phase === "running";
  const routeProgress = Math.min(elapsed / livePlan.route.totalSeconds, 1);
  const directProgress = Math.min(elapsed / livePlan.direct.totalSeconds, 1);

  const decisionVisible =
    phase === "done" ||
    (phase === "running" && elapsed >= livePlan.route.decisionSeconds);
  const routeDone =
    phase === "done" || elapsed >= livePlan.route.totalSeconds;
  const directDone =
    phase === "done" || elapsed >= livePlan.direct.totalSeconds;

  const routeCost =
    phase === "idle" ? 0 : livePlan.route.totalCost * routeProgress;
  const directCost =
    phase === "idle" ? 0 : livePlan.direct.totalCost * directProgress;

  const run = () => {
    if (!prompt.trim() || phase === "running") return;
    const plan = makeRunPlan(prompt, directModel);
    setCurrentPlan(plan);
    setElapsed(0);
    setRunCount((count) => count + 1);
    setPhase("running");
  };

  const reset = () => {
    setPhase("idle");
    setElapsed(0);
    setCurrentPlan(null);
  };

  const chooseProvider = (next: Provider) => {
    setProvider(next);
    const nextModels = modelsForProvider(next);
    const preferred =
      nextModels.find((model) => model.tier === directModel.tier) ??
      nextModels[0];
    setModelId(preferred.id);
    reset();
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

  const routeSaving =
    ((livePlan.direct.totalCost - livePlan.route.totalCost) /
      livePlan.direct.totalCost) *
    100;
  const timeSaving =
    ((livePlan.direct.totalSeconds - livePlan.route.totalSeconds) /
      livePlan.direct.totalSeconds) *
    100;

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
          <span className="eyebrow">ONE PROMPT · TWO PATHS</span>
          <h1>Watch the routing decision happen.</h1>
        </div>
        <p>
          JEV chooses the model on the left. You choose the direct baseline on
          the right. Cost and latency race in real time.
        </p>
      </section>

      <section className="arena-grid">
        <article
          className={
            "lane-card jev-lane" + (phase === "running" ? " is-running" : "")
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
              {phase === "idle" ? "READY" : routeDone ? "DONE" : "LIVE"}
            </span>
          </div>

          <div className="route-stage">
            {phase === "idle" ? (
              <div className="decision-idle">
                <div className="decision-orb">
                  <span />
                  <b>JEV</b>
                </div>
                <p>Waiting for the same prompt.</p>
                <small>
                  The router will classify task complexity and choose an
                  Anthropic model tier.
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
                  <div className="confidence-ring">
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
                  <span className={"tier-pill tier-" + livePlan.route.model.tier}>
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
                phase === "idle"
                  ? 0
                  : Math.min(elapsed, livePlan.route.totalSeconds)
              )}
              sub={
                decisionVisible
                  ? formatTime(livePlan.route.decisionSeconds) + " JEV"
                  : "decision + model"
              }
            />
            <Metric
              label="COST"
              value={formatMoney(routeCost)}
              sub={
                decisionVisible
                  ? formatMoney(livePlan.route.jevCost) + " JEV"
                  : "live estimate"
              }
            />
          </div>

          <Timeline
            kind="route"
            elapsed={elapsed}
            plan={livePlan}
            done={routeDone}
          />

          <div className="lane-foot">
            <span>Input {formatTokens(livePlan.route.inputTokens)}</span>
            <span>Output {formatTokens(livePlan.route.outputTokens)}</span>
          </div>
        </article>

        <article className="prompt-card">
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
              <span>JEV preview</span>
              <strong>{previewAnalysis.complexity}</strong>
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
            className={"run-button" + (isLocked ? " running" : "")}
            type="button"
            disabled={!prompt.trim() || isLocked}
            onClick={run}
          >
            <span className="run-icon">{isLocked ? "●" : "▶"}</span>
            <span>
              <strong>{isLocked ? "Race in progress" : "Run benchmark"}</strong>
              <small>
                {isLocked
                  ? "Both paths are running from the same prompt"
                  : "Start both paths at the same time"}
              </small>
            </span>
          </button>

          <p className="method-note">
            Simulation mode uses identical token estimates and published list
            prices. Timing is illustrative until the live API bridge is wired.
          </p>
        </article>

        <article
          className={
            "lane-card direct-lane" +
            (phase === "running" ? " is-running" : "")
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
              {phase === "idle" ? "MANUAL" : directDone ? "DONE" : "LIVE"}
            </span>
          </div>

          <div className="provider-switch">
            <button
              type="button"
              disabled={isLocked}
              className={provider === "anthropic" ? "active" : ""}
              onClick={() => chooseProvider("anthropic")}
            >
              Anthropic
            </button>
            <button
              type="button"
              disabled={isLocked}
              className={provider === "openai" ? "active" : ""}
              onClick={() => chooseProvider("openai")}
            >
              OpenAI
            </button>
          </div>

          <div className="model-list">
            {modelsForProvider(provider).map((model) => (
              <ModelOption
                key={model.id}
                model={model}
                selected={model.id === modelId}
                disabled={isLocked}
                onSelect={() => {
                  setModelId(model.id);
                  reset();
                }}
              />
            ))}
          </div>

          <div className="direct-selected">
            <div>
              <span className="micro-label">DIRECT CALL</span>
              <strong>{livePlan.direct.model.name}</strong>
            </div>
            <span className="no-router">NO ROUTER</span>
          </div>

          <div className="metrics-grid">
            <Metric
              label="TIME"
              value={formatTime(
                phase === "idle"
                  ? 0
                  : Math.min(elapsed, livePlan.direct.totalSeconds)
              )}
              sub="model only"
            />
            <Metric
              label="COST"
              value={formatMoney(directCost)}
              sub="live estimate"
            />
          </div>

          <Timeline
            kind="direct"
            elapsed={elapsed}
            plan={livePlan}
            done={directDone}
          />

          <div className="lane-foot">
            <span>Input {formatTokens(livePlan.direct.inputTokens)}</span>
            <span>Output {formatTokens(livePlan.direct.outputTokens)}</span>
          </div>
        </article>

        <section
          className={
            "results-panel" +
            (phase === "done" ? " visible" : "") +
            (phase === "running" ? " tracking" : "")
          }
        >
          <div className="results-heading">
            <div>
              <span className="lane-kicker">BENCHMARK VERDICT</span>
              <h2>
                {phase === "idle"
                  ? "Results appear here after the race."
                  : phase === "running"
                    ? "Measuring both paths..."
                    : routeSaving >= 0
                      ? "Routing used less money on this task."
                      : "The direct path cost less on this task."}
              </h2>
            </div>

            <div className="result-status">
              <span className="result-dot" />
              {phase === "done" ? "SIMULATION COMPLETE" : "WAITING"}
            </div>
          </div>

          <div className="result-comparison">
            <div className="result-path route">
              <span>JEV ROUTE</span>
              <strong>{livePlan.route.model.compactName}</strong>
              <b>
                {phase === "done"
                  ? formatMoney(livePlan.route.totalCost)
                  : "—"}
              </b>
              <small>
                {phase === "done"
                  ? formatTime(livePlan.route.totalSeconds)
                  : "—"}
              </small>
            </div>

            <div className="vs-badge">VS</div>

            <div className="result-path direct">
              <span>DIRECT</span>
              <strong>{livePlan.direct.model.compactName}</strong>
              <b>
                {phase === "done"
                  ? formatMoney(livePlan.direct.totalCost)
                  : "—"}
              </b>
              <small>
                {phase === "done"
                  ? formatTime(livePlan.direct.totalSeconds)
                  : "—"}
              </small>
            </div>

            <div className="saving-card">
              <span>COST DELTA</span>
              <strong>
                {phase === "done"
                  ? (routeSaving >= 0 ? "−" : "+") +
                    Math.abs(routeSaving).toFixed(1) +
                    "%"
                  : "—"}
              </strong>
              <small>
                {routeSaving >= 0 ? "with JEV routing" : "routing overhead"}
              </small>
            </div>

            <div className="saving-card">
              <span>TIME DELTA</span>
              <strong>
                {phase === "done"
                  ? (timeSaving >= 0 ? "−" : "+") +
                    Math.abs(timeSaving).toFixed(1) +
                    "%"
                  : "—"}
              </strong>
              <small>
                {timeSaving >= 0 ? "with JEV routing" : "routing overhead"}
              </small>
            </div>
          </div>

          {phase === "done" ? (
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
                <span>Outcome</span>
                <strong>Simulated pass</strong>
              </div>
            </div>
          ) : null}
        </section>
      </section>

      <footer className="footer">
        <span>JEVArena · simulation-first benchmark UI</span>
        <span>Prices configured for standard API list rates · Oct 2026</span>
      </footer>
    </main>
  );
}
