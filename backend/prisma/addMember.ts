// 접근 권한을 부여할 사람을 미리 등록하는 스크립트. 이 행이 있어야 그 이메일로
// Google 로그인했을 때 접근이 열린다(auth.ts 참고) — 도메인이 맞아도 이 스크립트로
// 등록 안 된 사람은 403.
//
// 사용법: npm run members:add -- person@ghsnu.com "표시 이름" [pm|member]
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [email, displayName, role = "member"] = process.argv.slice(2);

  if (!email || !displayName) {
    console.error('사용법: npm run members:add -- person@ghsnu.com "표시 이름" [pm|member]');
    process.exit(1);
  }
  if (role !== "pm" && role !== "member") {
    console.error('role은 "pm" 또는 "member"만 가능합니다.');
    process.exit(1);
  }

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
