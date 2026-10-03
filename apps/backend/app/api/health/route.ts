import { prisma } from "@/lib/prisma";

// 인증 없는 헬스체크. 주기적으로 두드려서 DB 커넥션을 유휴 상태로 끊기지
// 않게 유지한다 — 한동안 요청이 없다가 처음 들어온 요청이 커넥션을 새로
// 맺느라 몇 초씩 걸리는 문제(콜드 스타트)를 막기 위한 용도다.
export async function GET() {
  await prisma.$queryRaw`SELECT 1`;
  return new Response("ok");
}
