/**
 * 스타트업레시피 투자정보 커넥터 베타 확인용 CLI.
 *
 * DB나 Claude를 전혀 건드리지 않고, 파서가 실제로 무엇을 가져오는지만 눈으로 확인한다.
 * prescore 기준(어떤 단계·분야·투자금 구간을 남길지)을 실제 분포를 보고 정하기 위한 용도다.
 *
 *   npm run dev:invest          # 최근 3개월
 *   npm run dev:invest -- 6     # 최근 6개월
 */
import { writeFileSync } from "node:fs";
import { collectRecentInvestRounds, type InvestRound } from "../modules/sourcing/investRounds";
import { normalizeStage } from "../modules/sourcing/investStage";
import { prescoreRounds } from "../modules/sourcing/prescore";

// 현재 WorkflowConfig의 fundingStage("Seed~Series A")에 해당하는 표기.
const EARLY_STAGES = ["프리시드", "시드", "프리시리즈A", "시리즈A"];

function countBy<T>(items: T[], key: (item: T) => string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function printTable(title: string, rows: Array<[string, number]>, limit = 20) {
  console.log(`\n## ${title}`);
  for (const [label, count] of rows.slice(0, limit)) {
    console.log(`  ${String(count).padStart(4)}  ${label || "(비어 있음)"}`);
  }
  if (rows.length > limit) console.log(`  ... 외 ${rows.length - limit}종`);
}

function formatRound(r: InvestRound): string {
  const date = r.announcedAt.toISOString().slice(0, 10);
  const amount = r.amountMillionKrw === null ? r.amountText : `${r.amountMillionKrw}백만원`;
  const investors = r.investors.length > 0 ? r.investors.slice(0, 3).join(", ") : "-";
  return `${date} | ${r.companyName} | ${r.stage} | ${amount} | ${r.sector ?? "-"} | ${investors}`;
}

async function main() {
  const monthCount = Number(process.argv[2] ?? 3);
  console.log(`최근 ${monthCount}개월 수집 중...`);

  const started = Date.now();
  const rounds = await collectRecentInvestRounds(monthCount);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n총 ${rounds.length}건 (기업명 기준 중복 제거 후), ${elapsed}초`);

  printTable("투자 단계 분포", countBy(rounds, (r) => r.stage));
  printTable("분야 분포 (상위)", countBy(rounds, (r) => r.sector ?? ""), 15);

  const early = rounds.filter((r) => EARLY_STAGES.includes(r.stage));
  console.log(`\n## 현재 조건(Seed~Series A) 통과: ${early.length}건 / ${rounds.length}건`);
  for (const r of early.slice(0, 25)) console.log(`  ${formatRound(r)}`);
  if (early.length > 25) console.log(`  ... 외 ${early.length - 25}건`);

  const withAmount = rounds.filter((r) => r.amountMillionKrw !== null);
  console.log(
    `\n## 투자금 파싱: ${withAmount.length}건 성공 / ${rounds.length}건 ` +
      `(비공개 등 ${rounds.length - withAmount.length}건은 null)`,
  );

  const noSector = rounds.filter((r) => !r.sector).length;
  const noInvestors = rounds.filter((r) => r.investors.length === 0).length;
  console.log(`## 분야 누락: ${noSector}건 / 투자사 누락: ${noInvestors}건`);

  const normalized = countBy(rounds, (r) => normalizeStage(r.stage, r.investors).canonical);
  printTable("정규화된 단계 분포", normalized);

  const top = prescoreRounds(rounds, { limit: 20 });
  const allEarly = prescoreRounds(rounds);
  console.log(`
## prescore: 초기단계 ${allEarly.length}건 → 상위 20건`);
  for (const [i, c] of top.entries()) {
    console.log(
      `  ${String(i + 1).padStart(2)}. [${c.score.toFixed(3)}] ${c.round.companyName} | ${c.round.sector}`,
    );
    console.log(`      ${c.reasons.join(" / ")}`);
  }

  const cut = allEarly[19]?.score ?? 0;
  console.log(`
## 컷오프 점수(20위): ${cut.toFixed(3)}`);
  console.log(`## 상위 20건 중 팁스: ${top.filter((c) => c.stage.isTips).length}건`);

  const outPath = process.env.DUMP_PATH ?? "invest-rounds.json";
  writeFileSync(outPath, JSON.stringify(rounds, null, 2), "utf-8");
  console.log(`\n전체 결과를 ${outPath}에 저장했다.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
