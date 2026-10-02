export const STARTUP_RECIPE_ARCHIVE =
  "https://startuprecipe.co.kr/archives/invest-newsletter";
export const STARTUP_RECIPE_PARSER_VERSION = "startup-recipe-weekly-table-v1";

export type StartupRecipeCompany = { name: string; summary: string };

function plainText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCollectedName(name: string) {
  return name
    .replace(/주식회사|\(주\)|㈜/gi, "")
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .toLocaleLowerCase("ko-KR");
}

export function startupRecipeArticleUrls(html: string, baseUrl: string) {
  const urls = new Set<string>();
  for (const article of html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)) {
    if (!/\[StartupRecipe\]/i.test(article[0])) continue;
    const match = article[0].match(
      /href=["']([^"']*\/archives\/invest-newsletter\/\d+\/?)["']/i,
    );
    if (!match) continue;
    try {
      const url = new URL(match[1] ?? "", baseUrl);
      if (
        url.hostname === "startuprecipe.co.kr" ||
        url.hostname === "www.startuprecipe.co.kr"
      ) {
        url.search = "";
        url.hash = "";
        urls.add(url.toString().replace(/\/$/, ""));
      }
    } catch {
      // Ignore malformed archive links.
    }
  }
  return [...urls];
}

export function nextStartupRecipeArchiveUrl(html: string, baseUrl: string) {
  const current = Number(baseUrl.match(/\/page\/(\d+)/)?.[1] ?? "1");
  for (const match of html.matchAll(
    /href=["']([^"']*\/archives\/invest-newsletter\/page\/(\d+)\/?)["']/gi,
  )) {
    if (Number(match[2]) !== current + 1) continue;
    try {
      const url = new URL(match[1] ?? "", baseUrl);
      if (
        url.hostname === "startuprecipe.co.kr" ||
        url.hostname === "www.startuprecipe.co.kr"
      ) return url.toString();
    } catch {
      // Ignore malformed pagination links.
    }
  }
  return null;
}

export function parseStartupRecipeArticle(html: string) {
  const title = plainText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const weekly = /^\[StartupRecipe\]/i.test(title);
  const dateTime = html.match(/datetime=["']([^"']+)["']/i)?.[1];
  const koreanDate = html.match(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  const publishedAt = dateTime
    ? new Date(dateTime)
    : koreanDate
      ? new Date(Date.UTC(Number(koreanDate[1]), Number(koreanDate[2]) - 1, Number(koreanDate[3])))
      : null;
  const companies = new Map<string, StartupRecipeCompany>();

  if (weekly) for (const table of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [...(table[1] ?? "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(
      (row) => [...(row[1] ?? "").matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
        .map((cell) => plainText(cell[1] ?? "")),
    );
    const header = rows[0] ?? [];
    const nameIndex = header.findIndex((cell) => cell === "기업명");
    const summaryIndex = header.findIndex((cell) => cell === "분야");
    if (nameIndex < 0 || summaryIndex < 0) continue;
    for (const cells of rows.slice(1)) {
      const name = (cells[nameIndex] ?? "").trim();
      const summary = (cells[summaryIndex] ?? "").trim();
      const key = normalizeCollectedName(name);
      if (!key || name.length > 80 || !summary || summary.length > 500) continue;
      if (!companies.has(key)) companies.set(key, { name, summary });
    }
  }

  return {
    title,
    weekly,
    publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    companies: [...companies.values()],
  };
}
