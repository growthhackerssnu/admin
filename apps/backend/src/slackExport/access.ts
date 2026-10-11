import type { Member } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/portal/lib/errors";
import { normalizeCohort } from "@/portal/lib/normalize";

// 슬랙 백업(/slack)은 admin·acting과 19기 이후 알럼나이가 쓴다 — 액팅 때 만든 백업을 졸업 뒤에도
// 열어 볼 수 있게. 기수는 가입 때 연결된 people_directory 항목에서 읽고, 연결이 없으면 막는다.
export const SLACK_BACKUP_MIN_ALUMNI_COHORT = 19;

export function isSlackBackupCohort(cohort: string | null | undefined) {
  return Number(normalizeCohort(cohort ?? "")) >= SLACK_BACKUP_MIN_ALUMNI_COHORT;
}

export async function canUseSlackBackup(member: Pick<Member, "id" | "role">) {
  if (member.role !== "alumni") return true;
  const entry = await prisma.peopleDirectory.findUnique({ where: { claimedByMemberId: member.id }, select: { cohort: true } });
  return isSlackBackupCohort(entry?.cohort);
}

export async function requireSlackBackup(member: Pick<Member, "id" | "role">) {
  if (!(await canUseSlackBackup(member))) throw new ApiError("FORBIDDEN", "슬랙 백업은 액팅 회원과 19기 이후 알럼나이만 쓸 수 있습니다.");
}
