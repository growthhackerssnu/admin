import { useEffect, useRef, useState } from "react";
import {
  reviewLabels,
  researchLabels,
  safeUrl,
  validRecipient,
  type Candidate,
  type CandidateCommand,
  type Actor,
  type Recipient,
} from "./contracts";

export type Change = (
  candidate: Candidate,
  command: CandidateCommand,
) => Promise<boolean>;
export function SourceLink({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return safeUrl(url) ? (
    <a href={safeUrl(url)} target="_blank" rel="noopener noreferrer">
      {children} ↗
    </a>
  ) : (
    <span>{children}</span>
  );
}
export function RecipientEditor({
  candidate,
  actor,
  change,
  pending,
  onDirty,
  startEditing = false,
  emphasize = false,
}: {
  candidate: Candidate;
  actor: Actor;
  change: Change;
  pending: boolean;
  onDirty?: (dirty: boolean) => void;
  startEditing?: boolean;
  emphasize?: boolean;
}) {
  const empty: Recipient = {
    name: "",
    title: "",
    channel: "linkedin",
    address: "",
  };
  const [value, setValue] = useState<Recipient>(candidate.recipient ?? empty);
  const [query, setQuery] = useState(candidate.name);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(startEditing || !candidate.recipient);
  const dirty =
    JSON.stringify(value) !== JSON.stringify(candidate.recipient ?? empty);
  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty, onDirty]);
  const locked =
    pending ||
    candidate.owner?.id !== actor.id ||
    candidate.researchStatus !== "ready";
  const update = (patch: Partial<Recipient>) => {
    setValue({ ...value, ...patch });
    setNotice("");
  };
  return (
    <section
      className="rv-recipient"
      id={`recipient-${candidate.id}`}
      tabIndex={-1}
    >
      <div className="rv-section-title">
        <span>02</span>
        <h3>연락할 관계자</h3>
      </div>
      {candidate.recipient && !editing ? (
        <div className="rv-contact-summary">
          <div>
            <strong>{candidate.recipient.name}</strong>
            <p>{candidate.recipient.title || "직함 미입력"}</p>
            <span className="rv-badge">
              {candidate.recipient.channel === "linkedin"
                ? "LinkedIn"
                : "이메일"}
            </span>
            {candidate.recipient.channel === "linkedin" ? (
              <SourceLink url={candidate.recipient.address}>
                프로필 열기
              </SourceLink>
            ) : (
              <span>{candidate.recipient.address}</span>
            )}
          </div>
          <button disabled={locked} onClick={() => setEditing(true)}>
            수정
          </button>
        </div>
      ) : (
        <>
          <div className="rv-search-link">
            <input
              aria-label="LinkedIn 검색어"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <a
              className={`rv-button ${emphasize && !candidate.recipient && !dirty && !locked ? "rv-primary" : ""}`}
              href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn 검색 ↗
            </a>
          </div>
          <fieldset disabled={locked} className="rv-fields">
            <label>
              이름
              <input
                value={value.name}
                placeholder="관계자 이름"
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            <label>
              직함
              <input
                value={value.title}
                placeholder="예: 사업개발 매니저"
                onChange={(e) => update({ title: e.target.value })}
              />
            </label>
            <label>
              연락 채널
              <select
                value={value.channel}
                onChange={(e) =>
                  update({
                    channel: e.target.value as Recipient["channel"],
                    address: "",
                  })
                }
              >
                <option value="linkedin">LinkedIn</option>
                <option value="email">이메일</option>
              </select>
            </label>
            <label>
              {value.channel === "linkedin" ? "LinkedIn 프로필" : "이메일 주소"}
              <input
                type={value.channel === "email" ? "email" : "url"}
                value={value.address}
                placeholder={
                  value.channel === "linkedin"
                    ? "https://www.linkedin.com/in/…"
                    : "name@company.com"
                }
                onChange={(e) => update({ address: e.target.value })}
              />
            </label>
            <button
              type="button"
              className={emphasize && dirty && !locked ? "rv-primary" : ""}
              disabled={!validRecipient(value) || !dirty}
              onClick={async () => {
                if (
                  await change(candidate, { type: "contact", recipient: value })
                ) {
                  setValue({
                    ...value,
                    name: value.name.trim(),
                    title: value.title.trim(),
                    address: value.address.trim(),
                  });
                  setNotice("관계자를 저장했습니다.");
                  setEditing(false);
                }
              }}
            >
              관계자 저장
            </button>
            {dirty && !validRecipient(value) && (
              <p className="rv-help">
                이름과 유효한{" "}
                {value.channel === "linkedin"
                  ? "LinkedIn 개인 프로필 URL"
                  : "이메일 주소"}
                를 입력해주세요.
              </p>
            )}
          </fieldset>
        </>
      )}
      {notice && (
        <p role="status" className="rv-help">
          {notice}
        </p>
      )}
    </section>
  );
}

export function CandidateReview({
  candidate,
  actor,
  pending,
  error,
  change,
  close,
  message,
  next,
  inline = false,
  onDirty,
}: {
  candidate: Candidate;
  actor: Actor;
  pending: boolean;
  error: string;
  change: Change;
  close: () => void;
  message: () => void;
  next: () => void;
  inline?: boolean;
  onDirty?: (dirty: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [contactDirty, setContactDirty] = useState(false);
  const [note, setNote] = useState("");
  const dirty = contactDirty || !!note.trim();
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);
  const leave = (action: () => void) => {
    if (
      !pending &&
      (!dirty || window.confirm("저장하지 않은 입력을 버리고 이동할까요?"))
    ) {
      onDirty?.(false);
      action();
    }
  };
  useEffect(() => {
    if (inline && dialog.current) dialog.current.open = true;
    else dialog.current?.showModal();
    return () => dialog.current?.close();
  }, [inline]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const owned = candidate.owner?.id === actor.id;
  const decided = ["approved", "rejected_fit", "rejected_contact"].includes(
    candidate.reviewStatus,
  );
  const locked = pending || !owned || candidate.researchStatus !== "ready";
  const decision = candidate.decisions.at(-1);
  const goToRecipient = () => {
    const section = dialog.current?.querySelector<HTMLElement>(".rv-recipient");
    const scroller = dialog.current?.querySelector<HTMLElement>(".rv-drawer-scroll");
    if (section && scroller) scroller.scrollTo({
      top: scroller.scrollTop + section.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16,
      behavior: "smooth",
    });
    section?.focus({ preventScroll: true });
  };
  const decide = async (
    status: "approved" | "rejected_fit" | "rejected_contact",
  ) => {
    if (await change(candidate, { type: "decide", status, note })) setNote("");
  };
  return (
    <dialog
      open={inline || undefined}
      className={`rv-drawer ${inline ? "rv-focus" : ""}`}
      ref={dialog}
      aria-label={`${candidate.name} 검토`}
      onCancel={(e) => {
        e.preventDefault();
        leave(close);
      }}
    >
      <header className="rv-drawer-head">
        <div>
          <h2>{candidate.name}</h2>
          <p>{candidate.summary}</p>
          <p className="rv-current-state">
            {reviewLabels[candidate.reviewStatus]} ·{" "}
            {candidate.researchStatus !== "ready"
              ? researchLabels[candidate.researchStatus]
              : decided
                ? "판단 결과 확인"
                : contactDirty
                  ? "관계자 입력 저장"
                  : candidate.recipient
                    ? "연락 여부 판단"
                    : "관계자 검색 및 입력"}
          </p>
        </div>
        <div className="rv-drawer-controls">
          <button disabled={pending} onClick={() => leave(next)}>
            다음 기업 →
          </button>
          <button
            className="rv-icon"
            aria-label={inline ? "기업 목록으로" : "검토 패널 닫기"}
            disabled={pending}
            onClick={() => leave(close)}
          >
            {inline ? "←" : "×"}
          </button>
        </div>
      </header>
      <div className="rv-drawer-scroll">
        <div className="rv-meta">
          <span className={`rv-badge ${candidate.reviewStatus}`}>
            {reviewLabels[candidate.reviewStatus]}
          </span>
          <span>{candidate.owner?.name ?? "담당자 미배정"}</span>
          <SourceLink url={candidate.website}>홈페이지</SourceLink>
          <SourceLink url={candidate.sourceUrl}>발견 원문</SourceLink>
        </div>
        <p className="rv-help">
          {candidate.source} ·{" "}
          {new Date(candidate.discoveredAt).toLocaleDateString("ko-KR")} 수집
        </p>
        {candidate.owner && !owned && (
          <p className="rv-callout">
            {candidate.owner.name}님이 검토 중입니다. 자료를 열람할 수 있습니다.
          </p>
        )}
        {candidate.research ? (
          <>
            <div className="rv-section-title">
              <span>01</span>
              <h3>사업과 고객</h3>
            </div>
            <p className="rv-help">
              {new Date(candidate.research.at).toLocaleDateString("ko-KR")} 조사
            </p>
            <div className="rv-facts">
              {candidate.research.facts.map((fact) => (
                <article key={fact.title}>
                  <h4>{fact.title}</h4>
                  <div>
                    <p>
                      {fact.text}
                      {candidate.research!.evidence.map((e, i) =>
                        e.id === fact.evidenceId ? (
                          <a
                            className="rv-citation"
                            key={e.id}
                            href={`#evidence-${candidate.id}-${i}`}
                            title={e.title}
                            aria-label={`근거 ${i + 1}: ${e.title}`}
                          >
                            [{i + 1}]
                          </a>
                        ) : null,
                      )}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <h3>
              협업 아이디어 <small>논의할 가설</small>
            </h3>
            <div className="rv-ideas">
              {candidate.research.ideas.map((idea, index) => (
                <article key={idea.title}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <div>
                    <h4>{idea.title}</h4>
                    <p>
                      {idea.rationale}
                      {candidate.research!.evidence.map((e, i) =>
                        idea.evidenceIds.includes(e.id) ? (
                          <a
                            className="rv-citation"
                            key={e.id}
                            href={`#evidence-${candidate.id}-${i}`}
                            title={e.title}
                            aria-label={`근거 ${i + 1}: ${e.title}`}
                          >
                            [{i + 1}]
                          </a>
                        ) : null,
                      )}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <section className="rv-evidence-disclosure">
              <h3>조사 근거</h3>
              <div className="rv-evidence">
                {candidate.research.evidence.map((e, i) => (
                  <article
                    key={e.id}
                    id={`evidence-${candidate.id}-${i}`}
                    tabIndex={-1}
                  >
                    <span className="rv-source-number">[{i + 1}]</span>{" "}
                    <SourceLink url={e.url}>{e.title}</SourceLink>
                    <blockquote>{e.excerpt}</blockquote>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="rv-empty">
            <h3>{researchLabels[candidate.researchStatus]}</h3>
            <p>
              {candidate.error?.message ??
                "조사가 완료되면 이곳에 판단 자료가 표시됩니다."}
            </p>
            {candidate.error?.retryable && (
              <button
                className="rv-primary"
                disabled={pending}
                onClick={() => void change(candidate, { type: "retry" })}
              >
                조사 재시도
              </button>
            )}
          </div>
        )}
        {candidate.research && (
          <RecipientEditor
            candidate={candidate}
            actor={actor}
            pending={pending}
            change={change}
            onDirty={setContactDirty}
            emphasize={!decided}
          />
        )}
        {decision && (
          <div className="rv-callout">
            <strong>최근 판단 · {reviewLabels[decision.status]}</strong>
            <p>{decision.note || "별도 메모 없음"}</p>
            <small>
              {decision.actor.name} ·{" "}
              {new Date(decision.at).toLocaleString("ko-KR")}
              {decision.status === "rejected_contact" &&
                " · fit 적합 판단 유지"}
            </small>
          </div>
        )}
        {!decided && candidate.research && (
          <label className="rv-note">
            판단 메모 <small>선택</small>
            <textarea
              value={note}
              disabled={locked}
              rows={2}
              placeholder="다음에 검토할 때 참고할 내용을 남겨주세요."
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        )}
      </div>
      <footer className="rv-drawer-footer">
        {error && (
          <p role="alert" className="rv-error">
            {error}
          </p>
        )}
        {decided ? (
          <>
            <div className="rv-footer-actions">
              <button
                disabled={locked || contactDirty}
                onClick={() => void change(candidate, { type: "reopen" })}
              >
                판단 변경
              </button>
              {candidate.reviewStatus === "approved" && (
                <button
                  className={!contactDirty ? "rv-primary" : ""}
                  disabled={pending || contactDirty}
                  onClick={() => leave(message)}
                >
                  메시지 작성 →
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="rv-help">
              {!owned
                ? "다른 담당자가 검토 중입니다. 자료를 확인할 수 있습니다."
                : pending
                  ? "저장 중입니다. 잠시 기다려주세요."
                  : candidate.researchStatus !== "ready"
                    ? "조사가 완료되어야 판단할 수 있습니다."
                    : contactDirty
                      ? "입력한 관계자를 저장해주세요."
                      : !candidate.recipient
                        ? "관계자를 저장하면 승인할 수 있습니다."
                        : "확인한 자료와 연락 경로를 바탕으로 결정해주세요."}
            </p>
            {!locked && (!candidate.recipient || contactDirty) && (
              <button className="rv-text-button" onClick={goToRecipient}>
                관계자 {contactDirty ? "입력으로" : "검색·입력으로"} 이동 ↑
              </button>
            )}
            <div className="rv-footer-actions">
              <button
                disabled={locked || contactDirty}
                onClick={() => void decide("rejected_fit")}
              >
                fit 부적합
              </button>
              <button
                disabled={locked || contactDirty}
                onClick={() => void decide("rejected_contact")}
              >
                연락처 없음
              </button>
              <button
                className={
                  candidate.recipient && !contactDirty && !locked
                    ? "rv-primary"
                    : ""
                }
                disabled={locked || contactDirty || !candidate.recipient}
                onClick={() => void decide("approved")}
              >
                {pending ? "저장 중…" : "승인"}
              </button>
            </div>
          </>
        )}
      </footer>
    </dialog>
  );
}
