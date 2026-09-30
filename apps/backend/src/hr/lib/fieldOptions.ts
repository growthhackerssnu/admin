// 수정 폼의 단일/다중선택 드롭다운(직무 계열/학과/소속팀)이 고를 수 있는
// 값 목록. Notion의 실제 select/multi_select 옵션을 그대로 쓴다 — 프런트에
// 하드코딩하면 Notion에서 옵션을 추가·변경할 때마다 코드를 같이 고쳐야
// 하고, 특히 학과는 70개가 넘고 계속 늘어나서 하드코딩이 답이 아니다.
//
// 정렬 기준(§12.2 정렬과 무관, 여기는 "고를 수 있는 목록"일 뿐)은 Notion에
// 등록된 순서 그대로 둔다.
import { memoryDelete, memoryGet, memorySet } from "./memoryCache";
import { callNotionRateLimited, getNotionClient } from "./notion";

const OPTIONS_CACHE_KEY = "field-options";

// 승인으로 Notion에 새 옵션이 생기면 다음 조회가 바로 새 목록을 보게 한다.
export function invalidateFieldOptions(): void {
  memoryDelete(OPTIONS_CACHE_KEY);
}

// 옵션 이름 비교용 정규화 — 공백·대소문자만 다른 값을 같은 옵션으로 본다
// ("pm" ≈ "PM", "데이터  사이언스" ≈ "데이터 사이언스"). 표시 이름은 항상 Notion의
// 기존 옵션 이름을 쓴다(canonicalizeOptionValues).
export function optionKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

// 입력 값들을 기존 옵션 이름으로 맞춘다. 기존에 없으면 공백만 정리한 새 값으로 둔다.
// 중복은 제거한다. isNew는 "Notion에 새 옵션이 생길 값"이다.
export function canonicalizeOptionValues(
  values: string[],
  existing: string[],
): { values: string[]; newValues: string[] } {
  const byKey = new Map(existing.map((name) => [optionKey(name), name]));
  const seen = new Set<string>();
  const result: string[] = [];
  const newValues: string[] = [];
  for (const raw of values) {
    const key = optionKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const canonical = byKey.get(key);
    if (canonical) {
      result.push(canonical);
    } else {
      const cleaned = raw.trim().replace(/\s+/g, " ");
      result.push(cleaned);
      newValues.push(cleaned);
    }
  }
  return { values: result, newValues };
}

export type FieldOptions = {
  jobField: string[];
  department: string[];
  team: string[];
  cohort: number[];
};

const PROPERTY_NAME = {
  jobField: "직무 계열",
  department: "학과",
  team: "소속팀",
  cohort: "기수",
} as const;

export async function getFieldOptions(): Promise<FieldOptions> {
  const cached = memoryGet<FieldOptions>(OPTIONS_CACHE_KEY);
  if (cached) return cached;

  const databaseId = process.env.NOTION_PEOPLE_DATABASE_ID;
  if (!databaseId) {
    throw new Error("NOTION_PEOPLE_DATABASE_ID가 설정되지 않았습니다.");
  }
  const notion = getNotionClient();
  const db = await callNotionRateLimited(() => notion.databases.retrieve({ database_id: databaseId }));
  const properties = db.properties as Record<string, unknown>;

  const options: FieldOptions = {
    jobField: selectOptionNames(properties[PROPERTY_NAME.jobField]),
    department: selectOptionNames(properties[PROPERTY_NAME.department]),
    team: selectOptionNames(properties[PROPERTY_NAME.team]),
    // "기수"도 select라 문자열 옵션인데(§DB_SCHEMA_HR.md §2.1 참고), 수정
    // 폼에서 숫자로 다뤄야 하므로 여기서 변환 + 내림차순 정렬까지 해둔다.
    cohort: selectOptionNames(properties[PROPERTY_NAME.cohort])
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => b - a),
  };
  memorySet(OPTIONS_CACHE_KEY, options);
  return options;
}

function selectOptionNames(property: unknown): string[] {
  const p = property as { type?: string; select?: { options?: unknown }; multi_select?: { options?: unknown } };
  const options = (p?.select?.options ?? p?.multi_select?.options) as Array<{ name?: string }> | undefined;
  return options?.map((o) => o.name).filter((name): name is string => Boolean(name)) ?? [];
}
