// 일회성 스크립트: 프로젝트 앱의 백서 상세를 전부 미리 만들어 둔다.
//
// 상세는 처음 열 때 Notion 블록을 재귀로 읽느라 페이지당 ~10초가 걸린다. 한 번 만들면
// Notion에서 수정될 때까지 캐시를 쓰고(src/hr/lib/whitepapers.ts), 서버도 목록을 다시
// 만들 때마다 몇 개씩 미리 만들지만, 배포 직후나 Notion에서 여러 백서를 한꺼번에 고친
// 뒤엔 이걸로 한 번에 채운다. 이미 최신인 백서는 건너뛰므로 재실행해도 안전하다.
//
// 사용법: npm run whitepapers:warm
import { warmAllWhitepaperDetails } from "@/hr/lib/whitepapers";

async function main() {
  const started = Date.now();
  const built = await warmAllWhitepaperDetails((title, didBuild) =>
    console.log(`  ${didBuild ? "✓ 만듦" : "· 최신"}  ${title}`),
  );
  console.log(`완료: ${built}건 새로 만듦 (${Math.round((Date.now() - started) / 1000)}초)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
