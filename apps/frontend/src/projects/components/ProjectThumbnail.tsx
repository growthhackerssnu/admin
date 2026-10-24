import { useState } from "react";
import type { Project } from "../api";
import "./ProjectThumbnail.css";

// 프로젝트 썸네일(16:9). 서버가 Storage에 올려둔 이미지(기업 로고 또는 백서 첫 이미지)가
// 있으면 그것을, 없거나 못 불러오면 기업명으로 기본 썸네일을 그린다.
export function ProjectThumbnail({
  project,
  className,
}: {
  project: Pick<Project, "title" | "thumbnailUrl">;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const company = companyName(project.title);
  const classes = ["project-thumb", className].filter(Boolean).join(" ");

  if (project.thumbnailUrl && !failed) {
    return (
      <div className={classes}>
        <img
          src={project.thumbnailUrl}
          alt={company}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <div
      className={`${classes} project-thumb-fallback`}
      style={{ "--thumb-hue": hue(company) } as React.CSSProperties}
      aria-hidden="true"
    >
      <span>{company}</span>
    </div>
  );
}

// "데이블 (25.2Q)" → "데이블"
export function companyName(title: string) {
  return title.replace(/\s*\([^)]*\)\s*$/, "").trim() || title;
}

// 같은 기업은 항상 같은 색이 되도록 이름으로 색상(hue)을 정한다.
function hue(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
