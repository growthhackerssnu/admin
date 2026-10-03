// 지정한 기업과 그 기업에 딸린 모든 행(연락처·작업·발송 기록·조사 …)을 지운다.
//
//   npx dotenv -e .env.local -- tsx scripts/dh/removeCompanies.ts                 # dry-run, 기본 대상은 시드 샘플 3곳
//   npx dotenv -e .env.local -- tsx scripts/dh/removeCompanies.ts --names 가,나 --apply
//
// 딸린 행은 FK 카탈로그를 따라가며 찾는다. 테이블 목록을 손으로 적지 않아서, 나중에 테이블이
// 늘어도 빠뜨리지 않는다. 서로를 가리키는 nullable FK는 먼저 NULL로 끊고 지운다.
//
// 안전장치(모두 --apply 전에 dry-run에서도 똑같이 걸린다):
//  1. 연락처 주소가 전부 @company.example(시드 가짜 주소)가 아니면 거절한다. 실제 기록을 지우지 않게 하는
//     장치이고, 정말 지우려면 --allow-real-contacts 를 명시해야 한다.
//  2. dh 스키마 밖의 테이블 행이 딸려 나오면 거절한다(회원 계정 등 공유 테이블 보호).
//  3. 지울 행이 --max-rows(기본 300)를 넘으면 거절한다.
import { PrismaClient, type Prisma } from "@/generated/prisma";
import { describeDatabase, flagValue, hasFlag, runInTransaction } from "./dryRun";

type Tx = Prisma.TransactionClient;
type Edge = { child: string; childCol: string; nullable: boolean; parent: string; parentCol: string; cols: number };

// scripts/dh/seed.ts가 만드는 샘플 중 "과거 컨택" 화면에 보이던 기업.
const SEED_SAMPLE_NAMES = ["데일리바스켓", "모먼트핏", "워크네스트"];

const apply = hasFlag("--apply");
const allowRealContacts = hasFlag("--allow-real-contacts");
const maxRows = Number(flagValue("--max-rows") ?? 300);
const names = (flagValue("--names") ?? SEED_SAMPLE_NAMES.join(",")).split(",").map((n) => n.trim()).filter(Boolean);

const prisma = new PrismaClient();

async function loadEdges(tx: Tx) {
  const rows = await tx.$queryRawUnsafe<
    { child: string; child_col: string; nullable: boolean; parent: string; parent_col: string; cols: number }[]
  >(`
    SELECT c.conrelid::regclass::text AS child, ca.attname AS child_col, NOT ca.attnotnull AS nullable,
           c.confrelid::regclass::text AS parent, pa.attname AS parent_col, array_length(c.conkey, 1)::int AS cols
    FROM pg_constraint c
    JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
    WHERE c.contype = 'f'`);
  return rows.map<Edge>((r) => ({
    child: r.child,
    childCol: r.child_col,
    nullable: r.nullable,
    parent: r.parent,
    parentCol: r.parent_col,
    cols: r.cols,
  }));
}

async function assertTextId(tx: Tx, table: string, checked: Set<string>) {
  if (checked.has(table)) return;
  const [schema, name] = table.includes(".") ? table.replace(/"/g, "").split(".") : ["public", table.replace(/"/g, "")];
  const rows = await tx.$queryRawUnsafe<{ data_type: string }[]>(
    `SELECT data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = 'id'`,
    schema,
    name,
  );
  if (rows[0]?.data_type !== "text") throw new Error(`${table}에 text 타입 id 컬럼이 없어 안전하게 지울 수 없습니다.`);
  checked.add(table);
}

async function plan(tx: Tx) {
  const companies = await tx.company.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true, contactEndpoints: { select: { address: true } } },
  });
  const found = new Set(companies.map((c) => c.name));
  const duplicated = names.filter((n) => companies.filter((c) => c.name === n).length > 1);
  if (duplicated.length) throw new Error(`같은 이름의 기업이 둘 이상입니다: ${duplicated.join(", ")}`);
  const missing = names.filter((n) => !found.has(n));

  if (!allowRealContacts) {
    const real = companies
      .map((c) => ({ name: c.name, addresses: c.contactEndpoints.map((e) => e.address).filter((a) => !/@company\.example$/i.test(a)) }))
      .filter((c) => c.addresses.length);
    if (real.length)
      throw new Error(
        "시드 샘플이 아닌 실제 연락처가 붙어 있어 거절합니다(실제 기록일 수 있음):\n" +
          real.map((c) => `  - ${c.name}: 연락처 ${c.addresses.length}개 (예: ${c.addresses[0]})`).join("\n") +
          "\n정말 지우려면 --allow-real-contacts 를 붙이세요.",
      );
  }

  const edges = await loadEdges(tx);
  const sets = new Map<string, Set<string>>();
  const checked = new Set<string>();
  const add = (table: string, ids: string[]) => {
    const set = sets.get(table) ?? new Set<string>();
    const fresh = ids.filter((id) => !set.has(id));
    fresh.forEach((id) => set.add(id));
    sets.set(table, set);
    return fresh;
  };
  const companyIds = companies.map((c) => c.id);
  const queue: [string, string[]][] = [];
  if (companyIds.length) {
    await assertTextId(tx, "dh.companies", checked);
    queue.push(["dh.companies", add("dh.companies", companyIds)]);
  }
  while (queue.length) {
    const [table, fresh] = queue.shift()!;
    for (const edge of edges.filter((e) => e.parent === table)) {
      if (edge.cols !== 1) throw new Error(`복합 FK(${edge.child})는 지원하지 않습니다.`);
      await assertTextId(tx, edge.child, checked);
      const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "id" FROM ${edge.child} WHERE "${edge.childCol}" IN (SELECT "${edge.parentCol}" FROM ${table} WHERE "id" = ANY($1::text[]))`,
        fresh,
      );
      const next = add(edge.child, rows.map((r) => r.id));
      if (next.length) queue.push([edge.child, next]);
    }
  }

  const counts = [...sets.entries()].filter(([, s]) => s.size).map(([table, s]) => ({ table, rows: s.size }));
  const total = counts.reduce((sum, c) => sum + c.rows, 0);
  const outside = counts.filter((c) => !c.table.startsWith("dh."));
  if (outside.length) throw new Error(`dh 스키마 밖의 테이블이 딸려 나옵니다: ${outside.map((c) => c.table).join(", ")}`);
  if (total > maxRows) throw new Error(`지울 행이 ${total}개로 --max-rows(${maxRows})를 넘습니다. 대상을 확인하세요.`);

  // 1) 안쪽에서 서로를 가리키는 nullable FK를 먼저 끊는다.
  for (const e of edges) {
    const child = sets.get(e.child);
    const parent = sets.get(e.parent);
    if (e.nullable && child?.size && parent?.size)
      await tx.$executeRawUnsafe(
        `UPDATE ${e.child} SET "${e.childCol}" = NULL WHERE "id" = ANY($1::text[]) AND "${e.childCol}" IS NOT NULL`,
        [...child],
      );
  }
  // 2) 남은 NOT NULL FK 순서대로, 딸린 행이 있는 테이블부터 지운다.
  const remaining = new Map<string, Set<string>>();
  for (const { table } of counts) remaining.set(table, new Set());
  for (const e of edges) {
    if (e.nullable || !remaining.has(e.child) || !remaining.has(e.parent)) continue;
    if (e.child === e.parent) throw new Error(`${e.child}가 자기 자신을 NOT NULL로 참조해 지울 순서를 정할 수 없습니다.`);
    remaining.get(e.parent)!.add(e.child);
  }
  const deleted: { table: string; rows: number }[] = [];
  while (remaining.size) {
    const ready = [...remaining.entries()].find(([, blockers]) => blockers.size === 0)?.[0];
    if (!ready) throw new Error(`지울 순서를 정할 수 없는 순환 참조: ${[...remaining.keys()].join(", ")}`);
    const count = await tx.$executeRawUnsafe(`DELETE FROM ${ready} WHERE "id" = ANY($1::text[])`, [...sets.get(ready)!]);
    deleted.push({ table: ready, rows: count });
    remaining.delete(ready);
    remaining.forEach((blockers) => blockers.delete(ready));
  }
  return { companies: companies.map((c) => c.name), missing, counts, total, deleted };
}

async function main() {
  console.log(`DB: ${describeDatabase()}`);
  console.log(`모드: ${apply ? "APPLY (실제로 지움)" : "DRY-RUN (되돌림)"} · 대상: ${names.join(", ")}`);
  const result = await runInTransaction(prisma, apply, plan);
  console.log(`\n찾은 기업: ${result.companies.join(", ") || "(없음)"}`);
  if (result.missing.length) console.log(`DB에 없는 이름(건너뜀): ${result.missing.join(", ")}`);
  console.log("\n지우는 행 (테이블 → 행 수):");
  for (const row of result.deleted) console.log(`  ${row.table.padEnd(36)} ${row.rows}`);
  console.log(`합계 ${result.total}행`);
  console.log(apply ? "\n완료: 커밋했습니다." : "\nDRY-RUN: 아무것도 지우지 않았습니다. 실제로 지우려면 --apply 를 붙이세요.");
}

main().then(() => prisma.$disconnect(), async (error) => {
  console.error(`\n중단: ${error instanceof Error ? error.message : error}`);
  await prisma.$disconnect();
  process.exit(1);
});
