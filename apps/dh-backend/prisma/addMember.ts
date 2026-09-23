// 접근 권한을 부여할 사람을 미리 등록하는 스크립트. 이 행이 있어야 그 이메일로
// Google 로그인했을 때 접근이 열린다(auth.ts 참고) — 도메인이 맞아도 이 스크립트로
// 등록 안 된 사람은 403.
//
// acting/alumni는 보통 가입 신청(OTP) 흐름으로 자동 등록되지만, admin이나 예외
// 케이스는 이 스크립트로 직접 등록한다.
//
// 사용법: npm run members:add -- person@ghsnu.com "표시 이름" [admin|acting|alumni]
import { PrismaClient, type Role } from "../src/generated/prisma";

const prisma = new PrismaClient();
const VALID_ROLES = ["admin", "acting", "alumni"] as const;

function isValidRole(value: string): value is Role {
  return (VALID_ROLES as readonly string[]).includes(value);
}

async function main() {
  const [email, displayName, roleArg = "acting"] = process.argv.slice(2);

  if (!email || !displayName) {
    console.error('사용법: npm run members:add -- person@ghsnu.com "표시 이름" [admin|acting|alumni]');
    process.exit(1);
  }
  if (!isValidRole(roleArg)) {
    console.error(`role은 ${VALID_ROLES.join("/")} 중 하나여야 합니다.`);
    process.exit(1);
  }
  const role = roleArg;

  const member = await prisma.member.upsert({
    where: { email },
    update: { displayName, role, active: true },
    create: { email, displayName, role, active: true },
  });

  console.log(`등록됨: ${member.email} (${member.displayName}, ${member.role})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
