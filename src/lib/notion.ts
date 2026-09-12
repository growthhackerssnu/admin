import { Client } from "@notionhq/client";

export const notion = new Client({ auth: process.env.NOTION_API_KEY });

export const NOTION_PROJECT_LIST_DATABASE_ID = process.env.NOTION_PROJECT_LIST_DATABASE_ID ?? "";
export const NOTION_MEETING_TRACKER_DATABASE_ID = process.env.NOTION_MEETING_TRACKER_DATABASE_ID ?? "";

function databaseUrl(databaseId: string): string {
  return `https://www.notion.so/${databaseId.replace(/-/g, "")}`;
}

/**
 * "프로젝트 목록" DB는 사람이 프로젝트 제안을 쓸 때 참고하라고 링크만 붙여주는 용도다
 * (봇이 이 목록을 보고 대신 제안을 쓰지 않는다 — PRD 요구사항). 제목만 가볍게 긁어와
 * 초안에 "참고할 만한 프로젝트" 몇 개를 미리 보여주는 정도로만 쓴다.
 */
export async function getProjectListReference(): Promise<{ url: string; titles: string[] }> {
  const url = databaseUrl(NOTION_PROJECT_LIST_DATABASE_ID);
  if (!NOTION_PROJECT_LIST_DATABASE_ID) return { url, titles: [] };

  try {
    // 2025-09-03 API부터 "데이터베이스"와 실제 행이 들어있는 "데이터소스"가 분리됐다.
    // 환경변수로 받은 건 데이터베이스 ID이므로, 먼저 데이터베이스를 조회해 그 안의
    // 기본 데이터소스 ID를 얻은 뒤에 쿼리해야 한다.
    const database = await notion.databases.retrieve({ database_id: NOTION_PROJECT_LIST_DATABASE_ID });
    const dataSourceId = "data_sources" in database ? database.data_sources[0]?.id : undefined;
    if (!dataSourceId) return { url, titles: [] };

    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      page_size: 10,
    });

    const titles: string[] = [];
    for (const page of response.results) {
      if (!("properties" in page)) continue;
      const titleProp = Object.values(page.properties).find((p) => p.type === "title");
      if (titleProp && titleProp.type === "title") {
        const text = titleProp.title.map((t: { plain_text: string }) => t.plain_text).join("");
        if (text) titles.push(text);
      }
    }
    return { url, titles };
  } catch (err) {
    console.error("[notion] getProjectListReference failed", err);
    return { url, titles: [] };
  }
}
