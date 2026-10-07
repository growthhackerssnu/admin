import { withApiHandler } from "@/portal/lib/apiHandler";
import { requireAdmin } from "@/portal/lib/auth";
import { z } from "zod";
import { ApiError, successBody } from "@/portal/lib/errors";
import { prisma } from "@/lib/prisma";
import { getNotionClient } from "@/portal/lib/notion";
import { normalizeCohort, normalizeName } from "@/portal/lib/normalize";
import { memoryDelete } from "@/hr/lib/memoryCache";
import { sortOpsRoles } from "@/portal/lib/opsRoles";

// GET /api/v1/admin/members — 회원 명단(admin 전용). 관리 화면용으로
// role·운영팀 직책·활성여부·가입일·최근 접속일·기수(있으면)까지 전부 내려준다.
//
// opsRoles는 acting에게만 있다(직책 하나까지 + 팀원 여럿, 표시 순서대로). 직책의 cohort는
// 그 직책의 운영팀 기수이고, 옛 데이터라 모르면 null이다. acting인데 빈 배열이면 아직
// 직책을 지정하지 않은 회원이다 — 화면에서 "미지정"으로 보인다.
export const GET = withApiHandler(async (req, { member, requestId }) => {
  requireAdmin(member);

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);
  const cursor = searchParams.get("cursor");

  const rows = await prisma.member.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    include: { claimedPersonEntry: { select: { cohort: true } }, opsRoles: true },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    body: successBody(
      {
        items: page.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          cohort: m.claimedPersonEntry?.cohort ?? null,
          email: m.email,
          role: m.role,
          opsRoles: sortOpsRoles(m.opsRoles).map((r) => ({ opsRole: r.opsRole, cohort: r.cohort })),
          active: m.active,
          createdAt: m.createdAt.toISOString(),
          lastLoginAt: m.lastLoginAt?.toISOString() ?? null,
        })),
        nextCursor: hasMore ? page[page.length - 1]!.id : null,
      },
      requestId,
    ),
  };
});

const newMemberSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요."),
  cohort: z.coerce.number().int().min(1, "기수를 숫자로 입력하세요."),
  email: z.string().trim().toLowerCase().email("Slack 이메일 형식이 아닙니다."),
});

// POST /api/v1/admin/members — 새 학회원(이름·기수·Slack 이메일)을 등록한다(admin 전용).
// 그핵드인 노션 People DB에 페이지를 만들고, 그 페이지로 people_directory 행과 acting 회원을 만든다.
// 운영팀 직책은 비워두고(화면에 '미지정') 관리자가 직책 지정으로 채운다.
// DB에 쓰다가 실패하면 방금 만든 노션 페이지를 보관함으로 옮겨 반쪽 등록을 남기지 않는다.
export const POST = withApiHandler(async (req, { member, requestId }) => {
  requireAdmin(member);
  const parsed = newMemberSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new ApiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");
  const { name, cohort, email } = parsed.data;
  if (await prisma.member.findUnique({ where: { email } }))
    throw new ApiError("VALIDATION_ERROR", `${email}은 이미 등록된 회원입니다.`);

  const databaseId = process.env.NOTION_PEOPLE_DATABASE_ID;
  if (!databaseId) throw new Error("NOTION_PEOPLE_DATABASE_ID가 설정되지 않았습니다.");
  const notion = getNotionClient();
  // 기수는 노션에서 선택(select) 속성이다. 없는 기수면 노션이 선택지를 새로 만든다.
  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: {
      [process.env.NOTION_NAME_PROPERTY ?? "Name"]: { title: [{ text: { content: name } }] },
      [process.env.NOTION_COHORT_PROPERTY ?? "기수"]: { select: { name: String(cohort) } },
      [process.env.NOTION_EMAIL_PROPERTY ?? "이메일"]: { email },
    },
  });

  try {
    const created = await prisma.$transaction(async (tx) => {
      const added = await tx.member.create({ data: { email, displayName: name, role: "acting" } });
      await tx.peopleDirectory.create({
        data: {
          notionPageId: page.id,
          cohort: String(cohort),
          cohortNormalized: normalizeCohort(String(cohort)),
          name,
          nameNormalized: normalizeName(name),
          knownEmail: email,
          claimedByMemberId: added.id,
          claimedAt: new Date(),
        },
      });
      return added;
    });
    // 그핵드인 목록 캐시를 비워서 새 사람이 바로 보이게 한다(다른 서버 인스턴스는 5분 안에 갱신).
    memoryDelete("list");
    await prisma.peopleCache.deleteMany({ where: { key: "list" } });
    return {
      status: 201,
      body: successBody({ id: created.id, notionPageId: page.id }, requestId),
    };
  } catch (error) {
    await notion.pages.update({ page_id: page.id, archived: true }).catch(() => undefined);
    throw error;
  }
});
