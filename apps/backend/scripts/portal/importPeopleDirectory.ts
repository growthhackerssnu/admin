// 노션 People DB -> people_directory 수동 동기화. 평소엔 가입 신청이 명단에 없을 때
// 자동으로 돌므로 따로 돌릴 일은 드물다. 로직은 syncPeopleDirectory 참고.
//
// 사용법: npm run people:import
import { prisma } from "@/lib/prisma";
import { syncPeopleDirectory } from "@/portal/lib/peopleDirectorySync";

syncPeopleDirectory()
  .then(({ imported, updated, skipped }) => {
    console.log(`가져오기 완료: 신규 ${imported}건, 갱신 ${updated}건, 건너뜀 ${skipped.length}건`);
    if (skipped.length > 0) {
      console.log("건너뛴 행(기수/이름/이메일 중 하나가 비어있음):");
      skipped.forEach((s) => console.log(`  - ${s}`));
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
