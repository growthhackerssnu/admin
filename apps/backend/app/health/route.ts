// Railway 헬스체크용. 인증·DB 없이 프로세스가 떠 있는지만 확인한다.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
