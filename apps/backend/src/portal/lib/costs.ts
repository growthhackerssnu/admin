import { summarizeAiUsage, firstAiUsageAt } from "@/dh/lib/listup/aiUsage";
import { LISTUP_GEMINI_MODEL } from "@/dh/lib/listup/gemini";

// 관리자 비용 화면의 집계. gh-adminpage에는 결제 내보내기(BigQuery)가 없어서 청구
// 금액을 직접 읽을 수 없다. 대신 GCP 사용량(Cloud Monitoring·Artifact Registry·
// Secret Manager)과 dh.ai_usage_events에 단가를 곱한 **추정치**를 낸다. 단가는
// 환경변수로 덮어쓸 수 있고, 기본값은 2026-10 공개 단가(Tier 1)다.

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? "gh-adminpage";
// Cloud Run 서비스와 Artifact Registry 저장소가 있는 리전.
const REGIONS = (process.env.GCP_REGIONS ?? "asia-northeast3,asia-northeast1")
  .split(",")
  .map((region) => region.trim())
  .filter(Boolean);

function rate(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return process.env[name] && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

export function costRates() {
  return {
    // Cloud Run 요청 기반 과금. 무료 한도는 결제 계정 단위로 매달 초기화된다.
    runVcpuSecondUsd: rate("COST_RUN_VCPU_SECOND_USD", 0.000024),
    runGibSecondUsd: rate("COST_RUN_GIB_SECOND_USD", 0.0000025),
    runRequestPerMillionUsd: rate("COST_RUN_REQUEST_PER_MILLION_USD", 0.4),
    runFreeVcpuSeconds: rate("COST_RUN_FREE_VCPU_SECONDS", 180_000),
    runFreeGibSeconds: rate("COST_RUN_FREE_GIB_SECONDS", 360_000),
    runFreeRequests: rate("COST_RUN_FREE_REQUESTS", 2_000_000),
    // 두 서비스 모두 1 vCPU·1 GiB로 배포한다(deploy-backend.yml, ghbot 배포 설정).
    runVcpuPerInstance: rate("COST_RUN_VCPU_PER_INSTANCE", 1),
    runGibPerInstance: rate("COST_RUN_GIB_PER_INSTANCE", 1),
    registryGbMonthUsd: rate("COST_REGISTRY_GB_MONTH_USD", 0.1),
    registryFreeGb: rate("COST_REGISTRY_FREE_GB", 0.5),
    secretVersionMonthUsd: rate("COST_SECRET_VERSION_MONTH_USD", 0.06),
    secretFreeVersions: rate("COST_SECRET_FREE_VERSIONS", 6),
    // 리스트업 로컬 관측(localObservability.ts)과 같은 변수 이름을 쓴다.
    llmInputPerMillionUsd: rate("LISTUP_INPUT_COST_PER_MILLION_USD", 0.3),
    llmOutputPerMillionUsd: rate("LISTUP_OUTPUT_COST_PER_MILLION_USD", 2.5),
    llmWebSearchCallUsd: rate("LISTUP_WEB_SEARCH_CALL_COST_USD", 0.014),
  };
}

type Rates = ReturnType<typeof costRates>;

// Cloud Run에서는 메타데이터 서버가 실행 서비스 계정의 토큰을 준다. 로컬에서는
// `GCP_ACCESS_TOKEN=$(gcloud auth print-access-token)`으로 넣는다.
async function accessToken() {
  if (process.env.GCP_ACCESS_TOKEN) return process.env.GCP_ACCESS_TOKEN;
  const res = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-account/token",
    { headers: { "Metadata-Flavor": "Google" } },
  );
  if (!res.ok) throw new Error(`GCP metadata token: HTTP ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function gcp<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      json?.error?.message ?? `${new URL(url).host}: HTTP ${res.status}`,
    );
  }
  return json as T;
}

type TimeSeries = {
  resource: { labels: Record<string, string> };
  points: {
    interval: { startTime: string };
    value: { doubleValue?: number; int64Value?: string };
  }[];
};

async function monitoringSeries(
  token: string,
  metric: string,
  start: Date,
  end: Date,
  alignmentSeconds: number,
) {
  const params = new URLSearchParams({
    filter: `metric.type="${metric}"`,
    "interval.startTime": start.toISOString(),
    "interval.endTime": end.toISOString(),
    "aggregation.alignmentPeriod": `${alignmentSeconds}s`,
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
    "aggregation.groupByFields": "resource.label.service_name",
  });
  const json = await gcp<{ timeSeries?: TimeSeries[] }>(
    token,
    `https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries?${params}`,
  );
  return (json.timeSeries ?? []).flatMap((series) =>
    series.points.map((point) => ({
      service: series.resource.labels.service_name || "(삭제된 서비스)",
      start: point.interval.startTime,
      value: Number(point.value.doubleValue ?? point.value.int64Value ?? 0),
    })),
  );
}

function sumByService(points: { service: string; value: number }[]) {
  const totals = new Map<string, number>();
  for (const point of points) {
    totals.set(point.service, (totals.get(point.service) ?? 0) + point.value);
  }
  return totals;
}

async function cloudRun(token: string, start: Date, end: Date, rates: Rates) {
  const seconds = Math.max(
    60,
    Math.ceil((end.getTime() - start.getTime()) / 1000),
  );
  const [instanceTime, requests, daily] = await Promise.all([
    monitoringSeries(
      token,
      "run.googleapis.com/container/billable_instance_time",
      start,
      end,
      seconds,
    ),
    monitoringSeries(
      token,
      "run.googleapis.com/request_count",
      start,
      end,
      seconds,
    ),
    monitoringSeries(
      token,
      "run.googleapis.com/container/billable_instance_time",
      new Date(end.getTime() - 30 * 86_400_000),
      end,
      86_400,
    ),
  ]);
  const timeByService = sumByService(instanceTime);
  const requestsByService = sumByService(requests);
  const services = [
    ...new Set([...timeByService.keys(), ...requestsByService.keys()]),
  ]
    .sort()
    .map((service) => {
      const instanceSeconds = timeByService.get(service) ?? 0;
      return {
        service,
        instanceSeconds,
        requests: requestsByService.get(service) ?? 0,
        vcpuSeconds: instanceSeconds * rates.runVcpuPerInstance,
        gibSeconds: instanceSeconds * rates.runGibPerInstance,
      };
    });
  const total = services.reduce(
    (sum, s) => ({
      vcpuSeconds: sum.vcpuSeconds + s.vcpuSeconds,
      gibSeconds: sum.gibSeconds + s.gibSeconds,
      requests: sum.requests + s.requests,
    }),
    { vcpuSeconds: 0, gibSeconds: 0, requests: 0 },
  );
  // 무료 한도는 서비스별이 아니라 결제 계정 전체에 한 번 적용된다.
  const costUsd =
    Math.max(0, total.vcpuSeconds - rates.runFreeVcpuSeconds) *
      rates.runVcpuSecondUsd +
    Math.max(0, total.gibSeconds - rates.runFreeGibSeconds) *
      rates.runGibSecondUsd +
    (Math.max(0, total.requests - rates.runFreeRequests) / 1_000_000) *
      rates.runRequestPerMillionUsd;
  const listCostUsd =
    total.vcpuSeconds * rates.runVcpuSecondUsd +
    total.gibSeconds * rates.runGibSecondUsd +
    (total.requests / 1_000_000) * rates.runRequestPerMillionUsd;
  return {
    services,
    total,
    costUsd,
    listCostUsd,
    daily: daily.map((point) => ({
      date: point.start.slice(0, 10),
      service: point.service,
      instanceHours: point.value / 3600,
    })),
  };
}

async function registry(token: string) {
  const lists = await Promise.all(
    REGIONS.map((region) =>
      gcp<{ repositories?: { name: string; sizeBytes?: string }[] }>(
        token,
        `https://artifactregistry.googleapis.com/v1/projects/${PROJECT_ID}/locations/${region}/repositories`,
      ),
    ),
  );
  return lists
    .flatMap((list) => list.repositories ?? [])
    .map((repo) => ({
      name: repo.name.split("/").pop()!,
      gb: Number(repo.sizeBytes ?? 0) / 1e9,
    }));
}

async function secretVersions(token: string) {
  const { secrets = [] } = await gcp<{ secrets?: { name: string }[] }>(
    token,
    `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets?pageSize=250`,
  );
  const counts = await Promise.all(
    secrets.map(async (secret) => {
      const { versions = [] } = await gcp<{ versions?: unknown[] }>(
        token,
        `https://secretmanager.googleapis.com/v1/${secret.name}/versions?filter=state:ENABLED&pageSize=100`,
      );
      return versions.length;
    }),
  );
  return {
    secrets: secrets.length,
    versions: counts.reduce((a, b) => a + b, 0),
  };
}

export type CostLine = {
  key: string;
  category: "server" | "llm";
  name: string;
  usage: string;
  costUsd: number | null;
  error?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "알 수 없는 오류";
}

function formatNumber(value: number, digits = 0) {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits });
}

// 이번 달(UTC) 1일부터 지금까지의 추정 비용. 저장 비용처럼 월 단위로 붙는 항목은
// 지난 날짜 비율만큼 나눠 담고, forecastUsd는 같은 속도로 한 달을 채운 값이다.
export async function estimateMonthToDateCosts(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const monthFraction =
    (now.getTime() - start.getTime()) / (nextMonth.getTime() - start.getTime());
  const rates = costRates();
  const lines: CostLine[] = [];

  const [token, ai, aiSince] = await Promise.all([
    accessToken().catch((error: unknown) => error),
    summarizeAiUsage(start, now),
    firstAiUsageAt(),
  ]);

  let daily: { date: string; service: string; instanceHours: number }[] = [];
  if (typeof token !== "string") {
    lines.push({
      key: "gcp",
      category: "server",
      name: "Google Cloud",
      usage: "—",
      costUsd: null,
      error: `GCP 인증 실패: ${errorMessage(token)}`,
    });
  } else {
    const [run, repos, secrets] = await Promise.allSettled([
      cloudRun(token, start, now, rates),
      registry(token),
      secretVersions(token),
    ]);

    if (run.status === "fulfilled") {
      daily = run.value.daily;
      const hours =
        run.value.total.vcpuSeconds / rates.runVcpuPerInstance / 3600;
      lines.push({
        key: "cloud-run",
        category: "server",
        name: "Cloud Run",
        usage: `${run.value.services
          .map(
            (s) => `${s.service} ${formatNumber(s.instanceSeconds / 3600, 1)}h`,
          )
          .join(
            " · ",
          )} — 합계 ${formatNumber(hours, 1)}h, 요청 ${formatNumber(run.value.total.requests)}건 (무료 한도 전 정가 $${run.value.listCostUsd.toFixed(2)})`,
        costUsd: run.value.costUsd,
      });
    } else {
      lines.push({
        key: "cloud-run",
        category: "server",
        name: "Cloud Run",
        usage: "—",
        costUsd: null,
        error: errorMessage(run.reason),
      });
    }

    if (repos.status === "fulfilled") {
      const gb = repos.value.reduce((sum, repo) => sum + repo.gb, 0);
      lines.push({
        key: "artifact-registry",
        category: "server",
        name: "Artifact Registry (컨테이너 이미지)",
        usage: `${repos.value.map((r) => `${r.name} ${formatNumber(r.gb, 2)}GB`).join(" · ")} (무료 ${rates.registryFreeGb}GB)`,
        costUsd:
          Math.max(0, gb - rates.registryFreeGb) *
          rates.registryGbMonthUsd *
          monthFraction,
      });
    } else {
      lines.push({
        key: "artifact-registry",
        category: "server",
        name: "Artifact Registry (컨테이너 이미지)",
        usage: "—",
        costUsd: null,
        error: errorMessage(repos.reason),
      });
    }

    if (secrets.status === "fulfilled") {
      lines.push({
        key: "secret-manager",
        category: "server",
        name: "Secret Manager",
        usage: `시크릿 ${secrets.value.secrets}개, 활성 버전 ${secrets.value.versions}개 (무료 ${rates.secretFreeVersions}개)`,
        costUsd:
          Math.max(0, secrets.value.versions - rates.secretFreeVersions) *
          rates.secretVersionMonthUsd *
          monthFraction,
      });
    } else {
      lines.push({
        key: "secret-manager",
        category: "server",
        name: "Secret Manager",
        usage: "—",
        costUsd: null,
        error: errorMessage(secrets.reason),
      });
    }
  }

  const models = ai.length
    ? ai
    : [
        {
          model: LISTUP_GEMINI_MODEL,
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          webSearchCalls: 0,
        },
      ];
  for (const usage of models) {
    lines.push({
      key: `llm-${usage.model}`,
      category: "llm",
      name: `Gemini (${usage.model})`,
      usage: `호출 ${formatNumber(usage.calls)}회 · 입력 ${formatNumber(usage.inputTokens)} · 출력 ${formatNumber(usage.outputTokens)} 토큰 · 검색 ${formatNumber(usage.webSearchCalls)}회`,
      costUsd:
        (usage.inputTokens / 1_000_000) * rates.llmInputPerMillionUsd +
        (usage.outputTokens / 1_000_000) * rates.llmOutputPerMillionUsd +
        usage.webSearchCalls * rates.llmWebSearchCallUsd,
    });
  }

  const known = lines.filter((line) => line.costUsd !== null);
  const sum = (category?: CostLine["category"]) =>
    known
      .filter((line) => !category || line.category === category)
      .reduce((total, line) => total + line.costUsd!, 0);

  return {
    period: { start: start.toISOString(), end: now.toISOString() },
    currency: "USD" as const,
    totals: {
      serverUsd: sum("server"),
      llmUsd: sum("llm"),
      totalUsd: sum(),
      forecastUsd: monthFraction > 0 ? sum() / monthFraction : 0,
      complete: known.length === lines.length,
    },
    lines,
    daily,
    llmTrackingSince: aiSince?.toISOString() ?? null,
    rates,
  };
}
