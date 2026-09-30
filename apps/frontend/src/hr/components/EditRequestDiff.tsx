import { Alert, Typography } from "antd";
import type { EditRequest } from "../lib/api";
import { formatDiffValue, sectionLabel } from "../lib/editRequestDisplay";
import "./EditRequestDiff.css";

// 수정 요청 하나의 before/after를 보여주는 읽기 전용 뷰. 내 수정 요청(§12.5)과
// 승인 큐(§12.4) 둘 다 이걸 그대로 쓴다 — 승인 큐 쪽은 여기에 승인/반려
// 버튼만 얹으면 됨(§12.4: "값을 직접 편집하는 인터랙션은 안 가져옴").
//
// newOptions(승인 큐 전용): 이 요청을 승인하면 Notion에 새로 만들어질 옵션 값.
// 오타·중복 옵션이 그대로 생기지 않도록 admin이 눈여겨보게 경고로 보여준다.
export function EditRequestDiff({
  diff,
  newOptions,
}: {
  diff: EditRequest["diff"];
  newOptions?: Record<string, string[]>;
}) {
  const newOptionEntries = Object.entries(newOptions ?? {});
  const structuredEntries = Object.entries(diff.structuredFields);
  const freeTextEntries = Object.entries(diff.freeTextSections);

  return (
    <div className="stack">
      {newOptionEntries.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="승인하면 Notion에 새 옵션이 만들어집니다"
          description={newOptionEntries.map(([label, values]) => `${label}: ${values.join(", ")}`).join(" / ")}
        />
      )}
      {structuredEntries.length > 0 && (
        <div>
          <Typography.Text strong>구조화 필드</Typography.Text>
          <ul className="diff-field-list">
            {structuredEntries.map(([key, entry]) => (
              <li key={key}>
                <strong>{key}</strong>: <span className="diff-before">{formatDiffValue(entry.before)}</span>
                {" → "}
                <span className="diff-after">{formatDiffValue(entry.after)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {freeTextEntries.map(([key, entry]) => (
        <div key={key}>
          <Typography.Text strong>{sectionLabel(key)}</Typography.Text>
          <div className="diff-freetext">
            <div>
              <Typography.Text type="secondary">변경 전</Typography.Text>
              <pre className="diff-freetext-text">{formatDiffValue(entry.before)}</pre>
            </div>
            <div>
              <Typography.Text type="secondary">변경 후</Typography.Text>
              <pre className="diff-freetext-text">{formatDiffValue(entry.after)}</pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
