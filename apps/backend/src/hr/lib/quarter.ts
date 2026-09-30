// Notion People DB "최근 업데이트"(select) 값 — "YY-NQ" 형식(예: 26-4Q).
// 승인 시각을 한국 시간(KST) 기준 분기로 바꾼다. 서버(Railway)의 시간대가
// UTC여도 결과가 흔들리지 않도록 KST(UTC+9)를 직접 더해서 계산한다.
//   1Q: 1/1~3/31, 2Q: 4/1~6/30, 3Q: 7/1~9/30, 4Q: 10/1~12/31
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function recentUpdateLabel(at: Date): string {
  const kst = new Date(at.getTime() + KST_OFFSET_MS);
  const yy = String(kst.getUTCFullYear() % 100).padStart(2, "0");
  const quarter = Math.floor(kst.getUTCMonth() / 3) + 1;
  return `${yy}-${quarter}Q`;
}
