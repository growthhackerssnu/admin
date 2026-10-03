import { z } from "zod";
import type { PastProject, Prisma } from "@/generated/prisma";
import { ApiError } from "@/dh/lib/errors";

type Tx = Prisma.TransactionClient;

export const projectStatus = z.enum(["won", "in_progress", "completed"]);

const text = (max: number) => z.string().trim().max(max);

// 등록·수정에서 같이 쓰는 필드. 필수 여부는 호출하는 쪽에서 정한다.
export const projectFields = {
  title: text(300).min(1),
  year: z.number().int().min(2000).max(2100),
  quarter: z.number().int().min(1).max(4),
  status: projectStatus,
  summary: z.string().trim().max(5000).nullable(),
  ownerId: z.string().min(1).nullable(),
  contactId: z.string().min(1).nullable(),
  resultUrl: z.string().trim().url().max(2000).nullable(),
};

// 프로젝트 결과 링크는 사람이 입력한 외부 주소다. 화면에서 그대로 링크로 열 수 있으므로
// http(s)만 허용한다(javascript: 같은 스킴 차단).
export const httpUrl = (value: string | null | undefined) =>
  value === null || value === undefined || /^https?:\/\//i.test(value);

export function serializeProject(row: PastProject) {
  return {
    id: row.id,
    companyId: row.companyId,
    title: row.title,
    year: row.year,
    quarter: row.quarter,
    status: row.status,
    summary: row.summary,
    ownerId: row.ownerId,
    contactId: row.contactId,
    resultUrl: row.resultUrl,
    sourceOutreachId: row.sourceOutreachId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const projectOrderBy = [
  { year: { sort: "desc", nulls: "last" } },
  { quarter: { sort: "desc", nulls: "last" } },
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.PastProjectOrderByWithRelationInput[];

// 담당자와 관계자는 사람이 고른 값이므로 실제로 있는 활성 회원 / 같은 기업 관계자인지 확인한다.
export async function assertProjectRefs(
  tx: Tx,
  companyId: string,
  refs: { ownerId?: string | null; contactId?: string | null },
) {
  if (refs.ownerId) {
    const owner = await tx.member.findFirst({ where: { id: refs.ownerId, active: true }, select: { id: true } });
    if (!owner) throw new ApiError("VALIDATION_ERROR", "담당자를 찾지 못했습니다.", { fieldErrors: { ownerId: "없는 회원" } });
  }
  if (refs.contactId) {
    const contact = await tx.contact.findFirst({ where: { id: refs.contactId, companyId }, select: { id: true } });
    if (!contact)
      throw new ApiError("VALIDATION_ERROR", "이 기업의 관계자가 아닙니다.", { fieldErrors: { contactId: "다른 기업의 관계자" } });
  }
}

// 수주에서 이어진 프로젝트의 진행 분기는 그 수주 작업의 회차 분기와 같아야 한다.
// 회차가 연결되지 않은 과거 수주는 비교할 근거가 없어 입력값을 그대로 받는다.
export function assertQuarterMatchesSource(
  source: { acquisitionRound: { targetQuarter: { year: number; quarter: number } } | null },
  year: number,
  quarter: number,
) {
  const expected = source.acquisitionRound?.targetQuarter;
  if (expected && (expected.year !== year || expected.quarter !== quarter))
    throw new ApiError("VALIDATION_ERROR", "수주 작업의 목표 분기와 다른 진행 분기는 근거 없이 입력할 수 없습니다.", {
      details: { expectedYear: expected.year, expectedQuarter: expected.quarter },
    });
}
