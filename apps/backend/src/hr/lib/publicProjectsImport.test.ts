import { describe, expect, it } from "vitest";
import { matchPublicProjects, parseDetail, parseGallery, type PublicProject } from "./publicProjectsImport";

// 홈페이지 마크업을 줄인 모양(줄마다 <div>, 기업명 줄은 span 둘, 구역 제목은 굵은 fsize25).
const DETAIL = `<html><head><title>25-3Q | Kooky</title></head><body>
<nav><div>PROJECT</div><div>HOME &nbsp;｜ ACTIVITIES ｜ PROJECT</div></nav>
<div class="desc"><div><span class="fsize60">쿠키</span><span>&nbsp;| Kooky</span></div><div><span>&#8203;</span><br></div>
<div><span>K-pop 아티스트의 도시별 인기지수 산출 모델 고도화</span></div></div>
<div class="desc"><div><span style="font-weight: 700;" class="fsize25">프로젝트 소개</span></div><div><br></div>
<div><span class="fsize16">도시별 인기지수를 만들었습니다.</span></div>
<div><span style="font-weight: 700;" class="fsize16"><u>1. 지도 학습 기반 예측 모델 설계</u></span></div>
<div><img src="https://lh3.example/roadmap.png" alt="주제1.png"><br></div>
<div><span style="font-weight: 700;" class="fsize25">PM 소회</span></div>
<blockquote><div><span>좋았던 점은 무엇인가요?</span></div></blockquote><ol><li class="fsize16"><div>새 도메인을 경험했습니다.</div></li><li><div>팀워크가 좋았습니다.</div></li></ol>
</div></body></html>`;

describe("parseDetail", () => {
  it("reads company names, headline and ordered body blocks", () => {
    expect(parseDetail(DETAIL)).toEqual({
      nameKo: "쿠키",
      nameEn: "Kooky",
      headline: ["K-pop 아티스트의 도시별 인기지수 산출 모델 고도화"],
      blocks: [
        { type: "heading", text: "프로젝트 소개" },
        { type: "text", text: "도시별 인기지수를 만들었습니다." },
        { type: "text", text: "1. 지도 학습 기반 예측 모델 설계", bold: true },
        { type: "image", url: "https://lh3.example/roadmap.png" },
        { type: "heading", text: "PM 소회" },
        { type: "text", text: "좋았던 점은 무엇인가요?", quote: true },
        { type: "text", text: "새 도메인을 경험했습니다.", list: true },
        { type: "text", text: "팀워크가 좋았습니다.", list: true },
      ],
    });
  });

  it("returns empty fields when the header line is missing", () => {
    expect(parseDetail("<div>없음</div>").nameKo).toBeNull();
  });
});

describe("parseGallery", () => {
  it("reads label, quarter, side flag and image", () => {
    const html = `<a href="/PROJECT/view/1" data-title="25-3Q Side | 1SelfWorld"><figure><img src="https://lh3.example/a=w800"></figure></a>
      <a href="/PROJECT/view/2" data-title="25-3Q | Kooky"><img src="https://lh3.example/b"></a>`;
    expect(parseGallery(html)).toEqual([
      { url: "https://ghsnu.com/PROJECT/view/1", label: "25-3Q Side | 1SelfWorld", quarter: "25-3Q", isSide: true, imageUrl: "https://lh3.example/a=w800" },
      { url: "https://ghsnu.com/PROJECT/view/2", label: "25-3Q | Kooky", quarter: "25-3Q", isSide: false, imageUrl: "https://lh3.example/b" },
    ]);
  });
});

function pub(label: string, nameKo: string, nameEn: string): PublicProject {
  const quarter = label.slice(0, 5);
  return { url: label, label, quarter, isSide: label.includes("Side"), imageUrl: null, nameKo, nameEn, headline: [], blocks: [] };
}

describe("matchPublicProjects", () => {
  const notion = [
    { notionPageId: "writers", title: "라이터스컴퍼니 (25.3Q)", quarter: "25-3Q" },
    { notionPageId: "abetter", title: "에이베러 (25.3Q)", quarter: "25-3Q" },
    { notionPageId: "oneself-s", title: "원셀프월드 (25.3Q-S)", quarter: "25-3Q" },
    { notionPageId: "soil", title: "S-OIL (25.2Q)", quarter: "25-2Q" },
    { notionPageId: "dable-24", title: "데이블 (24.4Q)", quarter: "24-4Q" },
  ];

  it("matches by quarter, side flag and Korean or English name", () => {
    const m = matchPublicProjects(
      [
        pub("25-3Q | ABetter", "에이베러", "ABetter"),
        pub("25-3Q Side | 1SelfWorld", "원셀프월드", "1SelfWorld"),
        pub("25-2Q | S-OIL", "에쓰-오일", "S-OIL"),
        pub("25-2Q | Dable", "데이블", "Dable"),
      ],
      notion,
    );
    expect(m.get("abetter")?.label).toBe("25-3Q | ABetter");
    expect(m.get("oneself-s")?.label).toBe("25-3Q Side | 1SelfWorld");
    expect(m.get("soil")?.label).toBe("25-2Q | S-OIL");
    // 다른 분기의 같은 기업에는 잇지 않는다.
    expect(m.get("dable-24")).toBeUndefined();
  });

  it("pairs a renamed company when it is the only one left in its quarter", () => {
    const m = matchPublicProjects(
      [pub("25-3Q | ABetter", "에이베러", "ABetter"), pub("25-3Q | Kooky", "쿠키", "Kooky")],
      notion,
    );
    expect(m.get("writers")?.label).toBe("25-3Q | Kooky");
  });
});
