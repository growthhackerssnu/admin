// 세 백엔드(portal/dh/hr)가 공유하는 인증 진입점.
//
// 왜 한 곳에 모으나: 예전엔 이 로직이 apps/dh-backend와 apps/portal-backend에
// 거의 같은 코드로 복사돼 있었다. hr까지 만들면 세 벌이 된다. "비활성 회원은
// 세션도 끊는다" 같은 정책을 나중에 추가할 때 한 군데를 빠뜨리면 그 앱에만
// 구멍이 남고, 세 파일이 비슷하게 생겨서 코드 리뷰로도 안 잡힌다.
// 규칙: docs/db/conventions.md §5.2
//
// 앱마다 다른 것은 주입받는다:
//   - Prisma 접근  : 앱마다 생성 클라이언트가 달라서 이 패키지가 알 수 없다
//   - ApiError     : 앱마다 에러 코드 집합이 다르다(portal은 dh의 부분집합)
//   - 거부 대상/문구: dh는 alumni를 막고 portal은 막지 않는다

export type AuthRole = "admin" | "acting" | "alumni";

/** 이 패키지가 판단에 실제로 쓰는 필드만. 앱의 Member 타입이 이걸 만족하면 된다. */
export type AuthMemberShape = {
  id: string;
  role: AuthRole;
  active: boolean;
};

export type AuthErrorCode = "UNAUTHENTICATED" | "FORBIDDEN";

/** next/server에 의존하지 않으려고 실제로 읽는 부분만 추린 타입. NextRequest가 이걸 만족한다. */
export type RequestLike = {
  headers: { get(name: string): string | null };
};

export type SupabaseAuthLike = {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: unknown;
    }>;
  };
};

export type CreateAuthOptions<M extends AuthMemberShape> = {
  /** 이메일로 회원 조회. 없으면 null. */
  findByEmail: (email: string) => Promise<M | null>;
  /** 첫 로그인 시 supabaseUserId 연결 + 최근 접속 시각 갱신. 갱신된 행을 돌려준다. */
  markLogin: (id: string, supabaseUserId: string) => Promise<M>;
  /** 앱의 ApiError를 만들어 돌려준다. 이 패키지는 그걸 throw하기만 한다. */
  toError: (code: AuthErrorCode, message: string) => Error;
  getSupabaseClient: () => SupabaseAuthLike;
  /** 이 앱에서 거부할 role. dh는 ["alumni"], portal은 생략(전부 허용). */
  deny?: readonly AuthRole[];
  messages?: {
    /** members 화이트리스트에 없을 때 */
    notMember?: string;
    /** deny에 걸렸을 때 */
    deniedRole?: string;
  };
};

export function createGetAuthenticatedMember<M extends AuthMemberShape>(
  options: CreateAuthOptions<M>,
): (req: RequestLike) => Promise<M> {
  const {
    findByEmail,
    markLogin,
    toError,
    getSupabaseClient,
    deny = [],
    messages = {},
  } = options;

  return async function getAuthenticatedMember(req: RequestLike): Promise<M> {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

    if (!token) {
      throw toError("UNAUTHENTICATED", "인증 토큰이 없습니다.");
    }

    // try 안에서 throw하지 않는다. 이 패키지는 앱의 ApiError 클래스를 모르기 때문에,
    // catch에서 "내가 던진 인증 오류"와 "예기치 못한 TypeError"를 구분할 방법이 없다.
    // 검증 실패는 null로 표현해서 try 밖에서 던진다 — 그래야 예기치 못한 예외만
    // 정확히 "인증 서비스 연결 실패"로 흡수된다.
    let verified: { supabaseUserId: string; email: string } | null = null;
    try {
      const { data, error } = await getSupabaseClient().auth.getUser(token);
      if (!error && data.user?.email) {
        verified = { supabaseUserId: data.user.id, email: data.user.email };
      }
    } catch {
      throw toError("UNAUTHENTICATED", "인증 서비스에 연결할 수 없습니다.");
    }

    if (!verified) {
      throw toError("UNAUTHENTICATED", "유효하지 않거나 만료된 세션입니다.");
    }
    const { supabaseUserId, email } = verified;

    // 학회원 계정이 ghsnu.com/gmail.com/snu.ac.kr 등 도메인이 섞여 있어 도메인
    // 검사로는 못 거른다. Google OAuth 동의 화면을 External로 두고(Internal은
    // 단일 Workspace 도메인 소속 계정만 로그인 자체가 가능해서 이 조합과 안 맞음),
    // 실제 접근 통제는 members 화이트리스트가 전담한다.
    const found = await findByEmail(email);

    if (!found) {
      throw toError("FORBIDDEN", messages.notMember ?? "이 계정은 접근 권한이 없습니다. 관리자에게 문의하세요.");
    }
    if (!found.active) {
      throw toError("FORBIDDEN", "비활성화된 계정입니다.");
    }

    // ★ 순서 주의: deny 검사보다 먼저 갱신한다.
    // 토큰이 유효하고 활성 계정이면 — 이 앱의 업무 권한이 없는 role이라도 —
    // "이 사람이 방금 접근을 시도했다"는 사실 자체는 남긴다. 관리자 명단 화면의
    // "최근 접속일"이 alumni에게도 의미 있으려면 여기서 갱신해야 한다.
    const member = await markLogin(found.id, supabaseUserId);

    if (deny.includes(member.role)) {
      throw toError("FORBIDDEN", messages.deniedRole ?? "이 계정은 이 서비스에 접근할 수 없습니다.");
    }

    return member;
  };
}
