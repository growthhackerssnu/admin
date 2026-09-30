// 알럼나이 셀프 편집 제출 처리(ARCHITECTURE.md §5, §12.3, §12.3.1).
//
// before는 항상 "지금 캐시/Notion에 있는 값"이다 — 프런트가 보낸 값을 그대로
// 믿지 않고 서버가 직접 계산한다(클라이언트 조작 방지 + before/after가 실제
// Notion 값과 항상 맞게 하려는 목적).
import type { Member } from "@/generated/prisma";
import { z } from "zod";
import { ApiError } from "./errors";
import { prisma } from "@/lib/prisma";
import { canonicalizeOptionValues, getFieldOptions, optionKey } from "./fieldOptions";
import { getPersonDetail, type PersonDetail } from "./peopleCache";

// 본인이 직접 입력해서 만들 수 있는 옵션(직무 계열·학과)의 이름 규칙. Notion
// 옵션 이름은 쉼표를 못 쓰고(multi_select 값 구분자), 길이는 100자까지다.
const OptionName = z
  .string()
  .trim()
  .min(1)
  .max(100, "100자 이하로 입력하세요.")
  .refine((v) => !v.includes(","), { message: "쉼표(,)는 사용할 수 없습니다." });

export const EditRequestInput = z.object({
  email: z.string().trim().nullable(),
  linkedin: z.string().trim().nullable(),
  currentCareerOneLine: z.string().trim().nullable(),
  cohort: z.number().int(),
  // 직무 계열은 2026-09-30에 다중 선택으로 바뀌었다. 배포 시점 차이로 옛 프론트가
  // 단일 값(문자열/null)을 보내도 받아준다.
  jobField: z.union([
    z.array(OptionName).max(20),
    z
      .string()
      .trim()
      .nullable()
      .transform((v) => (v ? [v] : [])),
  ]),
  department: z.array(OptionName).max(20),
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

// z.union의 transform 때문에 zod 출력 타입에선 jobField가 string[]로 좁혀지지만,
// computeDiff 이후 로직은 정규화된 값만 다루므로 아래 타입을 쓴다.
type NormalizedInput = Omit<EditRequestInput, "jobField"> & { jobField: string[] };

function computeDiff(baseline: PersonDetail, input: NormalizedInput): EditDiff {
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
  addArrayIfChanged(structuredFields, "직무 계열", baseline.jobField, input.jobField);
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

  // 직무 계열·학과는 본인이 새 옵션을 만들 수 있다(공백·대소문자만 다른 값은 기존
  // 옵션으로 합친다). 소속팀·기수는 기존 옵션만 허용한다 — 승인 시 Notion이 없는
  // 옵션 이름을 자동 생성하기 때문에, 여기서 안 막으면 API로 직접 보내 옵션을
  // 오염시킬 수 있다.
  const options = await getFieldOptions();
  const jobField = canonicalizeOptionValues(input.jobField as string[], options.jobField).values;
  const department = canonicalizeOptionValues(input.department, options.department).values;
  const teamKeys = new Map(options.team.map((name) => [optionKey(name), name]));
  const team = input.team.map((name) => teamKeys.get(optionKey(name)));
  if (team.some((name) => !name)) {
    throw new ApiError("VALIDATION_ERROR", "소속팀은 기존 목록에서만 선택할 수 있습니다.");
  }
  if (!options.cohort.includes(input.cohort)) {
    throw new ApiError("VALIDATION_ERROR", "존재하지 않는 기수입니다.");
  }

  const diff = computeDiff(baseline, {
    ...input,
    jobField,
    department,
    team: team as string[],
  });
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

// 승인 큐(§12.4)용 전체 목록. 요청자 이름·기수는 Notion을 다시 안 부르고
// core.people_directory에서 바로 가져온다(가입 시 이미 동기화돼 있는 값,
// Member.claimedPersonEntry 관계) — 목록 화면에서 Notion 호출까지 필요 없다.
export async function getAllEditRequests() {
  const rows = await prisma.editRequest.findMany({
    orderBy: { submittedAt: "desc" },
    include: { requester: { include: { claimedPersonEntry: true } } },
  });

  // 대기 중 요청이 "Notion에 없는 새 옵션"을 담고 있으면 승인 화면에서 표시한다
  // (오타·중복 옵션이 그대로 만들어지는 걸 admin이 거를 수 있게). Notion 조회가
  // 실패해도 목록 자체는 보여준다.
  let options: Awaited<ReturnType<typeof getFieldOptions>> | null = null;
  if (rows.some((r) => r.status === "pending")) {
    options = await getFieldOptions().catch(() => null);
  }

  return rows.map((row) => ({
    ...row,
    requesterName: row.requester.claimedPersonEntry?.name ?? row.requester.displayName,
    requesterCohort: row.requester.claimedPersonEntry?.cohort ?? null,
    newOptions: row.status === "pending" && options ? findNewOptions(row.diff, options) : {},
  }));
}

function findNewOptions(
  diff: unknown,
  options: { jobField: string[]; department: string[] },
): Record<string, string[]> {
  const structured = (diff as { structuredFields?: Record<string, { after?: unknown }> }).structuredFields ?? {};
  const result: Record<string, string[]> = {};
  const check = (label: string, existing: string[]) => {
    const after = structured[label]?.after;
    if (!Array.isArray(after)) return;
    const known = new Set(existing.map(optionKey));
    const fresh = after.filter((v): v is string => typeof v === "string" && !known.has(optionKey(v)));
    if (fresh.length > 0) result[label] = fresh;
  };
  check("직무 계열", options.jobField);
  check("학과", options.department);
  return result;
}
