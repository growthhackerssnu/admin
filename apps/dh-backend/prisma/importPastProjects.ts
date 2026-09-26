// Notion 프로젝트 DB -> dh.past_projects 동기화.
//
// 재실행해도 안전하도록 Notion page id를 upsert 키로 사용한다. 기업은
// Notion의 relation 페이지 제목을 기존 dh.companies.name/aliases와 매칭하며,
// 매칭되는 기업이 없으면 회사명만 가진 기본 Company를 생성한다.
//
// 사용법:
//   npm run past-projects:import -- --dry-run
//   npm run past-projects:import
//
// 필요한 환경변수는 apps/dh-backend/.env.example 참고.
import { Client } from "@notionhq/client";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

type RawProperty = {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string } | null;
  multi_select?: Array<{ name?: string }>;
  number?: number | null;
  relation?: Array<{ id: string }>;
  rollup?: {
    type?: string;
    array?: RawProperty[];
    number?: number | null;
    date?: unknown;
  };
  formula?: RawProperty;
};

type RawPage = {
  id: string;
  url?: string;
  properties?: Record<string, RawProperty>;
};

type RawDatabase = {
  properties: Record<string, { type?: string }>;
};

const env = {
  databaseId: process.env.NOTION_PROJECTS_DATABASE_ID,
  companyProperty: process.env.NOTION_PROJECT_COMPANY_PROPERTY ?? "기업",
  titleProperty: process.env.NOTION_PROJECT_TITLE_PROPERTY ?? "한줄설명",
  quarterProperty: process.env.NOTION_PROJECT_QUARTER_PROPERTY ?? "분기",
  technologyProperty: process.env.NOTION_PROJECT_TECHNOLOGY_PROPERTY ?? "기술분류",
  industryProperty: process.env.NOTION_PROJECT_INDUSTRY_PROPERTY ?? "산업분류",
};

const createMissingCompanies = process.env.NOTION_PROJECT_CREATE_MISSING_COMPANIES !== "false";

function requiredEnv(): string {
  if (!process.env.NOTION_API_KEY) throw new Error("NOTION_API_KEY가 설정되지 않았습니다.");
  if (!env.databaseId) throw new Error("NOTION_PROJECTS_DATABASE_ID가 설정되지 않았습니다.");
  return env.databaseId;
}

function propertyText(property: RawProperty | undefined): string | null {
  if (!property) return null;

  const readRichText = (items: Array<{ plain_text?: string }> | undefined) => {
    const text = items?.map((item) => item.plain_text ?? "").join("").trim();
    return text || null;
  };

  switch (property.type) {
    case "title":
      return readRichText(property.title);
    case "rich_text":
      return readRichText(property.rich_text);
    case "select":
      return property.select?.name?.trim() || null;
    case "multi_select": {
      const names = property.multi_select
        ?.map((item) => item.name?.trim())
        .filter((name): name is string => Boolean(name));
      return names?.length ? names.join(", ") : null;
    }
    case "number":
      return property.number == null ? null : String(property.number);
    case "rollup": {
      if (property.rollup?.type === "array") {
        const values = property.rollup.array?.map(propertyText).filter((value): value is string => Boolean(value));
        return values?.length ? values.join(", ") : null;
      }
      if (property.rollup?.type === "number") {
        return property.rollup.number == null ? null : String(property.rollup.number);
      }
      return null;
    }
    case "formula":
      return propertyText(property.formula);
    default:
      return null;
  }
}

function relationIds(property: RawProperty | undefined): string[] {
  return property?.type === "relation"
    ? (property.relation ?? []).map((item) => item.id).filter(Boolean)
    : [];
}

function pageTitle(page: RawPage): string | null {
  for (const property of Object.values(page.properties ?? {})) {
    if (property.type === "title") return propertyText(property);
  }
  return null;
}

function normalizeCompanyName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, "")
    .replace(/[·.,()\[\]{}\-_\/]/g, "");
}

function parseQuarter(value: string | null): { year: number; quarter: number } | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/(?:^|[^0-9])(\d{2}|\d{4})\s*[-./]?\s*Q?\s*([1-4])\s*Q?\b/);
  if (!match) return null;
  const rawYear = Number(match[1]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return { year, quarter: Number(match[2]) };
}

function companyNameFromPageTitle(value: string | null): string | null {
  if (!value) return null;
  // The current project DB keeps the company in the title as `회사명 (26-2Q)`;
  // the `기업` relation is present but its values are not returned by this token.
  return value
    .replace(/\s*\(\s*\d{2,4}\s*[-./]?\s*[1-4]\s*Q(?:\s*[-_]\s*[A-Z])?\s*\)\s*$/i, "")
    .trim() || null;
}

function propertyWithFallback(
  properties: Record<string, RawProperty>,
  configuredName: string,
  fallbackNames: string[] = [],
): RawProperty | undefined {
  for (const name of [configuredName, ...fallbackNames]) {
    if (properties[name]) return properties[name];
  }
  return undefined;
}

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const databaseId = requiredEnv();
  const dryRun = process.argv.includes("--dry-run");
  const limitValue = argumentValue("--limit");
  const limit = limitValue ? Number(limitValue) : null;
  if (limitValue && (!Number.isInteger(limit) || (limit as number) < 1)) {
    throw new Error("--limit은 1 이상의 정수여야 합니다.");
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const database = (await notion.databases.retrieve({ database_id: databaseId })) as unknown as RawDatabase;
  const properties = database.properties ?? {};
  // Relation/rollup properties may be omitted from databases.retrieve even though
  // they are present on page rows, so only the scalar fields are validated here.
  const requiredProperties = [env.titleProperty, env.quarterProperty];
  const missingProperties = requiredProperties.filter((name) => !(name in properties));
  if (missingProperties.length) {
    throw new Error(
      `Notion 프로젝트 DB 속성을 찾을 수 없습니다: ${missingProperties.join(", ")}\n` +
        `실제 속성: ${Object.keys(properties).join(", ")}`,
    );
  }

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, aliases: true },
  });
  const companyByName = new Map<string, { id: string; name: string }[]>();
  for (const company of companies) {
    for (const name of [company.name, ...company.aliases]) {
      const key = normalizeCompanyName(name);
      if (!key) continue;
      const values = companyByName.get(key) ?? [];
      values.push({ id: company.id, name: company.name });
      companyByName.set(key, values);
    }
  }

  const relationTitleCache = new Map<string, string | null>();
  async function relatedCompanyName(property: RawProperty | undefined): Promise<string | null> {
    const directText = propertyText(property);
    if (directText) return directText;
    const id = relationIds(property)[0];
    if (!id) return null;
    if (relationTitleCache.has(id)) return relationTitleCache.get(id) ?? null;
    const page = (await notion.pages.retrieve({ page_id: id })) as unknown as RawPage;
    const title = pageTitle(page);
    relationTitleCache.set(id, title);
    return title;
  }

  let cursor: string | undefined;
  let processed = 0;
  let imported = 0;
  let updated = 0;
  let createdCompanies = 0;
  const skipped: string[] = [];

  do {
    const response = (await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: Math.min(100, limit ? Math.max(1, limit - processed) : 100),
    })) as unknown as { results: RawPage[]; has_more: boolean; next_cursor: string | null };

    for (const row of response.results) {
      if (limit && processed >= limit) break;
      processed++;
      const rowProperties = row.properties ?? {};
      const title = propertyText(rowProperties[env.titleProperty]);
      const pageName = propertyText(rowProperties.Name);
      const companyName =
        (await relatedCompanyName(propertyWithFallback(rowProperties, env.companyProperty, ["기업"]))) ??
        companyNameFromPageTitle(pageName);
      const quarter = parseQuarter(propertyText(rowProperties[env.quarterProperty]));
      const technologyCategory = propertyText(
        propertyWithFallback(rowProperties, env.technologyProperty, ["기술분류"]),
      );
      const industryCategory = propertyText(
        propertyWithFallback(rowProperties, env.industryProperty, ["산업 분류", "산업분류"]),
      );
      const candidates = companyName ? companyByName.get(normalizeCompanyName(companyName)) ?? [] : [];

      if (!companyName || !title || !quarter || candidates.length > 1 || (candidates.length === 0 && !createMissingCompanies)) {
        const reason = !companyName
          ? "기업 relation 없음"
          : !title
            ? "한줄설명 없음"
            : !quarter
              ? "분기 형식 해석 실패"
              : candidates.length === 0
                ? `Company 매칭 실패(${companyName})`
                : `Company 매칭 모호(${companyName})`;
        skipped.push(`${row.url ?? row.id}: ${reason}`);
        continue;
      }

      let company = candidates[0];
      if (!company && companyName) {
        if (dryRun) {
          company = { id: "__dry_run_company__", name: companyName };
        } else {
          const created = await prisma.company.create({
            data: { name: companyName },
            select: { id: true, name: true },
          });
          company = created;
          companyByName.set(normalizeCompanyName(companyName), [created]);
          createdCompanies++;
        }
      }
      if (!company) continue;
      const data = {
        companyId: company.id,
        notionPageId: row.id,
        title,
        year: quarter.year,
        quarter: quarter.quarter,
        technologyCategory,
        industryCategory,
        notionUrl: row.url ?? null,
      };

      const existing = await prisma.pastProject.findUnique({ where: { notionPageId: row.id } });
      if (dryRun) {
        const marker = candidates.length === 0 ? " [new company]" : "";
        console.log(`[dry-run]${marker} ${companyName} | ${title} | ${quarter.year}-Q${quarter.quarter}`);
      } else {
        await prisma.pastProject.upsert({
          where: { notionPageId: row.id },
          update: data,
          create: data,
        });
      }
      if (existing) updated++;
      else imported++;
    }

    if (limit && processed >= limit) break;
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  console.log(
    `${dryRun ? "검증" : "가져오기"} 완료: 신규 ${imported}건, 갱신 ${updated}건, ` +
      `새 Company ${createdCompanies}건, 건너뜀 ${skipped.length}건`,
  );
  if (skipped.length) {
    console.log("건너뛴 행:");
    for (const item of skipped) console.log(`  - ${item}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
