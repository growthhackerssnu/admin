// 엑셀에 기록돼 있던 과거 발송을 DB로 옮긴다. "과거 컨택"(연락 이력) 화면에 보이게 된다.
//
//   npx dotenv -e .env.local -- tsx scripts/dh/importPastContacts.ts                 # dry-run
//   npx dotenv -e .env.local -- tsx scripts/dh/importPastContacts.ts --apply
//   --file <경로>   기본값은 scripts/dh/data/pastContacts.json
//
// 정상 발송(send-records 라우트)이 남기는 것과 같은 모양으로 쓴다:
//   작업(sent / response_check / 결과 대기) + 결과 이벤트 + 발송 기록.
// 회차에는 속하지 않는다(acquisition_round_id = NULL). 그래서 어느 회차에서든 "이전 연락"으로 보인다.
// 다시 실행해도 같은 발송은 두 번 만들지 않는다(같은 수신 주소 + 같은 발송 시각이면 건너뜀).
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, type Prisma } from "@/generated/prisma";
import { parsePastContacts, type PastContactRecord } from "@/dh/lib/pastContacts";
import { describeDatabase, flagValue, hasFlag, runInTransaction } from "./dryRun";

type Tx = Prisma.TransactionClient;

const apply = hasFlag("--apply");
const file = path.resolve(flagValue("--file") ?? path.join(__dirname, "data", "pastContacts.json"));
const prisma = new PrismaClient();

async function findCompany(tx: Tx, record: PastContactRecord, lines: string[]) {
  const matches = await tx.company.findMany({
    where: { OR: [{ name: record.company }, { aliases: { has: record.company } }] },
    select: { id: true, name: true, permanentlyExcluded: true },
  });
  if (matches.length > 1) throw new Error(`"${record.company}"와 이름이 같은 기업이 ${matches.length}곳 있습니다. 직접 정리해 주세요.`);
  if (matches[0]) {
    if (matches[0].permanentlyExcluded) lines.push(`  ! "${record.company}"는 영구 제외된 기업입니다. 그래도 과거 기록으로는 옮깁니다.`);
    return { id: matches[0].id, created: false };
  }
  const similar = await tx.company.findMany({
    where: { name: { contains: record.company, mode: "insensitive" } },
    select: { name: true },
    take: 3,
  });
  if (similar.length) lines.push(`  ! 비슷한 이름의 기존 기업: ${similar.map((c) => c.name).join(", ")} — 같은 기업이면 중단하고 이름을 맞추세요.`);
  const created = await tx.company.create({ data: { name: record.company }, select: { id: true } });
  return { id: created.id, created: true };
}

async function importRecord(tx: Tx, record: PastContactRecord, senderId: string, quarterId: string, lines: string[]) {
  const company = await findCompany(tx, record, lines);
  const { recipient } = record;
  let endpoint = await tx.contactEndpoint.findUnique({
    where: { companyId_channel_address: { companyId: company.id, channel: recipient.channel, address: recipient.address } },
    select: { id: true, contactId: true },
  });
  let contactId = endpoint?.contactId ?? null;
  let contactCreated = false;
  if (!contactId) {
    const existing = await tx.contact.findFirst({ where: { companyId: company.id, name: recipient.name }, select: { id: true } });
    contactId =
      existing?.id ??
      (
        await tx.contact.create({
          data: { companyId: company.id, name: recipient.name, title: recipient.title || null },
          select: { id: true },
        })
      ).id;
    contactCreated = !existing;
  }
  if (!endpoint) {
    endpoint = await tx.contactEndpoint.create({
      data: {
        companyId: company.id,
        contactId,
        channel: recipient.channel,
        address: recipient.address,
        ownerType: "person",
        discoveryMethod: "user_provided",
        ownershipStatus: "supported",
        validationStatus: "valid_format",
      },
      select: { id: true, contactId: true },
    });
  }
  const label = `${record.company} → ${recipient.name}`;
  const already = await tx.sentMessage.findFirst({
    where: { recipientEndpointId: endpoint.id, sentAt: record.sentAt },
    select: { id: true },
  });
  if (already) {
    lines.push(`- ${label}: 이미 옮겨져 있어 건너뜀`);
    return false;
  }
  const outreach = await tx.outreach.create({
    data: {
      companyId: company.id,
      acquisitionRoundId: null,
      ownerId: senderId,
      currentTargetQuarterId: quarterId,
      lastSentQuarterId: quarterId,
      route: "new",
      workStage: "response_check",
      sendStatus: "sent",
      outcomeStatus: "pending",
      recipientContactId: contactId,
      recipientEndpointId: endpoint.id,
      selectedChannel: recipient.channel,
    },
    select: { id: true },
  });
  await tx.outreachOutcomeEvent.create({
    data: { outreachId: outreach.id, fromStatus: null, toStatus: "pending", source: "send_record", actorId: senderId, recordedAt: record.sentAt },
  });
  await tx.sentMessage.create({
    data: {
      outreachId: outreach.id,
      targetQuarterId: quarterId,
      channel: recipient.channel,
      recipientContactId: contactId,
      recipientEndpointId: endpoint.id,
      recipientNameSnapshot: recipient.name,
      addressSnapshot: recipient.address,
      subjectSnapshot: record.subject,
      bodySnapshot: record.body,
      sentAt: record.sentAt,
      recordedById: senderId,
      status: "sent",
    },
  });
  lines.push(
    `- ${label}: 작업·발송 기록 생성 (기업 ${company.created ? "신규" : "기존"}, 수신자 ${contactCreated ? "신규" : "기존"}, ` +
      `${record.sentAt.toISOString().slice(0, 10)}, 본문 ${record.body.length}자)`,
  );
  return true;
}

async function plan(tx: Tx, parsed: ReturnType<typeof parsePastContacts>) {
  const senders = await tx.member.findMany({
    where: { displayName: parsed.sender },
    select: { id: true, active: true, role: true },
  });
  const sender = senders[0];
  if (senders.length !== 1 || !sender) throw new Error(`발송자 "${parsed.sender}"와 이름이 같은 멤버가 ${senders.length}명입니다. 한 명이어야 합니다.`);
  if (!sender.active || sender.role === "alumni") throw new Error(`발송자 "${parsed.sender}"는 활성 멤버가 아닙니다.`);

  const quarterIds = new Map<string, string>();
  const lines: string[] = [];
  for (const { year, quarter } of parsed.records) {
    const key = `${year}-Q${quarter}`;
    if (quarterIds.has(key)) continue;
    const found = await tx.targetQuarter.findUnique({ where: { year_quarter: { year, quarter } }, select: { id: true } });
    const row = found ?? (await tx.targetQuarter.create({ data: { year, quarter }, select: { id: true } }));
    quarterIds.set(key, row.id);
    lines.push(`목표 분기 ${key}: ${found ? "기존 사용" : "새로 생성"}`);
  }
  let created = 0;
  for (const record of parsed.records)
    if (await importRecord(tx, record, sender.id, quarterIds.get(`${record.year}-Q${record.quarter}`)!, lines)) created += 1;
  return { lines, created, skipped: parsed.records.length - created };
}

async function main() {
  const parsed = parsePastContacts(JSON.parse(readFileSync(file, "utf8")));
  console.log(`DB: ${describeDatabase()}`);
  console.log(`파일: ${file} (${parsed.records.length}건, 발송자 ${parsed.sender})`);
  console.log(`모드: ${apply ? "APPLY (실제로 씀)" : "DRY-RUN (되돌림)"}\n`);
  const result = await runInTransaction(prisma, apply, (tx) => plan(tx, parsed));
  console.log(result.lines.join("\n"));
  console.log(`\n새로 옮김 ${result.created}건 · 건너뜀 ${result.skipped}건`);
  console.log(apply ? "완료: 커밋했습니다." : "DRY-RUN: 아무것도 쓰지 않았습니다. 실제로 쓰려면 --apply 를 붙이세요.");
}

main().then(() => prisma.$disconnect(), async (error) => {
  console.error(`\n중단: ${error instanceof Error ? error.message : error}`);
  await prisma.$disconnect();
  process.exit(1);
});
