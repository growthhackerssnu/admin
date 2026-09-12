import { prisma } from "../../lib/prisma";
import { sheets, GOOGLE_SHEETS_SPREADSHEET_ID } from "../../lib/googleSheets";

const SHEET_NAME = "이력";

const HEADER = [
  "실행 생성일",
  "기업명",
  "도메인",
  "업종",
  "투자단계",
  "임직원수",
  "적합도",
  "추천 이유",
  "불확실성",
  "상태",
  "최신 결정",
  "거절 사유",
  "쿨다운 분류",
  "쿨다운 종료일",
  "결정자",
  "결정일시",
];

/** 시트에 "이력" 탭이 없으면 만든다 — 처음 백업을 돌리기 전 사람이 수동으로 탭을 만들 필요가 없게. */
async function ensureSheetExists() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === SHEET_NAME);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
  });
}

/**
 * 기업/의사결정 이력을 Google Sheets에 백업한다. 증분 append 대신 매번 전체를 지우고
 * 다시 써서 항상 DB의 현재 상태와 정확히 일치하게 유지한다 — 이 규모(수십~수백 행)에서는
 * "이미 백업한 행" 추적 로직을 따로 두는 것보다 훨씬 단순하고 안전하다.
 */
export async function exportHistoryToSheets(): Promise<{ rowCount: number }> {
  if (!GOOGLE_SHEETS_SPREADSHEET_ID) {
    console.error("[backup] GOOGLE_SHEETS_SPREADSHEET_ID가 설정되지 않아 백업을 건너뜁니다.");
    return { rowCount: 0 };
  }

  await ensureSheetExists();

  const runCompanies = await prisma.runCompany.findMany({
    include: {
      run: true,
      company: true,
      decisions: { orderBy: { decidedAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = runCompanies.map((rc) => {
    const decision = rc.decisions[0];
    return [
      rc.run.triggeredAt.toISOString(),
      rc.company.name,
      rc.company.domain,
      rc.company.industry ?? "",
      rc.company.fundingStage ?? "",
      rc.company.employeeCount?.toString() ?? "",
      rc.fitScore?.toString() ?? "",
      rc.recommendationReason ?? "",
      rc.uncertainty ?? "",
      rc.status,
      decision?.action ?? "",
      decision?.rejectionReason ?? "",
      decision?.cooldownClass ?? "",
      decision?.cooldownUntil?.toISOString() ?? "",
      decision?.decidedBy ?? "",
      decision?.decidedAt?.toISOString() ?? "",
    ];
  });

  await sheets.spreadsheets.values.clear({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:Z`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADER, ...rows] },
  });

  return { rowCount: rows.length };
}
