import { describe, expect, it, vi } from "vitest";
import { createGetAuthenticatedMember, type AuthRole } from "./member";

// 앱의 ApiError 자리. code를 보존해서 어떤 이유로 거부됐는지 검증할 수 있게 한다.
class FakeError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

type FakeMember = { id: string; role: AuthRole; active: boolean; email: string };

const ACTING: FakeMember = { id: "m1", role: "acting", active: true, email: "a@ghsnu.com" };
const ALUMNI: FakeMember = { id: "m2", role: "alumni", active: true, email: "b@ghsnu.com" };
const INACTIVE: FakeMember = { id: "m3", role: "acting", active: false, email: "c@ghsnu.com" };

function build(opts: {
  member?: FakeMember | null;
  deny?: readonly AuthRole[];
  supabase?: "ok" | "invalid" | "throws";
}) {
  const markLogin = vi.fn(async (id: string, supabaseUserId: string) => {
    const base = opts.member ?? ACTING;
    return { ...base, id, supabaseUserId } as FakeMember;
  });
  const findByEmail = vi.fn(async () => opts.member ?? null);

  const getSupabaseClient = () => ({
    auth: {
      getUser: async () => {
        if (opts.supabase === "throws") throw new Error("네트워크 끊김");
        if (opts.supabase === "invalid") return { data: { user: null }, error: { message: "bad" } };
        return { data: { user: { id: "sb-1", email: "a@ghsnu.com" } }, error: null };
      },
    },
  });

  const get = createGetAuthenticatedMember<FakeMember>({
    findByEmail,
    markLogin,
    toError: (code, message) => new FakeError(code, message),
    getSupabaseClient,
    deny: opts.deny,
    messages: { notMember: "명단에 없음", deniedRole: "이 앱은 못 씀" },
  });

  return { get, markLogin, findByEmail };
}

const req = (auth?: string) => ({ headers: { get: () => auth ?? null } });

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
    return "성공";
  } catch (e) {
    return (e as FakeError).code;
  }
}

describe("createGetAuthenticatedMember", () => {
  it("Authorization 헤더가 없으면 UNAUTHENTICATED", async () => {
    const { get } = build({});
    expect(await codeOf(get(req()))).toBe("UNAUTHENTICATED");
  });

  it("Bearer 형식이 아니면 UNAUTHENTICATED", async () => {
    const { get } = build({});
    expect(await codeOf(get(req("Basic abc")))).toBe("UNAUTHENTICATED");
  });

  it("토큰이 유효하지 않으면 UNAUTHENTICATED", async () => {
    const { get } = build({ supabase: "invalid" });
    expect(await codeOf(get(req("Bearer x")))).toBe("UNAUTHENTICATED");
  });

  // try 안에서 throw하면 catch가 "내 오류"와 "예기치 못한 오류"를 구분 못 해서
  // TypeError 같은 게 그대로 새어나간다. 그래서 검증 실패는 null로 표현한다.
  it("인증 서비스가 예외를 던져도 UNAUTHENTICATED로 흡수한다", async () => {
    const { get } = build({ supabase: "throws" });
    expect(await codeOf(get(req("Bearer x")))).toBe("UNAUTHENTICATED");
  });

  it("members 화이트리스트에 없으면 FORBIDDEN", async () => {
    const { get, markLogin } = build({ member: null });
    expect(await codeOf(get(req("Bearer x")))).toBe("FORBIDDEN");
    expect(markLogin).not.toHaveBeenCalled();
  });

  it("비활성 계정이면 FORBIDDEN", async () => {
    const { get, markLogin } = build({ member: INACTIVE });
    expect(await codeOf(get(req("Bearer x")))).toBe("FORBIDDEN");
    expect(markLogin).not.toHaveBeenCalled();
  });

  it("deny에 걸린 role은 FORBIDDEN", async () => {
    const { get } = build({ member: ALUMNI, deny: ["alumni"] });
    expect(await codeOf(get(req("Bearer x")))).toBe("FORBIDDEN");
  });

  // ★ 순서 계약: 관리자 명단의 "최근 접속일"이 alumni에게도 의미 있으려면,
  // deny로 막히는 계정이라도 접속 시도 자체는 기록돼야 한다.
  it("deny로 거부되더라도 최근 접속 기록은 먼저 남긴다", async () => {
    const { get, markLogin } = build({ member: ALUMNI, deny: ["alumni"] });
    await codeOf(get(req("Bearer x")));
    expect(markLogin).toHaveBeenCalledWith("m2", "sb-1");
  });

  it("deny를 지정하지 않은 앱에서는 alumni도 통과한다", async () => {
    const { get } = build({ member: ALUMNI });
    expect(await codeOf(get(req("Bearer x")))).toBe("성공");
  });

  it("정상 통과하면 갱신된 회원을 돌려준다", async () => {
    const { get, markLogin } = build({ member: ACTING });
    const member = (await get(req("Bearer x"))) as FakeMember;
    expect(member.role).toBe("acting");
    expect(markLogin).toHaveBeenCalledWith("m1", "sb-1");
  });
});
