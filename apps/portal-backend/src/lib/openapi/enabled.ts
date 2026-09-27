// 문서 페이지는 기본적으로 개발 환경에서만 연다. Swagger UI의 "Try it out"은
// 진짜 요청을 보내기 때문에(회원 비활성화 등) 운영에 열어두면 안 된다.
// 운영에서 굳이 필요하면 ENABLE_API_DOCS=true를 명시적으로 켠다.
export function apiDocsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_API_DOCS === "true";
}
