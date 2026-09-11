import Parser from "rss-parser";
import type { SourceFeed } from "@prisma/client";
import { extractCompanyNameCandidate } from "./ruleBasedExtract";

export type RawCandidate = {
  name: string;
  sourceTitle: string;
  sourceUrl: string;
  publishedAt: Date | null;
};

// 일부 RSS 서버는 브라우저가 아닌 요청(기본 Node User-Agent 등)을 차단한다(플래텀 등에서 확인).
const parser = new Parser({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  },
});

/** RSS 피드 하나를 읽어 회사명으로 보이는 후보를 규칙 기반으로 추출한다. */
export async function fetchRssCandidates(feed: SourceFeed): Promise<RawCandidate[]> {
  const parsed = await parser.parseURL(feed.url);
  const candidates: RawCandidate[] = [];

  for (const item of parsed.items) {
    if (!item.title || !item.link) continue;
    const name = extractCompanyNameCandidate(item.title);
    if (!name) continue;

    candidates.push({
      name,
      sourceTitle: item.title,
      sourceUrl: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate) : null,
    });
  }

  return candidates;
}

/** 활성화된 SourceFeed를 모두 읽어 회사명 후보를 모으고, 이름 기준으로 중복을 제거한다. */
export async function collectRawCandidates(feeds: SourceFeed[]): Promise<RawCandidate[]> {
  const results: RawCandidate[] = [];
  const seenNames = new Set<string>();

  for (const feed of feeds) {
    if (feed.type !== "RSS") {
      // JOB_BOARD/VC_PORTFOLIO는 사이트마다 구조가 달라 사이트별 커넥터가 별도로 필요하다.
      // 지금은 RSS만 지원하고, 다른 타입은 건너뛴다(TODO: Phase 2.x에서 사이트별 커넥터 추가).
      continue;
    }

    try {
      const candidates = await fetchRssCandidates(feed);
      for (const c of candidates) {
        const key = c.name.toLowerCase();
        if (seenNames.has(key)) continue;
        seenNames.add(key);
        results.push(c);
      }
    } catch (err) {
      console.error(`[sourcing] failed to fetch feed ${feed.name} (${feed.url})`, err);
    }
  }

  // 최신 기사 우선으로 정렬해, 이후 단계에서 개수를 제한할 때 최신 후보가 살아남게 한다.
  results.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  return results;
}
