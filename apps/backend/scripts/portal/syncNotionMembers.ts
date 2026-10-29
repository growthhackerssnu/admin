// 노션 People DB → 회원 자동 가입·운영팀 직책 양방향 동기화를 손으로 한 번 돌린다.
// 평소엔 Inngest가 10분마다 돈다(src/portal/inngest.ts). --dry-run이면 아무것도 쓰지 않고
// 무엇이 바뀔지만 보여준다 — 처음 켜기 전에 한 번 돌려본다.
//
// 사용법: npm run members:sync -w apps/backend [-- --dry-run]
import { prisma } from "@/lib/prisma";
import { syncNotionMembers } from "@/portal/lib/notionMemberSync";

const dryRun = process.argv.includes("--dry-run");

syncNotionMembers({ dryRun })
  .then((r) => {
    const list = (title: string, items: string[]) => {
      console.log(`${title}: ${items.length}건`);
      items.forEach((item) => console.log(`  - ${item}`));
    };
    console.log(dryRun ? "[dry-run] 아무것도 쓰지 않았습니다.\n" : "");
    console.log(`명단: 신규 ${r.imported}건, 갱신 ${r.updated}건, 건너뜀 ${r.skipped.length}건`);
    list("자동 가입", r.created);
    list("기존 회원에 연결", r.linked);
    list("직책 노션 → 어드민", r.opsRoles.fromNotion);
    list("직책 어드민 → 노션", r.opsRoles.toNotion);
    list("직책 반영 실패", r.opsRoles.failed);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
