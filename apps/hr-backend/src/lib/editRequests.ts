// 알럼나이 셀프 편집 제출 처리(ARCHITECTURE.md §5, §12.3, §12.3.1).
//
// before는 항상 "지금 캐시/Notion에 있는 값"이다 — 프런트가 보낸 값을 그대로
// 믿지 않고 서버가 직접 계산한다(클라이언트 조작 방지 + before/after가 실제
// Notion 값과 항상 맞게 하려는 목적).
import type { Member } from "@/generated/prisma";
import { z } from "zod";
import { ApiError } from "./errors";
import { prisma } from "./prisma";
import { getPersonDetail, type PersonDetail } from "./peopleCache";

export const EditRequestInput = z.object({
  email: z.string().trim().nullable(),
  linkedin: z.string().trim().nullable(),
  currentCareerOneLine: z.string().trim().nullable(),
  cohort: z.number().int(),
  jobField: z.string().trim().nullable(),
  department: z.array(z.string()),
  team: z.array(z.string()),
  careersText: z.string(),
  activitiesText: z.string(),
  projectsText: z.string(),
});
export type EditRequestInput = z.infer<typeof EditRequestInput>;

type DiffEntry = { before: unknown; after: unknown };
type EditDiff = {
  structuredFields: Record<string, DiffEntry>;
  freeTextSections: Record<string, DiffEntry>;
};

// DB_SCHEMA_HR.md §1.1: 안 바뀐 필드/섹션은 diff에 아예 안 넣는다(승인 큐에서
// 바뀐 것만 보여주기 위함).
function addIfChanged(bucket: Record<string, DiffEntry>, key: string, before: unknown, after: unknown) {
  if (before !== after) bucket[key] = { before, after };
}

function addArrayIfChanged(bucket: Record<string, DiffEntry>, key: string, before: string[], after: string[]) {
  const normalize = (arr: string[]) => JSON.stringify([...arr].sort());
  if (normalize(before) !== normalize(after)) bucket[key] = { before, after };
}

function computeDiff(baseline: PersonDetail, input: EditRequestInput): EditDiff {
  const structuredFields: Record<string, DiffEntry> = {};
  const freeTextSections: Record<string, DiffEntry> = {};

  addIfChanged(structuredFields, "이메일", baseline.email, input.email || null);
  addIfChanged(structuredFields, "LinkedIn", baseline.linkedin, input.linkedin || null);
  addIfChanged(
    structuredFields,
    "현재 커리어",
    baseline.currentCareerOneLine,
    input.currentCareerOneLine || null,
  );
  addIfChanged(structuredFields, "기수", baseline.cohort, input.cohort);
  addIfChanged(structuredFields, "직무 계열", baseline.jobField, input.jobField || null);
  addArrayIfChanged(structuredFields, "학과", baseline.department, input.department);
  addArrayIfChanged(structuredFields, "소속팀", baseline.team, input.team);

  addIfChanged(freeTextSections, "careers", baseline.careersText, input.careersText);
  addIfChanged(freeTextSections, "activities", baseline.activitiesText, input.activitiesText);
  addIfChanged(freeTextSections, "projects", baseline.projectsText, input.projectsText);

  return { structuredFields, freeTextSections };
}

// 로그인한 사람 본인의 프로필만 수정 가능(PRD §6.1) — member.claimedPersonEntry로
// 매칭(ARCHITECTURE.md §5, "본인 프로필 ↔ Notion 페이지" 매칭 방법).
export async function submitEditRequest(member: Member, input: EditRequestInput) {
  const memberWithProfile = await prisma.member.findUniqueOrThrow({
    where: { id: member.id },
    include: { claimedPersonEntry: true },
  });
  const notionPageId = memberWithProfile.claimedPersonEntry?.notionPageId;
  if (!notionPageId) {
    throw new ApiError("FORBIDDEN", "가입 시 인증된 본인 프로필이 없어 수정할 수 없습니다.");
  }

  const baseline = await getPersonDetail(notionPageId);
  if (!baseline) throw new ApiError("NOT_FOUND", "프로필을 찾을 수 없습니다.");

  const diff = computeDiff(baseline, input);
  if (Object.keys(diff.structuredFields).length === 0 && Object.keys(diff.freeTextSections).length === 0) {
    throw new ApiError("VALIDATION_ERROR", "변경된 내용이 없습니다.");
  }

  // 재수정 = 덮어쓰기(§12.3.1): 같은 notionPageId로 pending 행이 있으면 그
  // 행의 diff/submittedAt만 갱신하고, 없으면 새로 만든다. DB의 부분 유니크
  // 인덱스(edit_requests_pending_notion_page_id_key)가 동시 요청에서도
  // 이 불변식을 보장한다.
  const existingPending = await prisma.editRequest.findFirst({
    where: { notionPageId, status: "pending" },
  });

  // Prisma의 Json 필드는 재귀적인 InputJsonValue 타입을 기대하는데, diff의
  // before/after는 의도적으로 unknown이라(어떤 속성값이든 담을 수 있어야
  // 하므로) 구조적으로 안 맞다고 판단한다 — people_cache 쓸 때와 같은 이유로
  // 캐스팅한다.
  const diffJson = diff as unknown as object;

  if (existingPending) {
    return prisma.editRequest.update({
      where: { id: existingPending.id },
      data: { diff: diffJson, submittedAt: new Date() },
    });
  }

  return prisma.editRequest.create({
    data: { notionPageId, requesterMemberId: member.id, diff: diffJson },
  });
}

// 본인이 지금까지 제출한 요청 전체(상태 무관, 최신순). 두 군데서 쓴다:
// ①프로필 상세의 "대기 중인 diff로 편집 폼 프리필"(pending 하나만 골라 씀,
// §12.3), ②내 수정 요청(`/hr/requests`) 화면의 전체 이력(§12.5).
export async function getMyEditRequests(member: Member) {
  return prisma.editRequest.findMany({
    where: { requesterMemberId: member.id },
    orderBy: { submittedAt: "desc" },
  });
}
