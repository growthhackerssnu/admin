import { BrandLogo, brandLogos, type BrandLogoVariant } from "@/components/ui/brand-logo";
import "./brand-preview.css";

const usage: Record<BrandLogoVariant, string> = {
  "inline-blue": "밝은 배경의 펼친 사이드바 · 로그인 헤더 · 문서 상단",
  "inline-black": "단색 인쇄 · 흑백 문서",
  "inline-white": "브랜드색이나 어두운 배경의 헤더 · 표지",
  "signature-blue": "밝은 배경의 축소 사이드바 · 정사각형 브랜드 영역",
  "signature-white": "어두운 배경의 작은 브랜드 영역 · 표지",
};

export function BrandPreview() {
  return <section id="brand-assets" className="ds-brand-preview">
    <p className="ds-overline">00 / Brand Assets</p><h2 className="ds-headline-5">Growth Hackers 로고</h2>
    <p className="ds-body-2 ds-muted">원본 PNG 4종과 가로형 파랑 표시 버전을 관리합니다. 밝은 화면에는 두 형태 모두 같은 파랑 #01397C를 사용합니다.</p>
    <div className="ds-brand-grid">{(Object.keys(brandLogos) as BrandLogoVariant[]).map(variant => {
      const asset = brandLogos[variant];
      return <article key={variant} className="ds-brand-example">
        <div className={`ds-brand-surface ${variant.endsWith("white") ? "ds-brand-surface-dark" : ""}`}>
          <BrandLogo variant={variant} width={variant.startsWith("inline") ? 200 : 112} />
        </div>
        <h3 className="ds-subtitle-2">{asset.label}</h3><p>{usage[variant]}</p><code>{variant}</code>
        <a href={asset.src} download>{variant === "inline-blue" ? "원본 PNG (검정)" : "원본 PNG"}</a>
      </article>;
    })}</div>
    <h3 className="ds-subtitle-1 ds-brand-rule-title">크기 · 정렬 · 여백</h3>
    <div className="ds-brand-rules"><p>가로형 기본 너비 160px · 두 줄형 기본 너비 64px. 형태의 비율을 유지합니다. 가로형 파랑은 검정 원본의 투명도 마스크와 공통 색상 토큰으로 표시합니다.</p>
      <p>로고 주변 여유 공간은 표시 높이의 ¼ 이상을 시작값으로 둡니다. 로고는 행동 버튼·상태 배지·로딩 아이콘으로 사용하지 않습니다.</p>
      <p>사이드바: 펼침은 가로형 파랑 160px, 축소는 두 줄형 파랑 32px. 66px 헤더 안에서 세로 중앙에 두고, 축소 상태에서는 가로도 중앙에 맞춥니다.</p>
      <p>두 줄형은 일반 사용 시 48px 이상을 권장합니다. 축소 사이드바의 32px은 제한된 공간에서 사용하는 예외이며 작은 글씨용 아이콘이나 favicon은 별도 제작이 필요합니다.</p>
      <p>흰색 가로형의 원본에는 투명 여백이 있습니다. 공통 컴포넌트가 실제 그림 영역 기준으로 표시 크기와 정렬을 맞춥니다. 원본 파일은 그대로 보존합니다.</p>
      <p>파랑 로고의 원본색은 #01397C입니다. UI 브랜드와 로고에 같은 기준색을 사용합니다. 아래 크기와 여유 공간은 자체 제안값입니다.</p>
    </div>
  </section>;
}
