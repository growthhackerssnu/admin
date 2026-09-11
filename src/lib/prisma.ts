import { PrismaClient } from "@prisma/client";

// Vercel의 서버리스 함수는 콜드 스타트마다 새 모듈 컨텍스트를 만들 수 있으므로,
// 전역에 캐싱해 커넥션 풀 재사용을 극대화한다.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
