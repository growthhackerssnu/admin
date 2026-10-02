import { useMemo } from "react";
import ReviewWorkspace from "./ReviewWorkspace";
import { initialReviewData } from "./fixtures";
import { applyCommand } from "./previewRepository";
import type { ReviewRepository } from "./contracts";

export default function DesignCheck() {
  const params = new URLSearchParams(location.search);
  const scenario = params.get("scenario") ?? "empty";
  const variant = params.get("variant") === "b" ? "b" : "a";
  const repository = useMemo<ReviewRepository>(() => {
    let data = initialReviewData();
    const c = data.candidates.find((c) => c.id === "clearnote")!;
    if (scenario === "long") {
      c.research!.facts.forEach(
        (f) => (f.text = Array(6).fill(f.text).join(" ")),
      );
      c.research!.ideas.forEach(
        (i) => (i.rationale = Array(5).fill(i.rationale).join(" ")),
      );
    }
    if (["ready", "approved"].includes(scenario))
      c.recipient = {
        name: "샘플 관계자",
        title: "사업개발",
        channel: "linkedin",
        address: "https://www.linkedin.com/in/sample-contact",
      };
    if (["approved", "rejected"].includes(scenario)) data = applyCommand(data,c.id,c.version,{type:"decide",status:scenario === "approved" ? "approved" : "rejected_contact",note:"검수용 판단 기록"});
    if (scenario === "error") {
      c.research = null;
      c.researchStatus = "error";
      c.error = {
        message: "홈페이지 응답 시간이 초과되었습니다. 후보 정보는 유지됩니다.",
        retryable: true,
      };
    }
    return {
      mode: "preview",
      load: async () => structuredClone(data),
      execute: async (id, v, cmd) => {
        if (scenario === "save-error") throw new Error("저장 요청이 실패했습니다. 입력은 유지됩니다. 다시 저장해주세요.");
        data = applyCommand(data, id, v, cmd);
        return structuredClone(data);
      },
      addQuarter: async () => structuredClone(data),
    };
  }, [scenario]);
  const link = (s: string, v: string) =>
    `?reviewPreview=1&designCheck=1&view=review&filter=all&candidate=clearnote&scenario=${s}&variant=${v}`;
  return (
    <div className={`rv-design-check variant-${variant}`}>
      <aside className="rv-check-controls">
        동일 조건 비교 · 메모리 저장만 · {scenario} / {variant.toUpperCase()}
        {[
          ["empty", "관계자 없음"],
          ["long", "긴 설명"],
          ["ready", "승인 가능"],
          ["approved", "승인 완료"],
          ["rejected", "거절 완료"],
          ["error", "조사 오류"],
          ["save-error", "저장 오류"],
        ].map(([s, label]) => (
          <a key={s} href={link(s, variant)}>
            {label}
          </a>
        ))}
        <a href={link(scenario, "a")}>A · 선택안</a>
        <a href={link(scenario, "b")}>B · 넓은 간격</a>
      </aside>
      <ReviewWorkspace key={scenario} repository={repository} />
    </div>
  );
}
