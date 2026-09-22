import { Alert, Button, Input, Modal, Space } from "antd";
import { useState } from "react";
import type { WorkProps } from "./workTypes";
import { Field } from "./Shared";
export function DecisionButtons({ company: c, execute, busy }: WorkProps) {
  const [decision, setDecision] = useState<"skipForCycle" | "excludeCompany">();
  const [note, setNote] = useState("");
  return (
    <>
      <Space>
        {c.route !== "신규 컨택" && (
          <Button
            disabled={busy}
            onClick={() => {
              setNote("");
              setDecision("skipForCycle");
            }}
          >
            이번 차수 건너뛰기
          </Button>
        )}
        <Button
          disabled={busy}
          onClick={() => {
            setNote("");
            setDecision("excludeCompany");
          }}
        >
          영구 제외
        </Button>
      </Space>
      <Modal
        title={decision === "skipForCycle" ? "이번 차수 건너뛰기" : "영구 제외"}
        open={!!decision}
        onCancel={() => !busy && setDecision(undefined)}
        confirmLoading={busy}
        cancelButtonProps={{ disabled: busy }}
        okText="저장"
        cancelText="취소"
        onOk={async () => {
          if (decision && (await execute({ type: decision, note })))
            setDecision(undefined);
        }}
      >
        <Alert
          message={
            decision === "skipForCycle"
              ? "다음 수주 차수에 다시 검토합니다."
              : "앞으로의 차수에서도 검토 목록에 나타나지 않습니다."
          }
        />
        <div className="block">
          <Field
            label={
              c.route === "재협업"
                ? "재협업하지 않는 사유 (필수)"
                : "메모 (선택)"
            }
          >
            <Input.TextArea
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}

export function TemplateNotice({
  company: c,
  templates,
}: Pick<WorkProps, "company" | "templates">) {
  const t = templates[c.route];
  return (
    <Alert
      type={t ? "info" : "warning"}
      showIcon
      message={
        t
          ? `연결 템플릿: ${t.id} · ${t.version}`
          : `${c.route} · 템플릿 연결 필요`
      }
      description={
        c.draft
          ? "기존 초안은 보존됩니다. 수신자를 변경했다면 본문 인사말도 확인해 주세요."
          : "지정된 템플릿을 연결해야 새 초안을 생성할 수 있습니다."
      }
    />
  );
}
