// 노션 People DB → 어드민 동기화 한 바퀴: 명단(새 사람은 자동 가입) → 운영팀 직책(양방향).
// Inngest가 주기적으로 부르고(src/portal/inngest.ts), `npm run members:sync -w apps/backend`로 손으로도 돌린다.
import { syncPeopleDirectory } from "@/portal/lib/peopleDirectorySync";
import { syncOpsRoles } from "@/portal/lib/opsRoleSync";

export async function syncNotionMembers({ dryRun = false } = {}) {
  const { pages, ...directory } = await syncPeopleDirectory({ dryRun });
  const opsRoles = await syncOpsRoles(pages, { dryRun });
  return {
    imported: directory.imported,
    updated: directory.updated,
    skipped: directory.skipped,
    created: directory.created.map((m) => `${m.cohort}기 ${m.name} (${m.email}, ${m.role})`),
    linked: directory.linked,
    opsRoles,
  };
}
