// core.people_directory의 기수/이름 정규화. 두 경로가 이 구현을 함께 쓴다.
//
//   쓰기: prisma/importPeopleDirectory.ts (노션 -> people_directory 동기화)
//   읽기: app/api/auth/signup-requests (가입 신청을 기수+이름으로 대조)
//
// 둘이 서로 다른 정규화를 쓰면 저장된 값과 조회 조건이 어긋나서 "명단에 있는
// 사람인데 가입이 안 되는" 현상이 조용히 생긴다. 그래서 한 파일에 둔다.

// 기수는 "19기" 처럼 텍스트가 섞여 들어올 수 있어 숫자만 뽑아 비교한다.
export function normalizeCohort(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits || raw.trim();
}

// 이름은 공백 차이만으로 매칭이 어긋나지 않게 공백을 모두 제거해 비교한다.
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}
