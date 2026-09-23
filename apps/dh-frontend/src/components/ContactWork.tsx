import type { WorkProps } from "./workTypes";
import { DecisionButtons, TemplateNotice } from "./WorkShared";
import { Alert, Button, Input, Select } from "antd";
import { useEffect, useState } from "react";
import type { Reason, ResponseResult } from "../models/outreach";
import { reasons, results } from "../models/outreach";
import { excluded, inactiveStages } from "../models/policy";
import { Collaboration, CompanyEvidence, Field, History } from "./Shared";
import { MessageEditor } from "./MessageEditor";

export function ContactWork(props: WorkProps) {
  const c = props.company;
  if (inactiveStages.includes(c.stage))
    return (
      <Alert
        showIcon
        type="info"
        message={
          c.stage === "논의 중"
            ? "현재 논의 중 · 리스트업 제외"
            : `${c.stage} 처리됨`
        }
        description={
          c.stage === "이번 차수 건너뛰기"
            ? "다음 수주 차수에 다시 검토합니다."
            : c.stage === "영구 제외"
              ? "앞으로의 차수에서도 검토 대상으로 돌아오지 않습니다."
              : c.decisionNote ||
                "기록은 발송·컨택 이력에서 확인할 수 있습니다."
        }
      />
    );
  if (c.stage === "응답 확인") return <ResponseForm {...props} />;
  if (c.stage === "기업 검토") return <CompanyReview {...props} />;
  if (c.stage === "관계자 선택") return <RecipientSelection {...props} />;
  return <MessageEditor {...props} />;
}
function CompanyReview(props: WorkProps) {
  const { company: c, execute, busy } = props;
  const [note, setNote] = useState(c.reviewNote || ""),
    [evidence, setEvidence] = useState(c.conditionEvidence || "");
  useEffect(() => {
    props.onDirtyChange(
      note !== (c.reviewNote || "") || evidence !== (c.conditionEvidence || ""),
    );
    return () => props.onDirtyChange(false);
  }, [note, evidence, c.reviewNote, c.conditionEvidence, props.onDirtyChange]);
  return (
    <div className="stack">
      <h2>{c.route === "재협업" ? "재협업 컨택" : "기업 검토 요약"}</h2>
      {c.route === "재협업" ? (
        <Collaboration company={c} />
      ) : c.route === "재접촉" ? (
        <>
          <div className="hint">
            <strong>이전 거절·보류</strong>
            <p>{c.recontact?.reason || c.reason}</p>
            <p>{c.recontact?.reply || "이전 답변 원문 미등록"}</p>
            <p>재접촉 조건: {c.recontact?.condition || "확인 필요"}</p>
            <p>
              {c.recontact?.contact?.name} · {c.recontact?.contact?.email}
            </p>
          </div>
          <Field label="지금 달라진 조건·확인 근거">
            <Input.TextArea
              value={evidence}
              disabled={busy}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </Field>
          <Field label="이번 재접촉 승인 사유">
            <Input.TextArea
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </>
      ) : (
        <CompanyEvidence company={c} />
      )}{" "}
      {c.route === "다른 관계자" && (
        <Alert
          showIcon
          message="이전 차수 무응답 확인 완료"
          description={`${c.previousContact?.name || "기존 접촉자"}를 제외한 다른 관계자에게 제안할 수 있습니다.`}
        />
      )}
      <div className="actions">
        <DecisionButtons {...props} />
        <Button
          type="primary"
          loading={busy}
          disabled={c.route === "재접촉" && !note.trim()}
          onClick={() =>
            void execute({
              type: "approveCompany",
              reviewNote: note,
              conditionEvidence: evidence,
            })
          }
        >
          {c.route === "다른 관계자"
            ? "다른 관계자에게 제안"
            : "승인·관계자 선택"}
        </Button>
      </div>
    </div>
  );
}
function RecipientSelection(props: WorkProps) {
  const { company: c, execute, busy } = props;
  const candidates = [
    ...(c.route === "재접촉" && c.recontact?.contact
      ? [c.recontact.contact]
      : []),
    ...(c.contacts || []),
  ].filter(
    (p, i, a) => a.findIndex((x) => x.id === p.id) === i && !excluded(c, p),
  );
  return (
    <div className="stack">
      {c.route === "재협업" && (
        <>
          <Collaboration company={c} />
          <DecisionButtons {...props} />
        </>
      )}
      <h2>
        {c.route === "다른 관계자" ? "다른 관계자 선택" : "연락할 관계자 선택"}
      </h2>
      {c.reviewNote && (
        <div className="hint">재접촉 승인 근거: {c.reviewNote}</div>
      )}
      <div>
        <Button
          loading={busy}
          onClick={() => void execute({ type: "searchContacts" })}
        >
          {c.contacts ? "관계자 다시 탐색" : "관계자 탐색"}
        </Button>
      </div>
      {c.route === "다른 관계자" && c.previousContact && (
        <Alert
          message={`기존 접촉자 ${c.previousContact.name} · 선택 불가`}
          description="다른 이메일도 같은 사람으로 취급합니다."
        />
      )}
      {c.prelaunchContacts?.length && (
        <Alert
          message="배포 전 LinkedIn 컨택 · 신규 경로"
          description={`후보 제외: ${c.prelaunchContacts.map((p) => p.name).join(", ")}`}
        />
      )}{" "}
      {candidates.map((p) => (
        <div className="contact row" key={p.id}>
          <div>
            <strong>{p.name}</strong> · {p.role}
            <div className="meta">{p.email}</div>
            <div className="meta">LinkedIn 활동 미조사 · 샘플 연락처</div>
          </div>
          <Button
            disabled={busy}
            type={c.recipient?.id === p.id ? "primary" : "default"}
            onClick={() =>
              void execute({ type: "selectRecipient", contactId: p.id })
            }
          >
            {c.recipient?.id === p.id ? "선택됨" : "선택"}
          </Button>
        </div>
      ))}
      {c.contacts && !candidates.length && (
        <Alert message="선택 가능한 관계자가 없습니다." />
      )}
      <TemplateNotice {...props} />
      {c.recipient && (
        <div className="actions">
          <span>선택 수신자: {c.recipient.name}</span>
          <Button
            type="primary"
            loading={busy}
            disabled={!c.draft && !props.templates[c.route]}
            onClick={() => void execute({ type: "generateDraft" })}
          >
            {c.draft ? "기존 초안 이어서 검토" : "조사·초안 생성"}
          </Button>
        </div>
      )}
    </div>
  );
}
function ResponseForm({
  company: c,
  cycle,
  execute,
  busy,
  onDirtyChange,
}: WorkProps) {
  const [result, setResult] = useState<ResponseResult>(),
    [category, setCategory] = useState<Reason>(),
    [note, setNote] = useState(""),
    [revisit, setRevisit] = useState("");
  useEffect(() => {
    onDirtyChange(!!result || !!note || !!revisit);
    return () => onDirtyChange(false);
  }, [result, note, revisit, onDirtyChange]);
  const blocked = c.lastSentCycleId === cycle.id;
  const needsReason = result === "거절" || result === "보류";
  const valid =
    result &&
    (!needsReason || (category && (category !== "기타" || note.trim())));
  return (
    <div className="stack">
      <h2>응답 확인</h2>
      <History company={c} />
      {c.response && (
        <div className="hint">
          <strong>최근 응답 확인: {c.response.result}</strong>
          <p>
            {c.response.category} {c.response.note}
          </p>
          <p>{c.response.revisit}</p>
          <div className="meta">
            {c.response.by} ·{" "}
            {new Date(c.response.time).toLocaleString("ko-KR")}
          </div>
        </div>
      )}
      <Alert
        showIcon
        message={
          blocked
            ? "이번 차수 추가 컨택 불가"
            : "이전 차수 발송 · 실제 응답 확인 필요"
        }
        description={
          blocked
            ? "무응답이어도 다음 차수까지 다른 관계자에게 보내지 않습니다."
            : "실제 응답을 확인한 뒤 무응답이라면 다른 관계자 재컨택을 검토합니다."
        }
      />
      <Field label="확인 결과">
        <Select
          disabled={busy}
          value={result}
          placeholder="응답 결과 선택"
          onChange={(v) => {
            setResult(v);
            setCategory(undefined);
          }}
          options={results.map((value) => ({ value, label: value }))}
        />
      </Field>
      {needsReason && (
        <Field label="사유 카테고리 (필수)">
          <Select
            disabled={busy}
            value={category}
            onChange={setCategory}
            options={reasons.map((value) => ({ value, label: value }))}
          />
        </Field>
      )}
      <Field
        label={category === "기타" ? "기타 사유 (필수)" : "확인 내용 (선택)"}
      >
        <Input.TextArea
          disabled={busy}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {result === "보류" && (
        <Field label="재논의 시점·조건 (선택)">
          <Input
            disabled={busy}
            value={revisit}
            onChange={(e) => setRevisit(e.target.value)}
          />
        </Field>
      )}
      {result === "담당자 안내" && (
        <Alert message="안내 내용만 저장합니다. 같은 차수 재접촉 정책은 미정입니다." />
      )}
      <Button
        type="primary"
        loading={busy}
        disabled={!valid}
        onClick={async () => {
          if (
            result &&
            (await execute({
              type: "saveResponse",
              values: {
                result,
                category: needsReason ? category : undefined,
                note,
                revisit: result === "보류" ? revisit : "",
              },
            }))
          ) {
            setResult(undefined);
            setCategory(undefined);
            setNote("");
            setRevisit("");
          }
        }}
      >
        {result === "답변 없음" && !blocked
          ? "무응답 확인·재컨택 검토로"
          : "결과 저장"}
      </Button>
    </div>
  );
}
