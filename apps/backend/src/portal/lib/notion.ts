// 노션 People DB 동기화(npm run people:import)에서만 쓰는 노션 접근 유틸.
//
// 기수/이름 정규화는 여기 두지 않고 ./normalize에 있다. 동기화가 쓰는 정규화와
// 가입 신청 조회가 쓰는 정규화가 다르면 매칭이 조용히 어긋나기 때문에, 두 경로가
// 반드시 같은 구현을 보게 한다.
import { Client } from "@notionhq/client";

// 지연 생성 — supabase.ts와 같은 이유(빌드 시점엔 NOTION_API_KEY가 없을 수 있음).
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

type NotionPageProperty = Record<string, unknown>;

// Notion 속성 타입(title/rich_text/email/select/number)이 뭐든 사람이 읽는
// 텍스트만 뽑아낸다. 어떤 컬럼 타입으로 만들어져 있는지 우리가 정할 수 없어서
// 여러 케이스를 다 받아준다.
export function extractPropertyText(property: NotionPageProperty | undefined): string | null {
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
    default:
      return null;
  }
}
