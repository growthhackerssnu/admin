import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MessageDraftEditor } from "./MessageDraftEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { useAlignedScroll } from "@/design-system/use-aligned-scroll";
import { projectSchedule } from "../messageTemplate";
import { canCopy, draftCurrent, type Actor, type Candidate } from "./contracts";
import { type Change } from "./CandidateReview";
import "./message-composer.css";

/** Same center-pane layout as the agreed unified workspace: recipient/quarter,
 * direct subject/body editing, and a footer outside the scrolling content. */
export function MessageComposer({
  candidate,
  actor,
  quarters,
  change,
  addQuarter,
  pending,
  onDirty,
  recipientControls,
  onReopen,
}: {
  candidate: Candidate;
  actor: Actor;
  quarters: string[];
  change: Change;
  addQuarter: (value: string) => Promise<boolean>;
  pending: boolean;
  onDirty: (dirty: boolean) => void;
  recipientControls?: ReactNode;
  onReopen?: () => void;
}) {
  const scrollRef = useAlignedScroll();
  const [subject, setSubject] = useState(candidate.draft?.subject ?? "");
  const [body, setBody] = useState(candidate.draft?.body ?? "");
  const [addingQuarter, setAddingQuarter] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [part, setPart] = useState(1);
  const [notice, setNotice] = useState("");
  const { confirm, dialog } = useConfirmation();
  const dirty =
    Boolean(candidate.draft) &&
    (subject !== (candidate.draft?.subject ?? "") ||
      body !== (candidate.draft?.body ?? ""));
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    setSubject(candidate.draft?.subject ?? "");
    setBody(candidate.draft?.body ?? "");
  }, [candidate.draft]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const sent = candidate.sent.length > 0;
  const owned = candidate.owner?.id === actor.id;
  const locked =
    pending || !owned || candidate.reviewStatus !== "approved" || sent;
  const current = draftCurrent(candidate);
  const copyable = canCopy(candidate) && !dirty;
  const sentRecord = candidate.sent[0];
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("복사했습니다.");
    } catch {
      setNotice("복사하지 못했습니다. 내용을 직접 선택해주세요.");
    }
  };
  const generate = async () => {
    if (
      candidate.draft &&
      !(await confirm(
        "현재 초안을 저장된 조사 자료로 다시 생성할까요?",
        "메시지 다시 생성",
        "다시 생성",
      ))
    )
      return;
    if (await change(candidate, { type: "generate" })) setNotice("");
  };
  return (
    <section className="uw-composer" aria-label="메시지 작성">
      {dialog}
      <div ref={scrollRef} className="uw-focus-scroll uw-message-scroll">
        <div className="uw-message-content">
          {!sent ? (
            <>
              <div className="uw-message-toolbar">
                {recipientControls ?? (
                  <div className="uw-message-recipient">
                    <h2>수신자</h2>
                    <strong>
                      {candidate.recipient?.name ?? "관계자 없음"}
                    </strong>
                    <p>
                      {candidate.recipient?.title} ·{" "}
                      {candidate.recipient?.channel === "linkedin"
                        ? "LinkedIn"
                        : "이메일"}
                    </p>
                  </div>
                )}
                <div className="uw-message-quarter">
                  <Field>
                    <FieldLabel htmlFor="uw-message-quarter" required>
                      목표 분기
                    </FieldLabel>
                    <Select
                      disabled={locked || dirty}
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
                      <SelectContent
                        className="dw-select-content"
                        position="popper"
                      >
                        {quarters.map((q) => (
                          <SelectItem key={q} value={q}>
                            {q.replace("-Q", "년 ")}분기
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Button
                    variant="link"
                    size="sm"
                    disabled={locked || dirty}
                    onClick={() => setAddingQuarter(!addingQuarter)}
                  >
                    분기 추가
                  </Button>
                </div>
              </div>
              {addingQuarter && (
                <div className="uw-message-quarter-fields">
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
                        await change(candidate, { type: "quarter", quarter });
                      }
                    }}
                  >
                    추가하고 선택
                  </Button>
                </div>
              )}
              {candidate.quarter && (
                <p className="uw-message-period">
                  제안 기간 · {projectSchedule(candidate.quarter).period}
                </p>
              )}
              {candidate.draft && !current && (
                <p className="uw-message-warning" role="status">
                  분기·수신자 또는 조사 자료가 변경되었습니다. 다시
                  생성해주세요.
                </p>
              )}
            </>
          ) : (
            <p className="uw-message-sent-meta">
              {sentRecord.draft.quarter} · {sentRecord.draft.recipient.name} ·{" "}
              {new Date(sentRecord.at).toLocaleString("ko-KR")} 발송 완료
            </p>
          )}
          {notice && (
            <p className="uw-message-notice" role="status">
              {notice}
            </p>
          )}
          {candidate.draft || sentRecord ? (
            <MessageDraftEditor subject={sent ? sentRecord.draft.subject : subject} body={sent ? sentRecord.draft.body : body}
              onSubject={setSubject} onBody={setBody} pending={pending} readOnly={locked} sent={sent} />
          ) : (
            <Empty className="uw-message-empty">
              <EmptyHeader>
                <EmptyTitle>메시지 미생성</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
          {sent && (
            <details className="uw-message-history">
              <summary>발송 기록 {candidate.sent.length}건</summary>
              {candidate.sent.map((item) => (
                <p key={item.id}>
                  {item.draft.quarter} · {item.draft.recipient.name} ·{" "}
                  {new Date(item.at).toLocaleString("ko-KR")}
                </p>
              ))}
            </details>
          )}
        </div>
      </div>
      {!sent && owned && (
        <footer className="uw-focus-footer uw-message-footer">
          {onReopen && (
            <Button
              variant="ghost"
              size="sm"
              className="uw-message-reopen"
              disabled={pending || dirty}
              onClick={onReopen}
            >
              판단 변경
            </Button>
          )}
          {dirty ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={async () => {
                  if (
                    await confirm(
                      "저장하지 않은 수정을 취소할까요?",
                      "수정 취소",
                      "수정 버리기",
                    )
                  ) {
                    setSubject(candidate.draft?.subject ?? "");
                    setBody(candidate.draft?.body ?? "");
                  }
                }}
              >
                수정 취소
              </Button>
              <Button
                size="sm"
                disabled={locked || !subject.trim() || !body.trim()}
                onClick={async () => {
                  if (
                    await change(candidate, {
                      type: "saveDraft",
                      subject,
                      body,
                    })
                  )
                    setNotice("수정 내용을 저장했습니다.");
                }}
              >
                수정 저장
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant={!candidate.draft || !current ? "default" : "outline"}
                disabled={locked || !candidate.quarter || !candidate.recipient}
                onClick={() => void generate()}
              >
                {pending && <Spinner />}
                {candidate.draft ? "다시 생성" : "메시지 생성"}
              </Button>
              {candidate.draft && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={locked || !copyable}
                    onClick={() => void copy(candidate.draft!.subject)}
                  >
                    제목 복사
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={locked || !copyable}
                    onClick={() => void copy(candidate.draft!.body)}
                  >
                    본문 복사
                  </Button>
                  <Button
                    size="sm"
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
                </>
              )}
            </>
          )}
          {!candidate.quarter && (
            <div className="uw-action-reason">
              <Button
                variant="link"
                size="sm"
                onClick={() =>
                  document.getElementById("uw-message-quarter")?.focus()
                }
              >
                목표 분기 선택
              </Button>
            </div>
          )}
        </footer>
      )}
    </section>
  );
}
