import { useEffect, useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { projectSchedule } from "../messageTemplate";
import {
  canCopy,
  draftCurrent,
  type Actor,
  type Candidate,
} from "./contracts";
import { SourceLink, type Change } from "./CandidateReview";

export function MessagePage({
  candidate,
  actor,
  quarters,
  change,
  addQuarter,
  pending,
  error,
  back,
}: {
  candidate: Candidate;
  actor: Actor;
  quarters: string[];
  change: Change;
  addQuarter: (value: string) => Promise<boolean>;
  pending: boolean;
  error: string;
  back: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(candidate.draft?.subject ?? "");
  const [body, setBody] = useState(candidate.draft?.body ?? "");
  const [addingQuarter, setAddingQuarter] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [part, setPart] = useState(1);
  const [notice, setNotice] = useState("");
  const draftDirty =
    editing &&
    (subject !== (candidate.draft?.subject ?? "") ||
      body !== (candidate.draft?.body ?? ""));
  const dirty = draftDirty;
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
  const owned = candidate.owner?.id === actor.id;
  const locked = pending || !owned;
  const approved = candidate.reviewStatus === "approved";
  const current = draftCurrent(candidate);
  const copied = canCopy(candidate) && !dirty;
  const sent = candidate.sent.length > 0;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("복사했습니다.");
    } catch {
      setNotice("복사하지 못했습니다. 메시지에서 내용을 직접 선택해주세요.");
    }
  };
  return (
    <main className="rv-message">
      <button
        className="rv-back"
        disabled={pending}
        onClick={() => {
          if (
            !dirty ||
            window.confirm("저장하지 않은 입력을 버리고 돌아갈까요?")
          )
            back();
        }}
      >
        ← 메시지 목록
      </button>
      <div className="rv-title">
        <div>
          <span className="rv-eyebrow">메시지 준비</span>
          <h1>{candidate.name}</h1>
          <p>저장된 조사 자료로 제안하고, 사람이 직접 전송합니다.</p>
        </div>
        <span className={`rv-badge ${sent ? "approved" : "reviewing"}`}>
          {sent
            ? "발송 완료"
            : candidate.draft && current
              ? "메시지 준비됨"
              : candidate.draft
                ? "초안 작성 중"
                : "미생성"}
        </span>
      </div>
      {error && (
        <p role="alert" className="rv-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rv-callout">
          {notice}
        </p>
      )}
      {!approved && (
        <p className="rv-error">
          기업의 사람 검토 승인이 해제되었습니다. 검토 결과를 먼저 확인해주세요.
        </p>
      )}
      <div className="rv-message-grid">
        <section className="rv-paper">
          <div className="rv-paper-head">
            <span>제안 메시지</span>
            <small>
              {candidate.draft
                ? `${candidate.draft.quarter} · 초안 ${candidate.draft.revision}`
                : "분기 선택 후 생성"}
            </small>
          </div>
          {editing ? (
            <div className="rv-editor">
              <Field>
                <FieldLabel htmlFor="rv-message-subject">제목</FieldLabel>
                <Input id="rv-message-subject"
                  disabled={pending}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="rv-message-body">본문</FieldLabel>
                <Textarea id="rv-message-body"
                  disabled={pending}
                  rows={28}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </Field>
            </div>
          ) : candidate.draft ? (
            <>
              <h2>{candidate.draft.subject}</h2>
              <div className="rv-message-body">{candidate.draft.body}</div>
            </>
          ) : (
            <div className="rv-empty">
              <span className="rv-empty-symbol">Aa</span>
              <h2>
                {candidate.quarter
                  ? "메시지를 생성해주세요"
                  : "목표 분기를 선택해주세요"}
              </h2>
              <p>
                {candidate.quarter
                  ? "저장된 조사 자료로 제안 메시지를 만듭니다."
                  : "제안할 프로젝트의 진행 분기를 선택한 뒤 생성할 수 있습니다."}
              </p>
            </div>
          )}
          {candidate.sent.length > 0 && (
            <details className="rv-send-history">
              <summary>발송 기록 {candidate.sent.length}건</summary>
              {candidate.sent.map((item) => (
                <article key={item.id}>
                  <strong>
                    {item.draft.quarter} · {item.draft.recipient.name}
                  </strong>
                  <p>
                    {new Date(item.at).toLocaleString("ko-KR")} ·{" "}
                    {item.draft.recipient.channel}
                  </p>
                  <details>
                    <summary>당시 메시지 보기</summary>
                    <h4>{item.draft.subject}</h4>
                    <pre>{item.draft.body}</pre>
                  </details>
                </article>
              ))}
            </details>
          )}
        </section>
        <aside className="rv-message-aside">
          <section className="rv-card">
            <h2>메시지 준비</h2>
            <Field>
              <FieldLabel htmlFor="rv-message-quarter">목표 분기</FieldLabel>
              <select
                id="rv-message-quarter"
                className="rv-native-select"
                aria-label="메시지 목표 분기"
                disabled={locked || editing}
                value={candidate.quarter ?? ""}
                onChange={(e) =>
                  void change(candidate, {
                    type: "quarter",
                    quarter: e.target.value,
                  })
                }
              >
                <option value="" disabled>
                  분기 선택
                </option>
                {quarters.map((q) => (
                  <option key={q} value={q}>
                    {q.replace("-Q", "년 ")}분기
                  </option>
                ))}
              </select>
            </Field>
            <button
              className="rv-text-button"
              disabled={locked || editing}
              onClick={() => setAddingQuarter(!addingQuarter)}
            >
              ＋ 분기 추가
            </button>
            {addingQuarter && (
              <div className="rv-quarter-fields">
                <Field>
                  <FieldLabel htmlFor="rv-quarter-year">연도</FieldLabel>
                  <Input id="rv-quarter-year"
                    type="number"
                    min={2000}
                    max={2100}
                    disabled={pending}
                    value={year}
                    onChange={(e) => setYear(e.target.valueAsNumber)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rv-quarter-part">분기</FieldLabel>
                  <select
                    id="rv-quarter-part"
                    className="rv-native-select"
                    disabled={pending}
                    value={part}
                    onChange={(e) => setPart(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4].map((q) => (
                      <option key={q} value={q}>
                        {q}분기
                      </option>
                    ))}
                  </select>
                </Field>
                <button
                  disabled={
                    locked ||
                    !Number.isInteger(year) ||
                    year < 2000 ||
                    year > 2100
                  }
                  onClick={async () => {
                    if (await addQuarter(`${year}-Q${part}`)) {
                      setAddingQuarter(false);
                      if (
                        await change(candidate, {
                          type: "quarter",
                          quarter: `${year}-Q${part}`,
                        })
                      )
                        setNotice("목표 분기를 선택했습니다.");
                    }
                  }}
                >
                  추가하고 선택
                </button>
              </div>
            )}
            {candidate.quarter && (
              <p className="rv-help">
                제안 기간 · {projectSchedule(candidate.quarter).period}
              </p>
            )}
            {candidate.draft && !current && (
              <p className="rv-warning">
                분기·수신자 또는 조사 자료가 변경되었습니다. 현재 설정으로 다시
                생성해주세요.
              </p>
            )}
            <div className="rv-action-stack">
              <button
                className={
                  !candidate.draft || !current ? "rv-primary" : "rv-text-button"
                }
                disabled={
                  locked ||
                  editing ||
                  !approved ||
                  !candidate.quarter ||
                  !candidate.recipient
                }
                onClick={async () => {
                  if (
                    candidate.draft &&
                    !window.confirm(
                      "현재 초안을 저장된 조사 자료로 다시 생성할까요?",
                    )
                  )
                    return;
                  if (await change(candidate, { type: "generate" }))
                    setNotice("저장된 조사 자료로 메시지를 생성했습니다.");
                }}
              >
                {pending && <Spinner />} {candidate.draft ? "다시 생성" : "메시지 생성"}
              </button>
              {candidate.draft &&
                (editing ? (
                  <>
                    <button
                      disabled={
                        locked || !draftDirty || !subject.trim() || !body.trim()
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
                          setNotice("초안을 저장했습니다. 다시 확인해주세요.");
                        }
                      }}
                    >
                      수정 저장
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => {
                        if (
                          !draftDirty ||
                          window.confirm("저장하지 않은 수정을 취소할까요?")
                        )
                          setEditing(false);
                      }}
                    >
                      수정 취소
                    </button>
                  </>
                ) : (
                  <button
                    disabled={locked || !approved || !candidate.draft}
                    onClick={() => setEditing(true)}
                  >
                    내용 수정
                  </button>
                ))}
            </div>
            <p className="rv-help">
              추가 검색 없이 조사 자료와 템플릿을 사용합니다.
            </p>
          </section>
          <section className="rv-card">
            <h2>수신자 · 채널</h2>
            {candidate.recipient ? (
              <>
                <strong>{candidate.recipient.name}</strong>
                <p>{candidate.recipient.title || "직함 미입력"}</p>
                <span className="rv-badge">
                  {candidate.recipient.channel === "linkedin"
                    ? "LinkedIn"
                    : "이메일"}
                </span>
                <p>
                  {candidate.recipient.channel === "linkedin" ? (
                    <SourceLink url={candidate.recipient.address}>
                      LinkedIn 프로필 열기
                    </SourceLink>
                  ) : (
                    candidate.recipient.address
                  )}
                </p>
              </>
            ) : (
              <p>관계자가 없습니다.</p>
            )}
            {!sent && <p className="rv-help">수신자를 바꾸려면 기업 검토에서 판단 변경을 진행해주세요.</p>}
            <div className="rv-copy">
              <button
                disabled={locked || !copied}
                onClick={() => void copy(candidate.draft!.subject)}
              >
                제목 복사
              </button>
              <button
                disabled={locked || !copied}
                onClick={() => void copy(candidate.draft!.body)}
              >
                본문 복사
              </button>
            </div>
            <button
              className="rv-full"
              disabled={locked || !copied || sent}
              onClick={() => {
                if (
                  window.confirm(
                    "외부 채널에서 실제 전송을 마쳤나요? 완료를 기록하면 첫 발송 상태로 저장됩니다.",
                  )
                )
                  void change(candidate, { type: "send" });
              }}
            >
              {sent ? "발송 완료로 기록됨" : "발송 완료 표시"}
            </button>
            {candidate.draft && !copied && (
              <p className="rv-help">
                {dirty
                  ? "수정 내용을 저장해주세요."
                  : !current
                    ? "현재 설정으로 메시지를 다시 생성해주세요."
                    : "메시지를 다시 불러와주세요."}
              </p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
