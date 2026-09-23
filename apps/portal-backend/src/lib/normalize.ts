// 가입 신청(기수+이름)을 people_directory와 대조할 때 쓰는 정규화. Notion API
// 클라이언트는 여기서 안 쓴다 — 동기화(npm run people:import)는 apps/dh-backend
// 책임이고, 이 앱은 이미 동기화된 people_directory 테이블만 읽는다.

// 기수는 "19기" 처럼 텍스트가 섞여 들어올 수 있어 숫자만 뽑아 비교한다.
export function normalizeCohort(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits || raw.trim();
}

// 이름은 공백 차이만으로 매칭이 어긋나지 않게 공백을 모두 제거해 비교한다.
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}
