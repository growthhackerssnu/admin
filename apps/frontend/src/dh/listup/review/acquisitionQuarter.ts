import type { AcquisitionRound, TargetQuarter } from "./contracts";
import {
  HumanReviewApiError,
  type HumanReviewTransport,
  type ApiEnvelope,
} from "./humanReviewApi";

export class AcquisitionQuarterApi {
  constructor(private readonly api: HumanReviewTransport) {}
  async current() {
    return (
      await this.api.request<AcquisitionRound | null>(
        "/acquisition-rounds/current",
      )
    ).data;
  }
  async quarters() {
    const rows: TargetQuarter[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const page: ApiEnvelope<TargetQuarter[]> = await this.api.request<
        TargetQuarter[]
      >(
        `/target-quarters?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      rows.push(...page.data);
      const next: string | null = page.page?.hasMore
        ? page.page.nextCursor
        : null;
      if (page.page?.hasMore && (!next || seen.has(next)))
        throw new Error("수주 분기 목록을 불러오지 못했습니다.");
      if (next) seen.add(next);
      cursor = next;
    } while (cursor);
    return rows;
  }
  async register(year: number, quarter: number, key: string) {
    try {
      return (
        await this.api.request<TargetQuarter>(
          "/target-quarters",
          "POST",
          { year, quarter },
          key,
        )
      ).data;
    } catch (error) {
      if (
        !(error instanceof HumanReviewApiError) ||
        error.code !== "ALREADY_EXISTS"
      )
        throw error;
      const existing = (await this.quarters()).find(
        (item) => item.year === year && item.quarter === quarter,
      );
      if (!existing) throw error;
      return existing;
    }
  }
  async set(
    targetQuarterId: string,
    expectedActiveRoundId: string | null,
    key: string,
  ) {
    return (
      await this.api.request<{
        currentRound: AcquisitionRound;
        closedRoundId: string | null;
        unresolvedCount: number;
      }>(
        "/acquisition-rounds",
        "POST",
        { targetQuarterId, expectedActiveRoundId },
        key,
      )
    ).data;
  }
}
