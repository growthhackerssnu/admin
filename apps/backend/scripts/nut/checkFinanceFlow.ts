// NUT 재무 흐름 점검: 청구서 지급→회계 기록, 지급 취소, 거래 수정, 팀 지원비, 변수 재계산, 새 반기 복사.
// 테스트 데이터를 쓰고 2027-1h 반기를 만든다 → 로컬 DB에서만 돌린다(운영 DB 접속은 거부).
//
// 사용법(로컬 Postgres에 운영 nut·core 스키마를 복사한 뒤):
//   DATABASE_URL=postgresql://...@localhost/... npx tsx scripts/nut/checkFinanceFlow.ts /tmp/overview.json
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "")) {
  console.error("로컬 DB(DATABASE_URL이 localhost)에서만 실행합니다.");
  process.exit(1);
}
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import * as r from "@/nut/lib/financeRepository";
import { prisma } from "@/lib/prisma";
const viewer = { memberId: "nobody", canEdit: true };
(async () => {
  const p = await r.resolvePeriodId(null);
  let o = await r.getFinanceOverview(p, viewer);
  console.log("period", p, "cash", o.currentCash, "ledger", o.ledger.length, "last balance", o.ledger.at(-1)?.balance);
  const base = o.currentCash; assert.equal(o.ledger.at(-1)!.balance, base, "running balance ends at current cash");
  const slack = o.budgetTree.find(n => n.name === "Slack")!; const spent0 = slack.actual;
  const major0 = o.budgetTree.find(n => n.id === o.budgetTree.find(x => x.id === slack.parentId)!.parentId)!;
  // claim -> pay -> ledger + spent
  await r.createClaim(p, { memberId: "m1", claimant: "테스트", date: "2026-10-01", detail: "e2e 청구", amount: 12345, bucket: "미분류", bankAccount: "토스 1", prepaid: true, source: "NUT" });
  o = await r.getFinanceOverview(p, { memberId: "m2", canEdit: false });
  const c = o.claims.find(x => x.detail === "e2e 청구")!; assert.equal(c.bankAccount, undefined, "account hidden from others");
  await assert.rejects(r.actOnClaim(c.id, { type: "pay", date: "2026-10-02" }, "rev"), /예산 항목/);
  await r.actOnClaim(c.id, { type: "pay", date: "2026-10-02", bucket: "Slack" }, "rev");
  o = await r.getFinanceOverview(p, viewer);
  const paid = o.claims.find(x => x.id === c.id)!; assert.equal(paid.status, "paid"); assert.ok(paid.ledgerEntryId);
  assert.equal(o.budgetTree.find(n => n.name === "Slack")!.actual, spent0 + 12345, "leaf spent from ledger");
  assert.equal(o.budgetTree.find(n => n.id === major0.id)!.actual, major0.actual + 12345, "rollup");
  assert.equal(o.currentCash, base - 12345);
  const le = o.ledger.find(e => e.id === paid.ledgerEntryId)!; assert.equal(le.claimId, c.id);
  // edit amount, then delete -> claim back to approved
  await r.updateLedgerEntry(le.id, { amount: 10000 });
  o = await r.getFinanceOverview(p, viewer); assert.equal(o.currentCash, base - 10000);
  await r.deleteLedgerEntry(le.id);
  o = await r.getFinanceOverview(p, viewer);
  assert.equal(o.claims.find(x => x.id === c.id)!.status, "approved"); assert.equal(o.currentCash, base);
  await assert.rejects(r.actOnClaim(c.id, { type: "approve" }, "rev"), /검토 중/);
  await r.actOnClaim(c.id, { type: "reject", reason: "테스트" }, "rev");
  await r.actOnClaim(c.id, { type: "reopen" }, "rev");
  // team tagging: 팀지원비 거래를 팀에 연결하면 팀별 지원비에 바로 잡힌다
  const theta = o.accountingSummaries.find((t) => t.name === "세타원")!;
  await r.createLedgerEntry(p, { date: "2026-10-03", type: "expense", bucket: "26-S 방학 프로젝트 팀 지원비", detail: "e2e 다과", amount: 1000, taxClass: "tax_deductible_expense", teamId: theta.id });
  o = await r.getFinanceOverview(p, viewer);
  assert.equal(o.accountingSummaries.find((t) => t.id === theta.id)!.supportSpent, theta.supportSpent + 1000, "tagged ledger row counts for the team");
  const tagged = o.ledger.find((e) => e.detail === "e2e 다과")!;
  await assert.rejects(r.updateLedgerEntry(tagged.id, { teamId: "accounting-nope" }), /같은 반기/);
  await r.deleteLedgerEntry(tagged.id);
  // parameter recompute
  const before = o.budgetTree.find(n => n.formulaExpression?.includes("cohort-junior"))!;
  await r.updateBudgetParameter(p, "hr-junior", { value: 6 });
  o = await r.getFinanceOverview(p, viewer);
  console.log("slack budget", before.budget, "->", o.budgetTree.find(n => n.id === before.id)!.budget);
  await r.updateBudgetParameter(p, "hr-junior", { value: 5 });
  // new period
  await r.createPeriod({ id: "2027-1h", label: "2027 상반기", start: "2027-01-01", end: "2027-06-30", copyFromId: p });
  const n = await r.getFinanceOverview("2027-1h", viewer);
  assert.equal(n.openingCash, base); assert.equal(n.ledger.length, 0); assert.equal(n.budgetTree.length, o.budgetTree.length);
  assert.ok(n.budgetTree.every(x => x.actual === 0)); assert.equal(n.parameters.length, o.parameters.length);
  assert.equal(n.periods.length, 2); assert.equal(n.accountingSummaries.filter(s => s.scope === "team").length, 5);
  assert.equal(n.period.operatingCohort, o.period.operatingCohort + 1, "next period is the next cohort");
  assert.ok(n.budgetTree.some(x => x.name.includes(`${o.period.operatingCohort + 1}기`)), "cohort numbers in item names advance");
  // rename node keeps ledger link
  const slackNew = n.budgetTree.find(x => x.name === "Slack")!;
  await r.createLedgerEntry("2027-1h", { date: "2027-01-05", type: "expense", bucket: "Slack", detail: "1월 슬랙", amount: 5000, taxClass: "tax_deductible_expense" });
  await r.updateBudgetNode(slackNew.id, { name: "Slack 구독" });
  const n2 = await r.getFinanceOverview("2027-1h", viewer);
  assert.equal(n2.budgetTree.find(x => x.id === slackNew.id)!.actual, 5000, "rename keeps spent");
  assert.equal((await r.getFinanceOverview(p, viewer)).budgetTree.find(x => x.name === "Slack")!.actual, spent0, "other period untouched");
  writeFileSync(process.argv[2]!, JSON.stringify(await r.getFinanceOverview(p, viewer)));
  console.log("ALL FLOW CHECKS PASSED");
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
