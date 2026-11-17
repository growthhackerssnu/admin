import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceStatus } from "@/components/ui/workspace-status";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import {
  allowedReplyTransitions,
  replyNeedsConfirmation,
  replyNoteMax,
  replyNoteRequired,
  replyStatusLabels,
  replyStatusTones,
  revisitConditionApplies,
  revisitConditionMax,
  type RecordableReplyStatus,
  type ReplyRecord,
  type ReplyRecordInput,
  type ReplyStatus,
} from "./replyStatus";
import "./reply-status.css";

/** 발송한 연락의 회신 상태: 현재 상태, 사람이 남긴 마지막 기록, 상태 변경 폼.
 * 저장과 권한 판단은 부모 화면에 둔다. */
export function ReplyStatusSection({
  status,
  latest,
  subject,
  canRecord,
  pending,
  onRecord,
  onDirty,
  collapsed = false,
  showStatus = true,
  headingLevel = "h2",
}: {
  /** 결과가 기록된 적 없는 과거 발송은 null. */
  status: ReplyStatus | null;
  latest?: ReplyRecord | null;
  /** 확인 문구에 쓰는 기업 이름. */
  subject: string;
  canRecord: boolean;
  pending: boolean;
  onRecord: (input: ReplyRecordInput) => Promise<boolean>;
  onDirty?: (dirty: boolean) => void;
  /** 폼을 "상태 변경" 버튼 뒤에 접어 둔다. 여러 연락이 한 목록에 있을 때 쓴다. */
  collapsed?: boolean;
  /** 같은 자리에 이미 상태 배지가 있으면 false로 제목 줄을 생략한다. */
  showStatus?: boolean;
  headingLevel?: "h2" | "h3" | "h4";
}) {
  const id = useId();
  const [open, setOpen] = useState(!collapsed);
  const [result, setResult] = useState<RecordableReplyStatus | "">("");
  const [note, setNote] = useState("");
  const [revisit, setRevisit] = useState("");
  const [noteError, setNoteError] = useState("");
  const { confirm, dialog } = useConfirmation();
  const options = allowedReplyTransitions(status);
  const correcting = replyNoteRequired(status);
  const showRevisit = revisitConditionApplies(result);
  const dirty = Boolean(result || note.trim() || revisit.trim());
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);
  const reset = () => {
    setResult("");
    setNote("");
    setRevisit("");
    setNoteError("");
    if (collapsed) setOpen(false);
  };
  const submit = async () => {
    if (!result) return;
    if (correcting && !note.trim()) {
      setNoteError("이미 기록한 결과를 바꾸려면 메모를 적어주세요.");
      document.getElementById(`${id}-note`)?.focus();
      return;
    }
    const label = replyStatusLabels[result];
    if (
      replyNeedsConfirmation(result) &&
      !(await confirm(
        `${subject}의 회신 상태를 ${label}로 기록할까요? 기록한 뒤에도 다시 바꿀 수 있습니다.`,
        `${label} 기록`,
        `${label}로 기록`,
      ))
    )
      return;
    if (
      await onRecord({
        result,
        note,
        ...(showRevisit ? { revisitCondition: revisit } : {}),
      })
    )
      reset();
  };
  const Heading = headingLevel;
  return (
    <section className="rs-section" aria-label="회신 상태">
      {dialog}
      {showStatus && (
        <div className="rs-head">
          <Heading>회신 상태</Heading>
          <WorkspaceStatus tone={status ? replyStatusTones[status] : "neutral"}>
            {status ? replyStatusLabels[status] : "결과 미기록"}
          </WorkspaceStatus>
        </div>
      )}
      {latest ? (
        <dl className="rs-record">
          <div>
            <dt>마지막 기록</dt>
            <dd>
              {replyStatusLabels[latest.status]} ·{" "}
              {latest.recordedBy ?? "기록자 미확인"} ·{" "}
              {new Date(latest.recordedAt).toLocaleString("ko-KR")}
            </dd>
          </div>
          {latest.note && (
            <div>
              <dt>메모</dt>
              <dd>{latest.note}</dd>
            </div>
          )}
          {latest.revisitCondition && (
            <div>
              <dt>다시 연락할 시기·조건</dt>
              <dd>{latest.revisitCondition}</dd>
            </div>
          )}
        </dl>
      ) : (
        showStatus && (
          <p className="rs-empty">아직 기록한 내용이 없습니다.</p>
        )
      )}
      {!canRecord && (
        <p className="rs-empty">
          회신 상태는 이 연락의 담당자와 팀장·관리자만 기록할 수 있습니다.
        </p>
      )}
      {canRecord && !open && (
        <div className="rs-actions rs-actions-start">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setOpen(true)}
          >
            {status && status !== "pending" ? "회신 상태 변경" : "회신 상태 기록"}
          </Button>
        </div>
      )}
      {canRecord && open && (
        <div className="rs-form">
          <Field>
            <FieldLabel htmlFor={`${id}-result`}>상태 변경</FieldLabel>
            <Select
              value={result}
              disabled={pending}
              onValueChange={(value) => {
                setResult(value as RecordableReplyStatus);
                setNoteError("");
              }}
            >
              <SelectTrigger id={`${id}-result`} className="rs-result">
                <SelectValue placeholder="바꿀 상태 선택" />
              </SelectTrigger>
              <SelectContent position="popper" className="dw-select-content">
                {options.map((value) => (
                  <SelectItem key={value} value={value}>
                    {replyStatusLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {result && (
            <>
              <Field>
                <FieldLabel htmlFor={`${id}-note`} required={correcting}>
                  {correcting ? "메모" : "메모 (선택)"}
                </FieldLabel>
                <Textarea
                  id={`${id}-note`}
                  rows={2}
                  maxLength={replyNoteMax}
                  value={note}
                  readOnly={pending}
                  aria-required={correcting ? "true" : undefined}
                  aria-invalid={Boolean(noteError)}
                  aria-describedby={
                    noteError
                      ? `${id}-note-error`
                      : correcting
                        ? `${id}-note-help`
                        : undefined
                  }
                  onChange={(event) => {
                    setNote(event.target.value);
                    if (noteError) setNoteError("");
                  }}
                />
                {correcting && !noteError && (
                  <FieldDescription id={`${id}-note-help`}>
                    이미 기록한 결과를 바꾸는 정정이라 메모가 필요합니다.
                  </FieldDescription>
                )}
                {noteError && (
                  <FieldError id={`${id}-note-error`}>{noteError}</FieldError>
                )}
              </Field>
              {showRevisit && (
                <Field>
                  <FieldLabel htmlFor={`${id}-revisit`}>
                    다시 연락할 시기·조건 (선택)
                  </FieldLabel>
                  <Input
                    id={`${id}-revisit`}
                    maxLength={revisitConditionMax}
                    value={revisit}
                    readOnly={pending}
                    aria-describedby={`${id}-revisit-help`}
                    onChange={(event) => setRevisit(event.target.value)}
                  />
                  <FieldDescription id={`${id}-revisit-help`}>
                    예: 내년 1분기에 다시 논의하기로 함. 다음에 연락할 때 양식에
                    반영됩니다
                  </FieldDescription>
                </Field>
              )}
            </>
          )}
          {(result || collapsed) && (
            <div className="rs-actions">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={reset}
              >
                취소
              </Button>
              <Button
                size="sm"
                disabled={pending || !result}
                onClick={() => void submit()}
              >
                {pending && <Spinner />}
                상태 기록
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
