import { Alert, Button, Input, Modal, Space } from "antd";
import { useEffect, useState } from "react";
import { Collaboration, CompanyEvidence, Field } from "./Shared";
import { DecisionButtons, TemplateNotice } from "./WorkShared";
import type { WorkProps } from "./workTypes";
export function MessageEditor(props: WorkProps) {
  const { company: c, execute, busy } = props;
  const draft = c.draft!;
  const [values, setValues] = useState({
    topic: draft?.topic || "",
    subject: draft?.subject || "",
    body: draft?.body || "",
  });
  const [send, setSend] = useState(false);
  const dirty =
    values.topic !== draft?.topic ||
    values.subject !== draft?.subject ||
    values.body !== draft?.body;
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => {
    props.onDirtyChange(dirty);
    return () => props.onDirtyChange(false);
  }, [dirty, props.onDirtyChange]);
  if (!draft)
    return (
      <Alert
        type="warning"
        message="저장된 초안이 없습니다. 수신자 선택부터 다시 진행해 주세요."
      />
    );
  const approved = draft.approvedRevision === draft.revision;
  return (
    <div className="stack">
      <h2>제안 메시지 검토</h2>
      <TemplateNotice {...props} />
      {c.route === "재협업" && (
        <DecisionButtons {...props} busy={busy || dirty} />
      )}
      <div className="editor">
        <aside className="stack">
          {c.route === "재협업" ? (
            <Collaboration company={c} />
          ) : (
            <CompanyEvidence company={c} />
          )}{" "}
          {c.reviewNote && (
            <div className="hint">재접촉 승인 근거: {c.reviewNote}</div>
          )}
        </aside>
        <section>
          <div className="row section-gap">
            <span>
              수신자 {c.recipient?.name} · {c.recipient?.email}
            </span>
            <Button
              disabled={busy || dirty}
              onClick={() => void execute({ type: "changeRecipient" })}
            >
              수신자 변경
            </Button>
          </div>
          <Field label="프로젝트 주제">
            <Input
              disabled={busy}
              value={values.topic}
              onChange={(e) => setValues({ ...values, topic: e.target.value })}
            />
          </Field>
          <Field label="제목">
            <Input
              disabled={busy}
              value={values.subject}
              onChange={(e) =>
                setValues({ ...values, subject: e.target.value })
              }
            />
          </Field>
          <Field label="본문">
            <Input.TextArea
              disabled={busy}
              rows={13}
              value={values.body}
              onChange={(e) => setValues({ ...values, body: e.target.value })}
            />
          </Field>
          <Button disabled title="지정 템플릿·생성 API 연결 예정">
            AI 재생성 · 연결 예정
          </Button>
          <div className="actions">
            <span role="status" className="muted">
              {busy
                ? "저장 중…"
                : dirty
                  ? "저장하지 않은 변경 있음"
                  : `저장됨 · 버전 ${draft.revision}`}
            </span>
            <Space>
              <Button
                disabled={!dirty || busy}
                onClick={() => void execute({ type: "saveDraft", values })}
              >
                초안 저장
              </Button>
              {approved ? (
                <Button
                  type="primary"
                  disabled={dirty || busy}
                  onClick={() => setSend(true)}
                >
                  최종 확인
                </Button>
              ) : (
                <Button
                  type="primary"
                  loading={busy}
                  disabled={
                    dirty ||
                    !values.topic.trim() ||
                    !values.subject.trim() ||
                    !values.body.trim()
                  }
                  onClick={() =>
                    void execute({
                      type: "approveDraft",
                      revision: draft.revision,
                    })
                  }
                >
                  검토 완료
                </Button>
              )}
            </Space>
          </div>
          {dirty && (
            <p className="meta">
              먼저 초안을 저장한 뒤 검토하거나 수신자를 변경해 주세요. 저장 실패
              시 입력은 유지됩니다.
            </p>
          )}
        </section>
      </div>
      <Modal
        title="발송 전 최종 확인"
        open={send}
        onCancel={() => !busy && setSend(false)}
        confirmLoading={busy}
        cancelButtonProps={{ disabled: busy }}
        okText="발송 시뮬레이션"
        cancelText="취소"
        onOk={async () => {
          if (
            await execute({
              type: "recordSimulatedSend",
              revision: draft.revision,
            })
          )
            setSend(false);
        }}
      >
        <Alert
          type="info"
          message="실제 메일을 보내지 않습니다. 개발용 기록만 저장합니다."
        />
        <p>
          {c.name} · {c.recipient?.name} · {c.recipient?.email}
        </p>
        <strong>{draft.subject}</strong>
        <p className="message-body">{draft.body}</p>
      </Modal>
    </div>
  );
}
