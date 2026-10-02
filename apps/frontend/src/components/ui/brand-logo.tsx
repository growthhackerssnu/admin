import type { CSSProperties } from "react";
import inlineBlack from "@/design-system/assets/brand/GH_INLINE_BLACK.png";
import inlineWhite from "@/design-system/assets/brand/GH_INLINE_WHITE.png";
import signatureBlue from "@/design-system/assets/brand/GH_OnlyLogo_SGNT_BLUE.png";
import signatureWhite from "@/design-system/assets/brand/GH_OnlyLogo_SGNT_WHITE.png";
import "./brand-logo.css";

export const brandLogos = {
  "inline-blue": { src: inlineBlack, label: "가로형 · 파랑", width: 758, height: 170, bounds: [0, 0, 758, 170], defaultWidth: 160 },
  "inline-white": { src: inlineWhite, label: "가로형 · 흰색", width: 853, height: 306, bounds: [78, 60, 783, 221], defaultWidth: 160 },
  "signature-blue": { src: signatureBlue, label: "두 줄형 · 파랑", width: 506, height: 351, bounds: [0, 0, 506, 351], defaultWidth: 64 },
  "signature-white": { src: signatureWhite, label: "두 줄형 · 흰색", width: 506, height: 351, bounds: [0, 0, 506, 351], defaultWidth: 64 },
  "inline-black": { src: inlineBlack, label: "가로형 · 검정 (원본)", width: 758, height: 170, bounds: [0, 0, 758, 170], defaultWidth: 160 },
} as const;

export type BrandLogoVariant = keyof typeof brandLogos;

/** Width refers to the visible artwork, excluding transparent source margins. */
export function BrandLogo({ variant = "inline-blue", width, decorative = false }: {
  variant?: BrandLogoVariant;
  width?: number;
  decorative?: boolean;
}) {
  const asset = brandLogos[variant];
  const [left, top, right, bottom] = asset.bounds;
  const artworkWidth = right - left;
  const artworkHeight = bottom - top;
  return <span className="ds-brand-logo" data-variant={variant} style={{
    width: width ?? asset.defaultWidth,
    aspectRatio: `${artworkWidth} / ${artworkHeight}`,
    "--logo-mask-image": `url("${asset.src}")`,
    "--logo-image-width": `${asset.width / artworkWidth * 100}%`,
    "--logo-image-height": `${asset.height / artworkHeight * 100}%`,
    "--logo-image-left": `${-left / artworkWidth * 100}%`,
    "--logo-image-top": `${-top / artworkHeight * 100}%`,
  } as CSSProperties}>
    <img src={asset.src} width={asset.width} height={asset.height} alt={decorative ? "" : "Growth Hackers"} draggable={false} />
  </span>;
}
