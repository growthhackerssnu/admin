import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";

// 스캐폴딩 확인용 엔드포인트다. 첫 업무 라우트를 만들 때 지워도 된다.
//
// 이 파일이 보여주는 패턴이 전부다:
//   - withApiHandler로 감싼다 → requestId 생성, 인증, 에러 봉투가 자동으로 붙는다
//   - 핸들러는 { status?, body } 를 돌려준다
//   - member는 인증된 회원이다. 요청 바디의 사용자 정보는 절대 신뢰하지 않는다
//
// 쓰기(POST/PATCH)를 만들 때는 apps/portal-backend나 apps/dh-backend의 라우트를
// 참고한다 — 멱등성 키 처리(withIdempotency)가 추가로 필요하다.
export const GET = withApiHandler(async (_req, { member, requestId }) => {
  return {
    body: successBody(
      {
        ok: true,
        member: { id: member.id, displayName: member.displayName, role: member.role },
      },
      requestId,
    ),
  };
});
