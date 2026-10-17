import { prisma } from "@/lib/prisma";
import type { AiCallMetric } from "./localObservability";

// Gemini 호출마다 사용량을 dh.ai_usage_events에 남긴다. 기록 실패가 조사 작업을
// 멈추면 안 되므로 기다리지 않고 오류는 로그만 남긴다.
export function recordAiUsage(operation: string, metric: AiCallMetric) {
  void prisma.aiUsageEvent
    .create({
      data: {
        model: metric.model,
        operation,
        status: metric.status,
        inputTokens: metric.inputTokens ?? 0,
        outputTokens: metric.outputTokens ?? 0,
        webSearchCalls: metric.webSearchCallCount ?? 0,
        durationMs: metric.durationMs,
      },
    })
    .catch((error) => console.error("[ai-usage] record failed", error));
}

export type AiUsageTotal = {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
};

// 관리자 비용 화면(portal)은 dh 테이블을 직접 읽지 않고 이 함수로 합계만 받는다.
export async function summarizeAiUsage(since: Date, until: Date) {
  const rows = await prisma.aiUsageEvent.groupBy({
    by: ["model"],
    where: { createdAt: { gte: since, lt: until } },
    _count: { _all: true },
    _sum: { inputTokens: true, outputTokens: true, webSearchCalls: true },
  });
  return rows.map(
    (row): AiUsageTotal => ({
      model: row.model,
      calls: row._count._all,
      inputTokens: row._sum.inputTokens ?? 0,
      outputTokens: row._sum.outputTokens ?? 0,
      webSearchCalls: row._sum.webSearchCalls ?? 0,
    }),
  );
}

// 사용량 기록을 처음 시작한 시각. 화면이 "언제부터의 값인지" 보여주는 데 쓴다.
export async function firstAiUsageAt() {
  const first = await prisma.aiUsageEvent.findFirst({
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return first?.createdAt ?? null;
}
