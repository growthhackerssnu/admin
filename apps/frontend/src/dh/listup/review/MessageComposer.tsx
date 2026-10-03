import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MessageDraftEditor } from "./MessageDraftEditor";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { useAlignedScroll } from "@/design-system/use-aligned-scroll";
import { projectSchedule } from "../messageTemplate";
import { canCopy, draftCurrent, type Actor, type Candidate, type AcquisitionRound, quarterLabel } from "./contracts";
import { type Change } from "./CandidateReview";
import "./message-composer.css";

/** Same center-pane layout as the agreed unified workspace: recipient/quarter,
 * direct subject/body editing, and a footer outside the scrolling content. */
export function MessageComposer({
  candidate,
  actor,
  currentRound,
  roundError,
  retryRound,
  canManageOps,
  change,
  pending,
  onDirty,
  recipientControls,
  onReopen,
}: {
  candidate: Candidate;
  actor: Actor;
  currentRound?: AcquisitionRound | null;
  roundError?: string;
  retryRound?: () => void;
  canManageOps?: boolean;
  change: Change;
  pending: boolean;
  onDirty: (dirty: boolean) => void;
  recipientControls?: ReactNode;
  onReopen?: () => void;
}) {
  const scrollRef = useAlignedScroll(".uw-center");
  const [subject, setSubject] = useState(candidate.draft?.subject ?? "");
  const [body, setBody] = useState(candidate.draft?.body ?? "");
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
    pending || !owned || candidate.reviewStatus !== "approved" || sent || candidate.canEditMessage === false;
  const quarter = candidate.quarter ?? (currentRound ? quarterLabel(currentRound.targetQuarter) : null);
  const quarterIssue = candidate.messageBlockReasons?.includes("round_closed")
    ? "종료된 수주 분기 · 읽기 전용"
    : candidate.messageBlockReasons?.includes("not_owner") ? "다른 담당자의 메시지 업무 · 조회 전용"
    : !candidate.outreachId && roundError ? roundError
    : !candidate.outreachId && !currentRound ? "수주 분기 미설정 · 팀장 설정 필요"
    : candidate.canGenerateMessage === false ? "메시지 생성에 필요한 관계자와 조사 자료를 확인해주세요." : "";
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
                  <p className="uw-message-quarter-label">수주 분기</p>
                  <strong>{quarter ? `${quarter.replace("-Q", "년 ")}분기` : "미설정"}</strong>
                </div>
              </div>
              {quarter && (
                <p className="uw-message-period">제안 기간 · {projectSchedule(quarter).period}</p>
              )}
              {quarterIssue && <div className="uw-message-period" role={roundError ? "alert" : "status"}>
                {quarterIssue}
                {!candidate.outreachId && roundError && retryRound && <Button variant="link" size="sm" disabled={pending} onClick={retryRound}>다시 불러오기</Button>}
                {!candidate.outreachId && !roundError && !currentRound && canManageOps && <a href="/dh?view=operations">수주 분기 설정</a>}
              </div>}
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
              disabled={pending || dirty || candidate.canEditMessage === false}
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
                disabled={locked || Boolean(quarterIssue) || !quarter || !candidate.recipient || !candidate.research}
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
        </footer>
      )}
    </section>
  );
}
