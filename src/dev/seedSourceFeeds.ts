import { prisma } from "../lib/prisma";

/**
 * 소싱 파이프라인이 읽을 RSS 피드 초기 시드. 사이트별 스크래핑 대신 공개 RSS만 사용하고,
 * 이용약관이 불명확한 더브이씨/혁신의숲류는 배제한다(계획서 참조). 더 추가/비활성화하려면
 * SourceFeed 테이블을 직접 편집하면 된다 — 코드 하드코딩 없이 운영하기 위한 테이블이다.
 */
const SEED_FEEDS = [
  { name: "플래텀", url: "https://platum.kr/feed", type: "RSS" as const },
  { name: "아웃스탠딩", url: "https://wp.outstanding.kr/feed/", type: "RSS" as const },
];

export async function seedSourceFeeds() {
  for (const feed of SEED_FEEDS) {
    const existing = await prisma.sourceFeed.findFirst({ where: { url: feed.url } });
    if (existing) continue;
    await prisma.sourceFeed.create({ data: feed });
  }
}

if (require.main === module) {
  seedSourceFeeds()
    .then(() => {
      console.log("SourceFeed 시드 완료");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
