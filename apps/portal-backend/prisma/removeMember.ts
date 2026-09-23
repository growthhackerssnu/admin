// 접근 권한을 회수하는 스크립트. 행을 지우지 않고 active=false로만 바꾼다 —
// 이 사람이 owner/checkedBy 등으로 남긴 기록(FK)이 있어서 삭제하면 안 된다.
//
// 사용법: npm run members:remove -- person@ghsnu.com
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const [email] = process.argv.slice(2);
  if (!email) {
    console.error("사용법: npm run members:remove -- person@ghsnu.com");
    process.exit(1);
  }

  const member = await prisma.member.update({ where: { email }, data: { active: false } });
  console.log(`비활성화됨: ${member.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
