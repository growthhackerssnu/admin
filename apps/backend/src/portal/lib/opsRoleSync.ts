// 운영팀 직책 양방향 동기화: 노션 People DB "직책"·"소속팀" ↔ core.member_ops_roles.
//
// 어느 쪽이 바뀌었는지는 people_directory.notion_ops_roles(마지막으로 맞춘 노션 값)로 가른다.
//   - 노션 값이 기준값과 다르다 → 노션에서 바꾼 것이다. 어드민에 반영한다.
//   - 노션 값은 그대로인데 어드민이 다르다 → 어드민에서 바꿨는데 노션에 못 쓴 것이다. 노션에 쓴다.
// 어드민에서 바꾸면 그 자리에서 노션에도 쓰고(pushOpsRolesToNotion) 기준값을 맞춘다. 그게
// 실패해도 다음 주기 동기화가 다시 쓴다 — 노션 쪽 옛 값으로 되돌리지 않는다.
//
// 대상은 acting 회원뿐이다. 노션의 직책·소속팀은 알럼나이에게도 이력으로 남아 있어서, alumni로
// 내려도 노션은 지우지 않고, alumni의 노션 값을 어드민 직책으로 옮기지도 않는다. role은 바꾸지 않는다.
//
// 기준값이 없는 행(처음 도는 행, ops_roles_synced_at NULL)은 노션의 지금 값을 기준값으로 삼는다 —
// 즉 처음엔 어드민 쪽이 이긴다(지금까지 권한의 원본이 어드민이었다). 미리 보려면
// `npm run members:sync -w apps/backend -- --dry-run`.
import type { OpsRole } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { callNotionRateLimited, extractMultiSelect, extractPropertyText, getNotionClient } from "@/hr/lib/notion";
import {
  NOTION_POSITION_PROPERTY,
  NOTION_TEAM_PROPERTY,
  opsRolesFromNotion,
  opsRolesToNotion,
  sameOpsRoles,
} from "@/portal/lib/notionOpsRoles";
import { isOfficeOpsRole, opsRoleLabel, sortOpsRoles } from "@/portal/lib/opsRoles";

export type NotionOpsValues = { notionPageId: string; position: string | null; teams: string[] };

export function notionOpsValues(notionPageId: string, props: Record<string, unknown>): NotionOpsValues {
  return {
    notionPageId,
    position: extractPropertyText(props[NOTION_POSITION_PROPERTY]),
    teams: extractMultiSelect(props[NOTION_TEAM_PROPERTY]),
  };
}

const label = (name: string, cohort: string) => `${cohort}기 ${name}`;
const rolesText = (roles: readonly OpsRole[]) =>
  roles.length > 0 ? sortOpsRoles(roles.map((opsRole) => ({ opsRole }))).map((r) => opsRoleLabel(r.opsRole)).join("·") : "없음";
// "19기 홍길동: 노션 회장·PR 팀원 / 어드민 회장" — 결과 목록에 무엇이 다른지 함께 남긴다.
const diffText = (who: string, notion: readonly OpsRole[], admin: readonly OpsRole[]) =>
  `${who}: 노션 ${rolesText(notion)} / 어드민 ${rolesText(admin)}`;

// 어드민의 직책을 노션에 쓴다. 역할 변경 API가 저장한 직후 부른다. 실패는 모아서 돌려주고
// 던지지 않는다(다음 주기 동기화가 다시 쓴다).
export async function pushOpsRolesToNotion(memberIds: string[]): Promise<{ pushed: string[]; failed: string[] }> {
  const rows = await prisma.peopleDirectory.findMany({
    where: { claimedByMemberId: { in: memberIds }, claimedBy: { role: "acting" } },
    include: { claimedBy: { include: { opsRoles: true } } },
  });
  const pushed: string[] = [];
  const failed: string[] = [];
  for (const row of rows) {
    const roles = sortOpsRoles(row.claimedBy!.opsRoles).map((r) => r.opsRole);
    try {
      await writeNotion(row.notionPageId, roles);
      await prisma.peopleDirectory.update({
        where: { id: row.id },
        data: { notionOpsRoles: roles, opsRolesSyncedAt: new Date() },
      });
      pushed.push(label(row.name, row.cohort));
    } catch (error) {
      console.error(`[ops-role-sync] notion write failed: ${row.notionPageId}`, error);
      failed.push(label(row.name, row.cohort));
    }
  }
  return { pushed, failed };
}

async function writeNotion(notionPageId: string, roles: OpsRole[]) {
  const notion = getNotionClient();
  // 소속팀의 짝 없는 값(NUT 등)을 남기려면 지금 값을 먼저 읽어야 한다.
  const page = (await callNotionRateLimited(() => notion.pages.retrieve({ page_id: notionPageId }))) as unknown as {
    properties: Record<string, unknown>;
  };
  const current = notionOpsValues(notionPageId, page.properties);
  const next = opsRolesToNotion(roles, current.teams);
  if (next.position === current.position && next.teams.join() === current.teams.join()) return;
  await callNotionRateLimited(() =>
    notion.pages.update({
      page_id: notionPageId,
      properties: {
        [NOTION_POSITION_PROPERTY]: { select: next.position ? { name: next.position } : null },
        [NOTION_TEAM_PROPERTY]: { multi_select: next.teams.map((name) => ({ name })) },
      },
    }),
  );
}

export type OpsRoleSyncResult = {
  // 노션에서 바뀌어 어드민에 반영한 회원
  fromNotion: string[];
  // 어드민에서 바뀌어 노션에 쓴 회원
  toNotion: string[];
  // 반영하지 못한 회원과 이유(같은 기수의 같은 직책을 이미 다른 회원이 맡고 있는 경우 등)
  failed: string[];
};

// 노션 People DB 전체를 읽은 값(syncPeopleDirectory가 함께 돌려준다)으로 양쪽을 맞춘다.
export async function syncOpsRoles(pages: NotionOpsValues[], { dryRun = false } = {}): Promise<OpsRoleSyncResult> {
  const byPageId = new Map(pages.map((p) => [p.notionPageId, p]));
  const rows = await prisma.peopleDirectory.findMany({
    where: { notionPageId: { in: [...byPageId.keys()] } },
    include: { claimedBy: { include: { opsRoles: true } } },
  });

  const result: OpsRoleSyncResult = { fromNotion: [], toNotion: [], failed: [] };
  const toPush: string[] = [];

  for (const row of rows) {
    const page = byPageId.get(row.notionPageId)!;
    const notionRoles = opsRolesFromNotion(page.position, page.teams);
    const baseline = row.opsRolesSyncedAt ? row.notionOpsRoles : notionRoles;
    const member = row.claimedBy;
    const who = label(row.name, row.cohort);

    if (member?.role !== "acting") {
      // 알럼나이 등은 기준값만 따라간다(나중에 acting이 되면 그때부터 비교한다).
      if (!dryRun && (!row.opsRolesSyncedAt || !sameOpsRoles(row.notionOpsRoles, notionRoles))) {
        await prisma.peopleDirectory.update({
          where: { id: row.id },
          data: { notionOpsRoles: notionRoles, opsRolesSyncedAt: new Date() },
        });
      }
      continue;
    }

    const adminRoles = member.opsRoles.map((r) => r.opsRole);
    if (!sameOpsRoles(notionRoles, baseline)) {
      if (!sameOpsRoles(adminRoles, notionRoles)) {
        if (dryRun) {
          result.fromNotion.push(diffText(who, notionRoles, adminRoles));
          continue;
        }
        try {
          await applyToMember(member.id, notionRoles, Number(row.cohortNormalized) || null);
          result.fromNotion.push(diffText(who, notionRoles, adminRoles));
        } catch (error) {
          // 기준값을 그대로 둬서 다음 주기에 다시 시도한다(노션 쪽으로 되쓰지 않게).
          console.error(`[ops-role-sync] apply failed: ${who}`, error);
          result.failed.push(`${who}: ${(error as Error).message}`);
          continue;
        }
      }
      if (!dryRun) {
        await prisma.peopleDirectory.update({
          where: { id: row.id },
          data: { notionOpsRoles: notionRoles, opsRolesSyncedAt: new Date() },
        });
      }
    } else if (!sameOpsRoles(adminRoles, notionRoles)) {
      if (dryRun) result.toNotion.push(diffText(who, notionRoles, adminRoles));
      else toPush.push(member.id);
    } else if (!row.opsRolesSyncedAt && !dryRun) {
      await prisma.peopleDirectory.update({
        where: { id: row.id },
        data: { notionOpsRoles: notionRoles, opsRolesSyncedAt: new Date() },
      });
    }
  }

  if (toPush.length > 0) {
    const { pushed, failed } = await pushOpsRolesToNotion(toPush);
    result.toNotion.push(...pushed);
    result.failed.push(...failed.map((who) => `${who}: 노션 쓰기 실패`));
  }
  return result;
}

// 직책의 기수는 그 사람의 기수다(역할 변경 API와 같은 규칙). 같은 기수의 같은 직책을 다른
// 회원이 이미 맡고 있으면 DB 부분 유니크 인덱스(member_ops_roles_office_*_key)에서 걸려 통째로 실패한다.
async function applyToMember(memberId: string, roles: OpsRole[], cohort: number | null) {
  await prisma.$transaction(async (tx) => {
    for (const opsRole of roles.filter(isOfficeOpsRole)) {
      const holder = await tx.memberOpsRole.findFirst({
        where: { opsRole, cohort, memberId: { not: memberId } },
        include: { member: true },
      });
      if (holder) throw new Error(`${opsRole} 직책을 이미 ${holder.member.displayName} 님이 맡고 있습니다.`);
    }
    await tx.memberOpsRole.deleteMany({ where: { memberId } });
    await tx.memberOpsRole.createMany({
      data: roles.map((opsRole) => ({ memberId, opsRole, cohort: isOfficeOpsRole(opsRole) ? cohort : null })),
    });
  });
}
