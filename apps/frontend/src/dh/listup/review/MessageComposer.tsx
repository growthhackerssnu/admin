import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { WorkspaceStatus } from "@/components/ui/workspace-status";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { projectSchedule } from "../messageTemplate";
import { canCopy, draftCurrent, type Actor, type Candidate } from "./contracts";
import { type Change } from "./CandidateReview";
import "./message-composer.css";

/** Message work stays inside the selected company's center pane. */
export function MessageComposer({
  candidate,
  actor,
  quarters,
  change,
  addQuarter,
  pending,
  onDirty,
}: {
  candidate: Candidate;
  actor: Actor;
  quarters: string[];
  change: Change;
  addQuarter: (value: string) => Promise<boolean>;
  pending: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(candidate.draft?.subject ?? "");
  const [body, setBody] = useState(candidate.draft?.body ?? "");
  const [addingQuarter, setAddingQuarter] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [part, setPart] = useState(1);
  const [notice, setNotice] = useState("");
  const { confirm, dialog } = useConfirmation();
  const dirty =
    editing &&
    (subject !== (candidate.draft?.subject ?? "") ||
      body !== (candidate.draft?.body ?? ""));
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!editing) {
      setSubject(candidate.draft?.subject ?? "");
      setBody(candidate.draft?.body ?? "");
    }
  }, [candidate.draft, editing]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const sent = candidate.sent.length > 0;
  const approved = candidate.reviewStatus === "approved";
  const locked =
    pending || candidate.owner?.id !== actor.id || !approved || sent;
  const current = draftCurrent(candidate);
  const copyable = canCopy(candidate) && !editing;
  const generateDisabled =
    locked || editing || !candidate.quarter || !candidate.recipient;
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("복사했습니다.");
    } catch {
      setNotice("복사하지 못했습니다. 메시지에서 내용을 직접 선택해주세요.");
    }
  };
  return (
    <section className="uw-composer" aria-label="메시지 작성">
      {dialog}
      <div className="uw-composer-heading">
        <h2>제안 메시지</h2>
        <WorkspaceStatus tone={sent ? "success" : "neutral"}>
          {sent
            ? "발송 완료"
            : candidate.draft && current
              ? "메시지 준비됨"
              : candidate.draft
                ? "다시 생성 필요"
                : "미생성"}
        </WorkspaceStatus>
      </div>
      {!sent && (
        <>
          <div className="uw-composer-tools">
            <Field className="uw-composer-quarter">
              <FieldLabel htmlFor="uw-message-quarter" required>
                목표 분기
              </FieldLabel>
              <Select
                disabled={locked || editing}
                value={candidate.quarter ?? ""}
                onValueChange={(quarter) =>
                  void change(candidate, { type: "quarter", quarter })
                }
              >
                <SelectTrigger
                  id="uw-message-quarter"
                  aria-label="메시지 목표 분기"
                  aria-required="true"
                >
                  <SelectValue placeholder="분기 선택" />
                </SelectTrigger>
                <SelectContent className="dw-select-content" position="popper">
                  {quarters.map((q) => (
                    <SelectItem key={q} value={q}>
                      {q.replace("-Q", "년 ")}분기
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button
              variant="ghost"
              size="sm"
              disabled={locked || editing}
              onClick={() => setAddingQuarter(!addingQuarter)}
            >
              분기 추가
            </Button>
            <div className="uw-composer-edit-actions">
              {editing ? (
                <>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={async () => {
                      if (
                        !dirty ||
                        (await confirm(
                          "저장하지 않은 수정을 취소할까요?",
                          "수정 취소",
                          "수정 버리기",
                        ))
                      )
                        setEditing(false);
                    }}
                  >
                    수정 취소
                  </Button>
                  <Button
                    disabled={
                      locked || !dirty || !subject.trim() || !body.trim()
                    }
                    onClick={async () => {
                      if (
                        await change(candidate, {
                          type: "saveDraft",
                          subject,
                          body,
                        })
                      ) {
                        setEditing(false);
                        setNotice("수정 내용을 저장했습니다.");
                      }
                    }}
                  >
                    수정 저장
                  </Button>
                </>
              ) : (
                <>
                  {candidate.draft && (
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() => setEditing(true)}
                    >
                      내용 수정
                    </Button>
                  )}
                  <Button
                    variant={!candidate.draft || !current ? "default" : "ghost"}
                    disabled={generateDisabled}
                    onClick={async () => {
                      if (
                        candidate.draft &&
                        !(await confirm(
                          "현재 초안을 저장된 조사 자료로 다시 생성할까요?",
                          "메시지 다시 생성",
                          "다시 생성",
                        ))
                      )
                        return;
                      if (await change(candidate, { type: "generate" }))
                        setNotice("메시지를 생성했습니다.");
                    }}
                  >
                    {pending && <Spinner />}
                    {candidate.draft ? "다시 생성" : "메시지 생성"}
                  </Button>
                </>
              )}
            </div>
          </div>
          {addingQuarter && (
            <div className="uw-composer-quarter-fields">
              <Field>
                <FieldLabel htmlFor="uw-quarter-year">연도</FieldLabel>
                <Input
                  id="uw-quarter-year"
                  type="number"
                  min={2000}
                  max={2100}
                  disabled={locked}
                  value={year}
                  onChange={(e) => setYear(e.target.valueAsNumber)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="uw-quarter-part">분기</FieldLabel>
                <Select
                  disabled={locked}
                  value={String(part)}
                  onValueChange={(value) => setPart(Number(value))}
                >
                  <SelectTrigger id="uw-quarter-part">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    className="dw-select-content"
                    position="popper"
                  >
                    {[1, 2, 3, 4].map((q) => (
                      <SelectItem key={q} value={String(q)}>
                        {q}분기
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Button
                variant="outline"
                disabled={
                  locked ||
                  !Number.isInteger(year) ||
                  year < 2000 ||
                  year > 2100
                }
                onClick={async () => {
                  const quarter = `${year}-Q${part}`;
                  if (await addQuarter(quarter)) {
                    setAddingQuarter(false);
                    if (await change(candidate, { type: "quarter", quarter }))
                      setNotice("목표 분기를 선택했습니다.");
                  }
                }}
              >
                추가하고 선택
              </Button>
            </div>
          )}
          {candidate.quarter && (
            <p className="uw-composer-hint">
              제안 기간 · {projectSchedule(candidate.quarter).period}
            </p>
          )}
          {!candidate.quarter && (
            <p className="uw-composer-hint">
              목표 분기를 선택하면 메시지를 생성할 수 있습니다.
            </p>
          )}
          {candidate.draft && !current && (
            <p className="uw-composer-warning" role="status">
              분기·수신자 또는 조사 자료가 변경되었습니다. 현재 설정으로 다시
              생성해주세요.
            </p>
          )}
        </>
      )}
      {notice && (
        <p className="uw-composer-notice" role="status">
          {notice}
        </p>
      )}
      {candidate.draft && (
        <div className="uw-composer-paper">
          {editing ? (
            <>
              <Field>
                <FieldLabel htmlFor="uw-message-subject" required>
                  제목
                </FieldLabel>
                <Input
                  id="uw-message-subject"
                  aria-required="true"
                  disabled={pending}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="uw-message-body" required>
                  본문
                </FieldLabel>
                <Textarea
                  id="uw-message-body"
                  aria-required="true"
                  disabled={pending}
                  rows={18}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              <h3>{candidate.draft.subject}</h3>
              <div className="uw-composer-body">{candidate.draft.body}</div>
            </>
          )}
        </div>
      )}
      {!sent && candidate.draft && (
        <div className="uw-composer-send">
          {editing && (
            <span className="uw-composer-hint">
              수정을 저장하거나 취소한 뒤 복사할 수 있습니다.
            </span>
          )}
          <div className="uw-composer-send-actions">
            <Button
              variant="outline"
              disabled={locked || !copyable}
              onClick={() => void copy(candidate.draft!.subject)}
            >
              제목 복사
            </Button>
            <Button
              variant="outline"
              disabled={locked || !copyable}
              onClick={() => void copy(candidate.draft!.body)}
            >
              본문 복사
            </Button>
            <Button
              variant={copyable ? "default" : "outline"}
              disabled={locked || !copyable}
              onClick={async () => {
                if (
                  await confirm(
                    "외부 채널에서 실제 전송을 마쳤나요? 완료를 기록하면 첫 발송 상태로 저장됩니다.",
                    "발송 완료 기록",
                    "완료 기록",
                  )
                )
                  void change(candidate, { type: "send" });
              }}
            >
              발송 완료 표시
            </Button>
          </div>
        </div>
      )}
      {sent && (
        <details className="uw-composer-history">
          <summary>발송 기록 {candidate.sent.length}건</summary>
          {candidate.sent.map((item) => (
            <article key={item.id}>
              <strong>
                {item.draft.quarter} · {item.draft.recipient.name}
              </strong>
              <p>
                {new Date(item.at).toLocaleString("ko-KR")} ·{" "}
                {item.draft.recipient.channel === "linkedin"
                  ? "LinkedIn"
                  : "이메일"}
              </p>
              <details>
                <summary>당시 메시지 보기</summary>
                <h3>{item.draft.subject}</h3>
                <div className="uw-composer-body">{item.draft.body}</div>
              </details>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
