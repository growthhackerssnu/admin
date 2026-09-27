// 접근 권한을 부여할 사람을 미리 등록하는 스크립트. 이 행이 있어야 그 이메일로
// Google 로그인했을 때 접근이 열린다(auth.ts 참고) — 도메인이 맞아도 이 스크립트로
// 등록 안 된 사람은 403.
//
// acting/alumni는 보통 가입 신청(OTP) 흐름으로 자동 등록되지만, admin이나 예외
// 케이스는 이 스크립트로 직접 등록한다.
//
// acting으로 등록할 때는 운영팀 직책까지 같이 받는다 — 어드민 화면과 같은 규칙이다
// (acting은 직책 필수, alumni·admin은 직책 없음).
//
// 사용법: npm run members:add -- person@ghsnu.com "표시 이름" [admin|acting|alumni] [운영팀직책]
//   예:   npm run members:add -- a@ghsnu.com "김지연" acting hr_lead
import { PrismaClient, type OpsRole, type Role } from "../src/generated/prisma";
import { isSingletonOpsRole, opsRoleLabel, OPS_ROLES } from "../src/lib/opsRoles";

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

async function main() {
  const [email, displayName, roleArg = "acting", opsRoleArg] = process.argv.slice(2);

  if (!email || !displayName) {
    console.error(
      '사용법: npm run members:add -- person@ghsnu.com "표시 이름" [admin|acting|alumni] [운영팀직책]',
    );
    process.exit(1);
  }
  if (!isValidRole(roleArg)) {
    console.error(`role은 ${VALID_ROLES.join("/")} 중 하나여야 합니다.`);
    process.exit(1);
  }
  const role = roleArg;

  let opsRole: OpsRole | null = null;
  if (role === "acting") {
    if (!opsRoleArg) {
      console.error(`acting으로 등록하려면 운영팀 직책이 필요합니다.\n  가능한 값: ${opsRoleUsage()}`);
      process.exit(1);
    }
    if (!isValidOpsRole(opsRoleArg)) {
      console.error(`운영팀 직책이 올바르지 않습니다.\n  가능한 값: ${opsRoleUsage()}`);
      process.exit(1);
    }
    opsRole = opsRoleArg;
  } else if (opsRoleArg) {
    console.error(`운영팀 직책은 acting에게만 지정할 수 있습니다(${role}에게는 붙지 않습니다).`);
    process.exit(1);
  }

  // 회장·부회장·총무·각 팀장은 한 명씩이다. DB의 부분 유니크 인덱스가 최종
  // 방어선이지만, 그 오류만 보면 누구와 부딪혔는지 알 수 없어서 미리 확인한다.
  if (opsRole && isSingletonOpsRole(opsRole)) {
    const holder = await prisma.member.findFirst({ where: { opsRole, email: { not: email } } });
    if (holder) {
      console.error(
        `${opsRoleLabel(opsRole)} 직책은 이미 ${holder.displayName}(${holder.email}) 님이 맡고 있습니다.` +
          " 그 회원의 직책을 먼저 옮기거나 alumni로 내리세요.",
      );
      process.exit(1);
    }
  }

  const member = await prisma.member.upsert({
    where: { email },
    update: { displayName, role, opsRole, active: true },
    create: { email, displayName, role, opsRole, active: true },
  });

  const suffix = member.opsRole ? `, ${opsRoleLabel(member.opsRole)}` : "";
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
