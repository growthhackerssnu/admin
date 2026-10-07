// 접근 권한을 부여할 사람을 미리 등록하는 스크립트. 이 행이 있어야 그 이메일로
// Google 로그인했을 때 접근이 열린다(auth.ts 참고) — 도메인이 맞아도 이 스크립트로
// 등록 안 된 사람은 403.
//
// acting/alumni는 보통 가입 신청(OTP) 흐름으로 자동 등록되지만, admin이나 예외
// 케이스는 이 스크립트로 직접 등록한다.
//
// acting으로 등록할 때는 운영팀 직책까지 같이 받는다 — 어드민 화면과 같은 규칙이다
// (acting은 직책이나 팀 하나 이상, alumni·admin은 없음). 직책(임원·팀장)은 하나까지,
// 팀원은 쉼표로 여러 팀을 줄 수 있다. 직책의 기수는 그 사람의 기수(그핵드인 명단)다.
//
// 사용법: npm run members:add -- person@ghsnu.com "표시 이름" [admin|acting|alumni] [직책,팀원,...]
//   예:   npm run members:add -- a@ghsnu.com "김지연" acting hr_lead
//         npm run members:add -- b@ghsnu.com "이도윤" acting treasurer,external_member,edu_member
//         npm run members:add -- c@ghsnu.com "박서준" acting pr_member
import { PrismaClient, type OpsRole, type Role } from "@/generated/prisma";
import { isOfficeOpsRole, opsRoleLabel, opsRoleTitle, OPS_ROLES } from "@/portal/lib/opsRoles";

const prisma = new PrismaClient();
const VALID_ROLES = ["admin", "acting", "alumni"] as const;

function isValidRole(value: string): value is Role {
  return (VALID_ROLES as readonly string[]).includes(value);
}

function isValidOpsRole(value: string): value is OpsRole {
  return (OPS_ROLES as readonly string[]).includes(value);
}

function opsRoleUsage(): string {
  return OPS_ROLES.map((r) => `${r}(${opsRoleLabel(r)})`).join(", ");
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const [email, displayName, roleArg = "acting", opsRolesArg] = process.argv.slice(2);

  if (!email || !displayName) {
    fail('사용법: npm run members:add -- person@ghsnu.com "표시 이름" [admin|acting|alumni] [직책,팀원,...]');
  }
  if (!isValidRole(roleArg)) fail(`role은 ${VALID_ROLES.join("/")} 중 하나여야 합니다.`);
  const role = roleArg;

  let opsRoles: { opsRole: OpsRole; cohort: number | null }[] = [];
  if (role === "acting") {
    if (!opsRolesArg) fail(`acting으로 등록하려면 운영팀 직책이나 팀이 필요합니다.\n  가능한 값: ${opsRoleUsage()}`);
    const names = [...new Set(opsRolesArg.split(",").map((v) => v.trim()).filter(Boolean))];
    const invalid = names.filter((v) => !isValidOpsRole(v));
    if (invalid.length > 0) fail(`운영팀 직책이 올바르지 않습니다: ${invalid.join(", ")}\n  가능한 값: ${opsRoleUsage()}`);
    const values = names as OpsRole[];
    const offices = values.filter(isOfficeOpsRole);
    if (offices.length > 1) fail("직책(임원·팀장)은 한 사람이 하나만 가질 수 있습니다. 나머지는 팀원으로 주세요.");
    // 19기는 19기 회장만 될 수 있다 — 그핵드인 명단의 기수를 쓴다. 명단에 없으면 모른다(null).
    const entry = await prisma.peopleDirectory.findFirst({ where: { claimedBy: { email } } });
    const cohort = Number(entry?.cohortNormalized) || null;
    opsRoles = values.map((opsRole) => ({ opsRole, cohort: isOfficeOpsRole(opsRole) ? cohort : null }));
  } else if (opsRolesArg) {
    fail(`운영팀 직책은 acting에게만 지정할 수 있습니다(${role}에게는 붙지 않습니다).`);
  }

  // 같은 직책·같은 기수는 한 명이다. DB의 부분 유니크 인덱스가 최종 방어선이지만,
  // 그 오류만 보면 누구와 부딪혔는지 알 수 없어서 미리 확인한다.
  for (const office of opsRoles.filter((r) => isOfficeOpsRole(r.opsRole))) {
    const holder = await prisma.memberOpsRole.findFirst({
      where: { opsRole: office.opsRole, cohort: office.cohort, member: { email: { not: email } } },
      include: { member: true },
    });
    if (holder) {
      fail(
        `${opsRoleTitle(office)} 직책은 이미 ${holder.member.displayName}(${holder.member.email}) 님이 맡고 있습니다.` +
          " 그 회원의 직책을 먼저 옮기거나 alumni로 내리세요.",
      );
    }
  }

  const member = await prisma.member.upsert({
    where: { email },
    // 옛 컬럼(ops_role)은 아무도 읽지 않는다. acting이 아니면 CHECK 제약 때문에 비운다.
    update: {
      displayName,
      role,
      active: true,
      ...(role === "acting" ? {} : { legacyOpsRole: null }),
      opsRoles: { deleteMany: {}, create: opsRoles },
    },
    create: { email, displayName, role, active: true, opsRoles: { create: opsRoles } },
  });

  const suffix = opsRoles.length > 0 ? `, ${opsRoles.map(opsRoleTitle).join("·")}` : "";
  console.log(`등록됨: ${member.email} (${member.displayName}, ${member.role}${suffix})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
