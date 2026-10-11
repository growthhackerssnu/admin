// 로컬 프론트(5173)와 운영 admin.ghsnu.com만 허용한다. 배포 프리뷰 URL 등은
// ALLOWED_ORIGINS(콤마 구분)로 덮어쓴다. CORS(middleware.ts)와 슬랙 백업 OAuth redirect가 같이 쓴다.
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,https://admin.ghsnu.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
