import { describe, expect, it } from "vitest";
import {
  normalizeCollectedName,
  parseStartupRecipeArticle,
  startupRecipeArticleUrls,
} from "./startupRecipe";

describe("StartupRecipe weekly collection", () => {
  it("selects weekly articles from the shared DailyRecipe archive", () => {
    const archive = `
      <article><a href="https://startuprecipe.co.kr/archives/invest-newsletter/1"
        aria-label="Read article: [DailyRecipe] 오늘의 소식">DailyRecipe</a></article>
      <article><a href="https://startuprecipe.co.kr/archives/invest-newsletter/2"
        aria-label="Read article: [StartupRecipe] 주간 투자">StartupRecipe</a></article>
    `;
    expect(startupRecipeArticleUrls(archive, "https://startuprecipe.co.kr/archives/invest-newsletter"))
      .toEqual(["https://startuprecipe.co.kr/archives/invest-newsletter/2"]);
  });

  it("extracts only company name and one-line sector from the actual weekly table shape", () => {
    const html = `
      <h1>[StartupRecipe] 메가 시리즈A 시대 왔다…왜?</h1>
      <time datetime="2026-09-28T09:00:00+09:00">2026년 9월 28일</time>
      <table class="auto-fields table"><thead><tr><th>기업명</th><th>분야</th><th>투자금</th><th>단계</th></tr></thead>
      <tbody><tr><td>덴탈로보틱스</td><td>치과 서셕 작업 로봇</td><td>비공개</td><td>시드</td></tr>
      <tr><td>㈜ 덴탈로보틱스</td><td>중복 표현</td><td></td><td></td></tr></tbody></table>
      <table><tr><td>홀리데이로보틱스</td><td>휴머노이드 로봇</td></tr></table>
    `;
    const result = parseStartupRecipeArticle(html);
    expect(result.weekly).toBe(true);
    expect(result.companies).toEqual([
      { name: "덴탈로보틱스", summary: "치과 서셕 작업 로봇" },
    ]);
    expect(normalizeCollectedName("㈜ 덴탈로보틱스"))
      .toBe(normalizeCollectedName("덴탈로보틱스"));
  });

  it("does not turn a DailyRecipe article into candidates", () => {
    const result = parseStartupRecipeArticle(
      "<h1>[DailyRecipe] 오늘</h1><table><tr><th>기업명</th><th>분야</th></tr><tr><td>A</td><td>B</td></tr></table>",
    );
    expect(result.companies).toEqual([]);
  });
});
