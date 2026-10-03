import type { Prisma, PrismaClient } from "@/generated/prisma";

// 데이터를 바꾸는 스크립트 공통 규칙: 기본은 dry-run이다. 같은 코드를 트랜잭션 안에서
// 끝까지 실행해 결과를 보여 준 다음 되돌린다. --apply를 붙여야 커밋한다.
class DryRun<T> extends Error {
  constructor(readonly result: T) {
    super("dry-run");
  }
}

export async function runInTransaction<T>(
  prisma: PrismaClient,
  apply: boolean,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const result = await work(tx);
        if (!apply) throw new DryRun(result);
        return result;
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  } catch (error) {
    if (error instanceof DryRun) return error.result as T;
    throw error;
  }
}

// 어느 DB에 쓰려는지 눈으로 확인하게 호스트만 보여 준다(비밀번호는 출력하지 않는다).
export function describeDatabase() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return `${url.host}${url.pathname}`;
  } catch {
    return "(DATABASE_URL을 읽지 못함)";
  }
}

export function hasFlag(name: string) {
  return process.argv.includes(name);
}

export function flagValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
