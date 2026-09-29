// hr이 Notion People DB를 읽을 때 쓰는 유틸.
//
// apps/backend/src/portal/lib/notion.ts와 클라이언트 생성 부분은 동일 패턴이지만,
// portal은 가입 매칭용으로 이름/기수/이메일 정도만 뽑으면 됐던 반면 hr은
// 디렉토리·프로필 상세에 필요한 필드가 훨씬 많아(학과·소속팀 같은 다중선택 포함)
// 별도 파일로 둔다. 두 파일이 갈라지면 헷갈릴 수 있으니, 이 파일을 고칠 땐 포털
// 쪽도 같은 실수를 하고 있지 않은지 한 번씩 확인한다.
import { Client } from "@notionhq/client";

// 지연 생성 — 빌드 시점엔 NOTION_API_KEY가 없을 수 있다(src/portal/lib/notion.ts와 같은 이유).
let cached: Client | null = null;

export function getNotionClient(): Client {
  if (cached) return cached;
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new Error("NOTION_API_KEY가 설정되지 않았습니다.");
  }
  cached = new Client({ auth: apiKey });
  return cached;
}

// title/rich_text/email/select/url/phone_number처럼 "값이 하나"인 속성에서
// 사람이 읽는 텍스트만 뽑는다. 어떤 타입으로 만들어져 있는지 우리가 정할 수
// 없어서 여러 케이스를 다 받아준다(portal의 extractPropertyText와 같은 목적).
// 호출부는 Notion 응답을 그대로 인덱싱해서 넘기므로(Record<string, unknown>),
// 타입을 unknown으로 받고 내부에서 좁힌다.
export function extractPropertyText(property: unknown): string | null {
  if (!property) return null;
  const p = property as { type?: string } & Record<string, unknown>;

  switch (p.type) {
    case "title":
    case "rich_text": {
      const arr = p[p.type] as Array<{ plain_text?: string }> | undefined;
      const text = arr?.map((t) => t.plain_text ?? "").join("") ?? "";
      return text.trim() || null;
    }
    case "email":
      return (p.email as string | null)?.trim() || null;
    case "number":
      return p.number != null ? String(p.number) : null;
    case "select":
      return (p.select as { name?: string } | null)?.name?.trim() || null;
    case "phone_number":
      return (p.phone_number as string | null)?.trim() || null;
    case "url":
      return (p.url as string | null)?.trim() || null;
    default:
      return null;
  }
}

// 블록(본문) 안의 rich_text 배열에서 텍스트만 이어붙인다. extractPropertyText의
// title/rich_text 케이스와 비슷해 보이지만, 이건 "속성 객체"가 아니라 블록
// 안에 바로 들어있는 rich_text 배열을 받는다는 점이 다르다(예: 문단·목록
// 블록의 본문).
export function richTextToPlain(richText: unknown): string {
  const arr = richText as Array<{ plain_text?: string }> | undefined;
  return arr?.map((t) => t.plain_text ?? "").join("") ?? "";
}

// multi_select처럼 "값이 여러 개"인 속성에서 이름 배열만 뽑는다(학과/소속팀).
// 값이 없으면 빈 배열 — null이 아니다(DB_SCHEMA_HR.md §2.1, 필터의 "값 없음"
// 옵션은 이 빈 배열을 기준으로 판단한다).
export function extractMultiSelect(property: unknown): string[] {
  if (!property) return [];
  const p = property as { type?: string } & Record<string, unknown>;
  if (p.type !== "multi_select") return [];
  const options = p.multi_select as Array<{ name?: string }> | undefined;
  return options?.map((o) => o.name?.trim()).filter((name): name is string => Boolean(name)) ?? [];
}

// Notion 공식 한도는 "초당 평균 3회"인데, 여러 개를 그대로 동시에 쏘면 순간적으로
// 한도를 넘어 바로 429(rate_limited)를 맞는 걸 실제로 확인했다(2026-09-28,
// people_cache["list"] 빌드 시). 그래서 Notion을 부르는 모든 곳(이미지 마이그레이션,
// people_cache 빌드, 나중의 승인 큐 write-back까지)이 이 게이트 하나를 공유해서
// "직전 발사 시각 + 이 간격"이 지날 때까지 기다리게 한다 — 호출부가 여러 파일에
// 흩어져도 전역으로 하나의 속도만 지키면 되게 하려는 목적.
const DISPATCH_INTERVAL_MS = 350; // 초당 약 2.85회 — 3회 한도보다 살짝 낮게
let nextDispatchAt = 0;
const MAX_NOTION_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDispatchSlot(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextDispatchAt - now);
  nextDispatchAt = Math.max(now, nextDispatchAt) + DISPATCH_INTERVAL_MS;
  if (wait > 0) await sleep(wait);
}

function retryAfterSeconds(err: unknown): number | null {
  const headers = (err as { headers?: { get?(name: string): string | null } } | undefined)?.headers;
  const raw = headers?.get?.("retry-after");
  const seconds = raw ? Number(raw) : NaN;
  return Number.isFinite(seconds) ? seconds : null;
}

// Notion을 부르는 모든 곳이 이 함수를 통해서만 호출한다 — 직접
// getNotionClient()의 메서드를 호출하지 않는다(속도 제한을 우회하게 됨).
export async function callNotionRateLimited<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  await waitForDispatchSlot();
  try {
    return await fn();
  } catch (err) {
    const isRateLimited = (err as { code?: string })?.code === "rate_limited";
    if (isRateLimited && attempt < MAX_NOTION_RETRIES) {
      // Notion이 직접 알려주는 대기시간을 그대로 따른다 — 짧게 재시도해봤자
      // 또 걸릴 뿐이다.
      await sleep((retryAfterSeconds(err) ?? 2) * 1000);
      return callNotionRateLimited(fn, attempt + 1);
    }
    throw err;
  }
}
