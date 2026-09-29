// 수정 폼의 단일/다중선택 드롭다운(직무 계열/학과/소속팀)이 고를 수 있는
// 값 목록. Notion의 실제 select/multi_select 옵션을 그대로 쓴다 — 프런트에
// 하드코딩하면 Notion에서 옵션을 추가·변경할 때마다 코드를 같이 고쳐야
// 하고, 특히 학과는 70개가 넘고 계속 늘어나서 하드코딩이 답이 아니다.
//
// 정렬 기준(§12.2 정렬과 무관, 여기는 "고를 수 있는 목록"일 뿐)은 Notion에
// 등록된 순서 그대로 둔다.
import { callNotionRateLimited, getNotionClient } from "./notion";

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
  const databaseId = process.env.NOTION_PEOPLE_DATABASE_ID;
  if (!databaseId) {
    throw new Error("NOTION_PEOPLE_DATABASE_ID가 설정되지 않았습니다.");
  }
  const notion = getNotionClient();
  const db = await callNotionRateLimited(() => notion.databases.retrieve({ database_id: databaseId }));
  const properties = db.properties as Record<string, unknown>;

  return {
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
}

function selectOptionNames(property: unknown): string[] {
  const p = property as { type?: string; select?: { options?: unknown }; multi_select?: { options?: unknown } };
  const options = (p?.select?.options ?? p?.multi_select?.options) as Array<{ name?: string }> | undefined;
  return options?.map((o) => o.name).filter((name): name is string => Boolean(name)) ?? [];
}
