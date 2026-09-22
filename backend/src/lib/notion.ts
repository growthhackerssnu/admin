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

// 기수는 "19기" 처럼 텍스트가 섞여 들어올 수 있어 숫자만 뽑아 비교한다.
export function normalizeCohort(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits || raw.trim();
}

// 이름은 공백 차이만으로 매칭이 어긋나지 않게 공백을 모두 제거해 비교한다.
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

// 노션의 구분 컬럼 값(예: "액팅", "알럼나이", "졸업", "active")을 acting/alumni로
// 매핑한다. 알 수 없는 값은 null — 잘못 추측해서 과한 권한을 주는 것보다,
// import 스크립트가 건너뛰고 사람이 확인하게 하는 편이 안전하다.
const ACTING_ALIASES = new Set(["액팅", "액팅기수", "acting", "active", "재학", "재적"]);
const ALUMNI_ALIASES = new Set(["알럼나이", "알럼", "alumni", "졸업", "동문"]);

export function normalizeCohortStatus(raw: string): "acting" | "alumni" | null {
  const key = raw.replace(/\s+/g, "").toLowerCase();
  if (ACTING_ALIASES.has(key)) return "acting";
  if (ALUMNI_ALIASES.has(key)) return "alumni";
  return null;
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
