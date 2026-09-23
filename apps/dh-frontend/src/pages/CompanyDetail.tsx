import { Button, Tabs } from "antd";
import { useState } from "react";
import {
  Collaboration,
  CompanyEvidence,
  History,
  Status,
} from "../components/Shared";
import { ContactWork } from "../components/ContactWork";
import type { WorkProps } from "../components/workTypes";
export function CompanyDetail(
  props: WorkProps & { onBack: () => void; guard: (fn: () => void) => void },
) {
  const { company: c, cycle, onBack, guard } = props;
  const [tab, setTab] = useState("current");
  return (
    <>
      <Button className="section-gap" disabled={props.busy} onClick={onBack}>
        ← 기업 목록
      </Button>
      <div className="row section-gap">
        <div>
          <h1>{c.name}</h1>
          <span className="muted">
            {c.domain} · {c.product}
          </span>
        </div>
        <div>
          <Status company={c} cycleId={cycle.id} />
          담당자 {c.owner}
        </div>
      </div>
      <section className="surface">
        <Tabs
          activeKey={tab}
          onChange={(v) => guard(() => setTab(v))}
          items={[
            { key: "current", label: "이번 컨택" },
            { key: "info", label: "기업 자료" },
            { key: "history", label: "발송·컨택 이력" },
          ]}
        />
        {tab === "current" ? (
          <>
            <p className="muted">
              {c.route} · {cycle.name}
            </p>
            <ContactWork
              key={`${c.id}-${c.stage === "발송 준비" ? "초안 검토" : c.stage}`}
              {...props}
            />
          </>
        ) : tab === "info" ? (
          <div className="stack">
            <h2>기업 자료</h2>
            {c.route === "재협업" && <Collaboration company={c} />}
            <CompanyEvidence company={c} />
            <h2>저장된 관계자</h2>
            <p>
              {c.recipient
                ? `${c.recipient.name} · ${c.recipient.role} · ${c.recipient.email}`
                : "아직 선택한 관계자가 없습니다."}
            </p>
          </div>
        ) : (
          <History company={c} />
        )}
      </section>
    </>
  );
}
