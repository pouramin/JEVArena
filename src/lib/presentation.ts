export const COST_TIE_THRESHOLD_PERCENT = 0.2;

export type CostDeltaDisposition = "route" | "direct" | "tie";

export function percentageDelta(baseline: number, candidate: number) {
  if (!baseline) return 0;
  return ((baseline - candidate) / baseline) * 100;
}

export function costDeltaDisposition(delta: number): CostDeltaDisposition {
  if (delta > COST_TIE_THRESHOLD_PERCENT) return "route";
  if (delta < -COST_TIE_THRESHOLD_PERCENT) return "direct";
  return "tie";
}

export type TimelineEvent = {
  label: string;
  at: number;
};

export function routeTimelineEvents({
  totalSeconds,
  decisionSeconds,
  modelName,
  engineLabel
}: {
  totalSeconds: number;
  decisionSeconds: number;
  modelName: string;
  engineLabel: string;
}): TimelineEvent[] {
  const safeDecision = Math.max(0, Math.min(decisionSeconds, totalSeconds));
  const modelSeconds = Math.max(0, totalSeconds - safeDecision);

  return [
    { label: "Prompt received", at: 0 },
    { label: engineLabel + " analyzing", at: safeDecision * 0.45 },
    { label: "Routing decision ready", at: safeDecision },
    { label: modelName + " started", at: safeDecision },
    {
      label: "Generating response",
      at: safeDecision + modelSeconds * 0.42
    },
    { label: "Response complete", at: totalSeconds }
  ];
}
