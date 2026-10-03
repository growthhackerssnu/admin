import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { WorkspaceError } from "@/components/ui/workspace-error";
import { toast } from "sonner";
import { WorkspaceStatus } from "@/components/ui/workspace-status";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { safeUrl, validRecipient, type Recipient } from "./contracts";
import {
  generationReasons,
  outcomeLabels,
  type HistoryCompany,
  type HistoryData,
  type HistoryCommand,
} from "./historyContracts";
import { MessageDraftEditor } from "./MessageDraftEditor";
import "./message-composer.css";

export interface ComposerForm {
  purpose: string;
  recipient: Recipient;
  subject: string;
  body: string;
  draftRevision?: number;
}
export type ComposerForms = Record<string, ComposerForm>;
const emptyRecipient: Recipient = {
  name: "",
  title: "",
  channel: "linkedin",
  address: "",
};
export function HistoryComposer({
  company,
  data,
  forms,
  pending,
  execute,
  mock = false,
}: {
  company: HistoryCompany;
  data: HistoryData;
  forms: ComposerForms;
  pending: boolean;
  mock?: boolean;
  execute: (command: HistoryCommand) => Promise<boolean>;
}) {
  const work = company.work!;
  const [form, setForm] = useState<ComposerForm>(
    () =>
      forms[work.id] ?? {
        purpose: work.purpose,
        recipient: { ...(work.recipient ?? emptyRecipient) },
        subject: work.draft?.subject ?? "",
        body: work.draft?.body ?? "",
        draftRevision: work.draft?.revision,
      },
  );
  const [editingRecipient, setEditingRecipient] = useState(!work.recipient);
  const [copyError, setCopyError] = useState("");
  const { confirm, dialog } = useConfirmation();
  const sent = work.sent;
  const owned = work.owner.id === data.actor.id;
  const locked =
    pending ||
    !owned ||
    Boolean(sent) ||
    work.roundId !== data.round?.id ||
    work.canEdit === false;
  const purposeDirty = form.purpose !== work.purpose;
  const recipientDirty =
    JSON.stringify(form.recipient) !==
    JSON.stringify(work.recipient ?? emptyRecipient);
  const draftDirty =
    Boolean(work.draft) &&
    (form.subject !== work.draft?.subject || form.body !== work.draft?.body);
  const reasons = generationReasons(company, data.round, data.actor);
  const unsaved = purposeDirty || recipientDirty || draftDirty;
  const ready =
    !locked && !unsaved && reasons.length === 0 && work.canGenerate !== false;
  const patch = (value: Partial<ComposerForm>) =>
    setForm((previous) => {
      const next = { ...previous, ...value };
      forms[work.id] = next;
      return next;
    });
  useEffect(() => {
    forms[work.id] = form;
  }, [forms, work.id, form]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (unsaved && owned && !sent) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [unsaved, owned, sent]);
  // Successful generation/save replaces the server draft. Recipient/purpose inputs remain independently preserved.
  useEffect(() => {
    if (work.draft && form.draftRevision !== work.draft.revision)
      patch({
        subject: work.draft.subject,
        body: work.draft.body,
        draftRevision: work.draft.revision,
      });
  }, [work.draft?.revision]);
  const contactUrl = safeUrl(
    (sent?.recipient ?? work.recipient)?.address ?? "",
  );
  const copy = async (value: string) => {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(value);
      toast.success("복사했습니다.");
    } catch {
      setCopyError(
        "복사하지 못했습니다. 아래 내용을 직접 선택해 복사해주세요.",
      );
    }
  };
  return (
    <section className="uw-composer hw-composer" aria-label="메시지 작성">
      {dialog}
      <div className="hw-drawer-scroll">
        <div className="hw-compose-meta">
          <span>
            수주 분기 · {work.quarter ?? data.round?.quarter ?? "미설정"}
          </span>
          <WorkspaceStatus tone={sent ? "success" : "neutral"}>
            {sent ? "발송 완료" : "작성 중"}
          </WorkspaceStatus>
        </div>
        {!owned && (
          <p className="hw-muted" role="status">
            {work.owner.name} 담당 · 조회만 가능
          </p>
        )}
        {sent ? (
          <p className="hw-muted">
            {new Date(sent.at).toLocaleString("ko-KR")} · {sent.quarter} ·{" "}
            {sent.outcome ? outcomeLabels[sent.outcome] : "결과 미기록"}
          </p>
        ) : (
          <Field className="hw-purpose">
            <FieldLabel htmlFor="hw-purpose" required>
              이번 연락 목적
            </FieldLabel>
            <Textarea
              id="hw-purpose"
              value={form.purpose}
              readOnly={locked}
              maxLength={2000}
              rows={3}
              placeholder="이전 일정 문제로 거절하여 다음 분기 협업을 다시 제안"
              onChange={(e) => patch({ purpose: e.target.value })}
            />
            {purposeDirty && owned && (
              <div className="hw-inline-actions">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={locked}
                  onClick={async () => {
                    if (
                      await execute({ type: "purpose", purpose: form.purpose })
                    )
                      patch({ purpose: form.purpose.trim() });
                  }}
                >
                  목적 저장
                </Button>
              </div>
            )}
          </Field>
        )}
        <section className="hw-recipient-section">
          <div className="hw-section-head">
            <h3>수신자</h3>
            {!sent && owned && (
              <Button
                size="sm"
                variant="ghost"
                disabled={locked}
                onClick={() => setEditingRecipient(!editingRecipient)}
              >
                {editingRecipient ? "입력 닫기" : "변경"}
              </Button>
            )}
          </div>
          {editingRecipient && !sent && owned ? (
            <>
              {company.contacts.length > 0 && (
                <div className="hw-saved-contacts">
                  {company.contacts.map((r, i) => (
                    <Button
                      key={`${r.address}-${i}`}
                      variant="outline"
                      size="sm"
                      disabled={locked}
                      onClick={() => patch({ recipient: { ...r } })}
                    >
                      {r.name} ·{" "}
                      {r.channel === "linkedin" ? "LinkedIn" : "이메일"}
                    </Button>
                  ))}
                </div>
              )}
              <div className="hw-field-grid">
                <Field>
                  <FieldLabel htmlFor="hw-person" required>
                    이름
                  </FieldLabel>
                  <Input
                    id="hw-person"
                    disabled={locked}
                    value={form.recipient.name}
                    onChange={(e) =>
                      patch({
                        recipient: { ...form.recipient, name: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="hw-title">직함</FieldLabel>
                  <Input
                    id="hw-title"
                    disabled={locked}
                    value={form.recipient.title}
                    onChange={(e) =>
                      patch({
                        recipient: { ...form.recipient, title: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="hw-channel" required>
                    채널
                  </FieldLabel>
                  <Select
                    disabled={locked}
                    value={form.recipient.channel}
                    onValueChange={(value) =>
                      patch({
                        recipient: {
                          ...form.recipient,
                          channel: value as Recipient["channel"],
                          address: "",
                        },
                      })
                    }
                  >
                    <SelectTrigger id="hw-channel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dw-select-content">
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="email">이메일</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="hw-address" required>
                    {form.recipient.channel === "linkedin"
                      ? "프로필 링크"
                      : "이메일 주소"}
                  </FieldLabel>
                  <Input
                    id="hw-address"
                    disabled={locked}
                    value={form.recipient.address}
                    onChange={(e) =>
                      patch({
                        recipient: {
                          ...form.recipient,
                          address: e.target.value,
                        },
                      })
                    }
                  />
                </Field>
              </div>
              {recipientDirty && !validRecipient(form.recipient) && (
                <FieldError>
                  이름과 올바른 LinkedIn 개인 프로필 또는 이메일을 입력해주세요.
                </FieldError>
              )}
              {!recipientDirty && !validRecipient(form.recipient) && (
                <p className="hw-muted" role="status">
                  이름과 프로필 링크 또는 이메일 입력
                </p>
              )}
              <div className="hw-inline-actions">
                <Button
                  size="sm"
                  disabled={locked || !validRecipient(form.recipient)}
                  onClick={async () => {
                    if (!recipientDirty) {
                      setEditingRecipient(false);
                      return;
                    }
                    if (
                      await execute({
                        type: "recipient",
                        recipient: form.recipient,
                      })
                    ) {
                      patch({
                        recipient: {
                          ...form.recipient,
                          name: form.recipient.name.trim(),
                          title: form.recipient.title.trim(),
                          address: form.recipient.address.trim(),
                        },
                      });
                      setEditingRecipient(false);
                    }
                  }}
                >
                  수신자 저장
                </Button>
              </div>
            </>
          ) : (
            <div className="hw-contact-summary">
              <strong>
                {(sent?.recipient ?? work.recipient)?.name ?? "수신자 미입력"}
              </strong>
              <span>
                {(sent?.recipient ?? work.recipient)?.title} ·{" "}
                {(sent?.recipient ?? work.recipient)?.channel === "email"
                  ? "이메일"
                  : "LinkedIn"}
              </span>
              {contactUrl &&
                (sent?.recipient ?? work.recipient)?.channel === "linkedin" && (
                  <a href={contactUrl} target="_blank" rel="noreferrer">
                    프로필 열기
                  </a>
                )}
              {(sent?.recipient ?? work.recipient)?.channel === "email" && (
                <a
                  href={`mailto:${(sent?.recipient ?? work.recipient)!.address}`}
                >
                  메일 작성
                </a>
              )}
            </div>
          )}
        </section>
        {copyError && <WorkspaceError message={copyError} />}
        {work.draft && !work.draft.contextMatches && !sent && (
          <p className="hw-warning" role="status">
            연락 목적·수신자·근거가 변경되었습니다. 다시 생성해주세요.
          </p>
        )}
        {sent || work.draft ? (
          <MessageDraftEditor
            subject={sent?.subject ?? form.subject}
            body={sent?.body ?? form.body}
            onSubject={(subject) => patch({ subject })}
            onBody={(body) => patch({ body })}
            readOnly={locked}
            pending={pending}
            sent={Boolean(sent)}
          />
        ) : (
          <Empty className="uw-message-empty">
            <EmptyHeader>
              <EmptyTitle>메시지 미생성</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      {!sent && owned && !editingRecipient && (
        <footer className="hw-composer-footer">
          {(reasons.length > 0 || unsaved) && (
            <div className="hw-block-reason" role="status">
              <span>
                {unsaved ? "입력한 변경을 저장해주세요." : reasons.join(" ")}
              </span>
              {!locked &&
                (purposeDirty ||
                  !work.purpose.trim() ||
                  recipientDirty ||
                  !work.recipient) && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      if (purposeDirty || !work.purpose.trim())
                        document.getElementById("hw-purpose")?.focus();
                      else {
                        setEditingRecipient(true);
                        requestAnimationFrame(() =>
                          document.getElementById("hw-person")?.focus(),
                        );
                      }
                    }}
                  >
                    입력 확인
                  </Button>
                )}
            </div>
          )}
          {draftDirty ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={locked}
                onClick={() =>
                  patch({
                    subject: work.draft!.subject,
                    body: work.draft!.body,
                  })
                }
              >
                수정 취소
              </Button>
              <Button
                size="sm"
                disabled={
                  locked ||
                  purposeDirty ||
                  recipientDirty ||
                  !work.draft?.contextMatches ||
                  !form.subject.trim() ||
                  !form.body.trim()
                }
                onClick={() =>
                  void execute({
                    type: "draft",
                    subject: form.subject,
                    body: form.body,
                  })
                }
              >
                수정 저장
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant={
                  !work.draft || !work.draft.contextMatches
                    ? "default"
                    : "outline"
                }
                disabled={!ready}
                onClick={async () => {
                  if (
                    !work.draft ||
                    (await confirm(
                      "현재 초안을 저장된 이력과 연락 목적으로 다시 생성할까요?",
                      "메시지 다시 생성",
                      "다시 생성",
                    ))
                  )
                    await execute({ type: "generate" });
                }}
              >
                {pending && <Spinner />}
                {work.draft ? "다시 생성" : "메시지 생성"}
              </Button>
              {work.draft && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!ready || !work.draft.contextMatches}
                    onClick={() => void copy(form.subject)}
                  >
                    제목 복사
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!ready || !work.draft.contextMatches}
                    onClick={() => void copy(form.body)}
                  >
                    본문 복사
                  </Button>
                  <Button
                    size="sm"
                    variant={work.draft.contextMatches ? "default" : "outline"}
                    disabled={!ready || !work.draft.contextMatches}
                    onClick={async () => {
                      if (
                        await confirm(
                          mock
                            ? "목업을 발송 완료 상태로 변경할까요? 실제 발송 기록에는 반영되지 않습니다."
                            : "외부 채널에서 실제 전송을 마쳤나요?",
                          mock ? "목업 발송 완료 표시" : "발송 완료 기록",
                          "완료 기록",
                        )
                      )
                        await execute({ type: "send" });
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
