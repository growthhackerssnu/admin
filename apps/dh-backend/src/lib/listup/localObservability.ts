type Status = "succeeded" | "failed";

export type AiCallMetric = {
  durationMs: number;
  status: Status;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  webSearchCallCount?: number;
  error?: string;
};

type Step = AiCallMetric & { name: string };

function configuredRate(name: string) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function costUsd(metric: AiCallMetric) {
  const inputRate = configuredRate("LISTUP_INPUT_COST_PER_MILLION_USD");
  const outputRate = configuredRate("LISTUP_OUTPUT_COST_PER_MILLION_USD");
  const searchRate = configuredRate("LISTUP_WEB_SEARCH_CALL_COST_USD");
  if (inputRate === null || outputRate === null || searchRate === null)
    return null;
  return Number(
    (
      ((metric.inputTokens ?? 0) * inputRate) / 1_000_000 +
      ((metric.outputTokens ?? 0) * outputRate) / 1_000_000 +
      (metric.webSearchCallCount ?? 0) * searchRate
    ).toFixed(8),
  );
}

export class LocalTaskReporter {
  private readonly startedAt = new Date();
  private readonly startedMs = performance.now();
  private readonly steps: Step[] = [];
  private readonly enabled = process.env.LISTUP_LOCAL_OBSERVABILITY === "true";

  constructor(
    private readonly taskId: string,
    private readonly agent: string,
  ) {}

  captureAiCall(name: string, metric: AiCallMetric) {
    if (!this.enabled) return;
    this.steps.push({ name, ...metric });
  }

  async measure<T>(name: string, action: () => Promise<T>) {
    if (!this.enabled) return action();
    const startedMs = performance.now();
    try {
      const value = await action();
      this.steps.push({
        name,
        status: "succeeded",
        model: "local",
        durationMs: Math.round(performance.now() - startedMs),
      });
      return value;
    } catch (error) {
      this.steps.push({
        name,
        status: "failed",
        model: "local",
        durationMs: Math.round(performance.now() - startedMs),
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  finish(status: Status, outcome: Record<string, unknown> = {}) {
    if (!this.enabled) return;
    const totals = this.steps.reduce(
      (total, step) => ({
        inputTokens: total.inputTokens + (step.inputTokens ?? 0),
        outputTokens: total.outputTokens + (step.outputTokens ?? 0),
        webSearchCallCount:
          total.webSearchCallCount + (step.webSearchCallCount ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0, webSearchCallCount: 0 },
    );
    const aiSteps = this.steps.filter((step) => step.model !== "local");
    const estimatedCostUsd = aiSteps.reduce<number | null>((total, step) => {
      const cost = costUsd(step);
      return total === null || cost === null ? null : total + cost;
    }, 0);

    console.info(
      "[listup-observability]",
      JSON.stringify({
        taskId: this.taskId,
        agent: this.agent,
        status,
        startedAt: this.startedAt.toISOString(),
        durationMs: Math.round(performance.now() - this.startedMs),
        ...totals,
        estimatedCostUsd,
        costConfigured: estimatedCostUsd !== null,
        outcome,
        steps: this.steps.map((step) => ({
          ...step,
          estimatedCostUsd: costUsd(step),
        })),
      }),
    );
  }
}
