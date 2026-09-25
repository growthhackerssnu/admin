import { Alert, Checkbox, Input, Modal, Select } from "antd";
import { useState } from "react";
import type { SearchInput } from "../models/outreach";
import { Field } from "./Shared";
export function SearchDialog({
  fresh,
  startedAt,
  busy,
  onClose,
  onSearch,
}: {
  fresh: boolean;
  startedAt: string;
  busy: boolean;
  onClose: () => void;
  onSearch: (input: SearchInput) => Promise<boolean>;
}) {
  const [name, setName] = useState(""),
    [domains, setDomains] = useState(["교육", "커머스"]),
    [sources, setSources] = useState(["등록 소스 A"]);
  return (
    <Modal
      title="새 기업 탐색"
      open
      onCancel={() => !busy && onClose()}
      okText="샘플 탐색 실행"
      cancelText="취소"
      confirmLoading={busy}
      cancelButtonProps={{ disabled: busy }}
      okButtonProps={{
        disabled: !domains.length || !sources.length || (fresh && !name.trim()),
      }}
      onOk={async () => {
        if (
          await onSearch({ newCycle: fresh, name, domains, sources, startedAt })
        )
          onClose();
      }}
    >
      <div className="stack">
        <Alert
          message={
            fresh ? "PM 역할 시연 · 새 수주 차수 시작" : "현재 차수에 후보 추가"
          }
          description={
            fresh
              ? "창을 연 시각을 시작점으로 저장합니다. 취소하면 차수를 만들지 않습니다."
              : "추가 탐색은 현재 차수의 시작 시점을 바꾸지 않습니다."
          }
        />
        {fresh && (
          <Field label="새 수주 차수 이름">
            <Input
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        )}
        <Field label="선호 도메인">
          <Select
            mode="multiple"
            disabled={busy}
            value={domains}
            onChange={setDomains}
            options={["교육", "커머스", "금융", "여행"].map((value) => ({
              value,
              label: value,
            }))}
          />
        </Field>
        <Field label="검색 소스">
          <Checkbox.Group
            disabled={busy}
            options={["등록 소스 A", "등록 소스 B"]}
            value={sources}
            onChange={setSources}
          />
        </Field>
        <p className="meta">
          앱 우선 · 하드웨어/자율주행/신약개발 제외 · 실제 웹 검색 없이 샘플 1개
          추가
        </p>
      </div>
    </Modal>
  );
}
