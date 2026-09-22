import { Alert, Button, Descriptions, Modal, Tag, Timeline } from "antd";
import type { ReactNode } from "react";
import { useState } from "react";
import type { Company, SendRecord } from "../models/outreach";
import { stageLabel } from "../models/policy";
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Status({
  company,
  cycleId,
}: {
  company: Company;
  cycleId: string;
}) {
  return <Tag>{stageLabel(company, cycleId)}</Tag>;
}
export function CompanyEvidence({ company: c }: { company: Company }) {
  const [source, setSource] = useState(false);
  return (
    <>
      <Descriptions
        column={1}
        bordered
        size="small"
        items={[
          { key: "p", label: "제품·서비스", children: c.product },
          { key: "d", label: "도메인", children: c.domain },
          { key: "r", label: "판단 요약", children: c.reason },
          {
            key: "h",
            label: "기존 컨택",
            children: c.history.at(-1) || "컨택 이력 없음",
          },
          {
            key: "s",
            label: "조사 출처",
            children: (
              <Button type="link" onClick={() => setSource(true)}>
                샘플 조사 근거 보기
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title="조사 근거"
        open={source}
        onCancel={() => setSource(false)}
        footer={<Button onClick={() => setSource(false)}>닫기</Button>}
      >
        <p>{c.reason}</p>
        <p className="muted">
          가상 기업의 샘플 근거입니다. 실제 연결 시 원문 URL과 조사 시점을
          제공합니다.
        </p>
      </Modal>
    </>
  );
}
export function Collaboration({ company: c }: { company: Company }) {
  return (
    <div className="hint">
      <strong>이전 협업 기록</strong>
      <p>
        {c.history
          .filter((x) => x.includes("협업 완료") || x.includes("후기"))
          .join(" · ") || "이전 협업 기록 확인"}
      </p>
      <Button disabled>학회 노션 · 지난 협업 자료</Button>
      <p className="meta">연결 방식 미정 · 진행 사유는 필요하지 않습니다.</p>
    </div>
  );
}
export function History({ company: c }: { company: Company }) {
  const [selected, setSelected] = useState<SendRecord>();
  return (
    <div className="stack">
      {c.sentRecords.map((r) => (
        <div className="contact row" key={r.id}>
          <div>
            <strong>{r.subject}</strong>
            <div className="meta">
              {r.recipient.name} · {new Date(r.time).toLocaleString("ko-KR")}
            </div>
          </div>
          <Button onClick={() => setSelected(r)}>발송 내용 보기</Button>
        </div>
      ))}
      {!c.sentRecords.length && c.lastSentCycleId && (
        <Alert
          type="info"
          message="과거 샘플의 발송 본문은 기록되지 않았습니다."
        />
      )}
      <Timeline
        items={(c.history.length ? c.history : ["컨택 이력이 없습니다."])
          .slice()
          .reverse()
          .map((text) => ({ children: text }))}
      />
      <Modal
        title="발송한 메시지"
        open={!!selected}
        width={760}
        onCancel={() => setSelected(undefined)}
        footer={<Button onClick={() => setSelected(undefined)}>닫기</Button>}
      >
        {selected && (
          <>
            <p>
              {selected.recipient.name} · {selected.recipient.email}
            </p>
            <p>
              {selected.cycleName} ·{" "}
              {new Date(selected.time).toLocaleString("ko-KR")}
            </p>
            <strong>{selected.subject}</strong>
            <p className="message-body">{selected.body}</p>
            <Alert
              type="info"
              message="발송 당시 스냅샷 · 읽기 전용 · 실제 발송 없음"
            />
          </>
        )}
      </Modal>
    </div>
  );
}
