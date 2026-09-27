import { withApiHandler } from "@/lib/apiHandler";
import { successBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

// GET /api/v1/me — 로그인한 사람이 누구고 role이 뭔지 hr-frontend가 알아야
// 할 때 부르는 엔드포인트다. 두 군데서 이 값이 필요하다:
//   1. 디렉토리 화면(/hr) 상단에 고정으로 뜨는 "내 프로필" 카드 — 이게 몇 번
//      Notion 페이지인지 알아야 카드에 그 사람 정보를 채울 수 있다.
//   2. dh·hr·admin을 오가는 side pane을 보여줄지 — alumni면 안 보여준다.
// 참고: ARCHITECTURE.md §12.2.1, ARCHITECTURE_PORTAL.md §3
//
// portal-backend에도 같은 이름의 엔드포인트(GET /me)가 있지만 용도가 다르다.
// portal 것은 "로그인 직후 어디로 보낼지"가 필요하고, 여기(hr) 것은 "이
// 사람의 Notion 프로필이 어느 것인지"가 필요하다 — 그래서 돌려주는 값도 다르다.
export const GET = withApiHandler(async (_req, { member, requestId }) => {
  // withApiHandler가 넘겨주는 member는 core.members 테이블의 행 하나인데,
  // 여기엔 claimedPersonEntry(=이 사람이 가입할 때 인증한 people_directory
  // 항목) 정보가 같이 들어있지 않다. Prisma는 기본적으로 "관계로 연결된 다른
  // 테이블"까지 자동으로 같이 가져오지 않고, include로 명시해야 가져온다 —
  // 그래서 member.id로 한 번 더 조회한다.
  const memberWithProfile = await prisma.member.findUniqueOrThrow({
    where: { id: member.id },
    include: { claimedPersonEntry: true },
  });

  return {
    body: successBody(
      {
        role: member.role,
        // 관리자(admin@ghsnu.com)처럼 가입 절차(기수+이름+OTP)를 거치지 않고
        // CLI로 바로 만들어진 계정은 claimedPersonEntry가 없다 — 그런 경우
        // null을 돌려준다. hr-frontend는 null이면 "내 프로필" 카드를 그냥
        // 안 보여주면 된다(ARCHITECTURE.md §5의 optional 설명과 같은 이유).
        notionPageId:
          memberWithProfile.claimedPersonEntry?.notionPageId ?? null,
      },
      requestId,
    ),
  };
});
