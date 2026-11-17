import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { WorkspaceError } from "@/components/ui/workspace-error";
import { WorkspaceStatus } from "@/components/ui/workspace-status";
import { WorkspaceTable } from "@/components/ui/workspace-table";
import { HumanReviewApiError } from "./humanReviewApi";
import {
  aiSectionNames,
  insertAtCursor,
  previewSegments,
  pruneAiInstructions,
  templateKindLabels,
  templateKinds,
  unknownAutoFields,
  unnamedTokens,
  type AutoField,
  type MessageTemplate,
  type MessageTemplateData,
  type MessageTemplateKind,
  type MessageTemplateStore,
  type MessageTemplateVersion,
} from "./messageTemplates";

type TemplateForm = Pick<
  MessageTemplate,
  "name" | "subject" | "body" | "aiInstructions"
>;
type CursorField = "subject" | "body";
const fieldIds: Record<CursorField, string> = {
  subject: "tpl-subject",
  body: "tpl-body",
};
const toForm = (template: MessageTemplate): TemplateForm => ({
  name: template.name,
  subject: template.subject,
  body: template.body,
  aiInstructions: { ...template.aiInstructions },
});
const dateTime = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";
const message = (failure: unknown, fallback: string) =>
  failure instanceof Error && failure.message ? failure.message : fallback;

function Preview({ text, autoFields }: { text: string; autoFields: AutoField[] }) {
  return (
    <>
      {previewSegments(text, autoFields).map((segment, index) =>
        segment.kind === "text" ? (
          segment.text
        ) : (
          <mark key={index} data-kind={segment.kind}>
            {segment.text}
          </mark>
        ),
      )}
    </>
  );
}

/** 설정 > 메일 양식. 경우별 목록, 편집기, 쓸 수 있는 자리 안내, 미리보기, 수정 이력. */
export function MessageTemplateSettings({
  store,
  data,
  onChange,
  reload,
}: {
  store: MessageTemplateStore;
  data: MessageTemplateData;
  onChange: (data: MessageTemplateData) => void;
  reload: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    data.templates[0]?.id ?? null,
  );
  const selected = data.templates.find((item) => item.id === selectedId);
  const [form, setForm] = useState<TemplateForm | null>(
    selected ? toForm(selected) : null,
  );
  const [adding, setAdding] = useState<MessageTemplateKind | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const [versions, setVersions] = useState<MessageTemplateVersion[] | null>(
    null,
  );
  const [versionsError, setVersionsError] = useState("");
  const [viewing, setViewing] = useState<number | null>(null);
  const cursor = useRef<{ field: CursorField; start: number; end: number }>({
    field: "body",
    start: Number.MAX_SAFE_INTEGER,
    end: Number.MAX_SAFE_INTEGER,
  });
  // 응답을 못 받은 저장을 다시 눌러도 같은 요청으로 처리되게 키를 유지한다.
  const keys = useRef(new Map<string, string>());
  const { confirm, dialog } = useConfirmation();
  const readOnly = !data.canManage;

  const aiNames = form ? aiSectionNames(form.subject, form.body) : [];
  const unknown = form
    ? unknownAutoFields(form.subject, form.body, data.autoFields)
    : [];
  const unnamed = form ? unnamedTokens(form.subject, form.body) : [];
  const dirty = Boolean(
    form &&
      selected &&
      (form.name !== selected.name ||
        form.subject !== selected.subject ||
        form.body !== selected.body ||
        aiNames.some(
          (name) =>
            (form.aiInstructions[name] ?? "") !==
            (selected.aiInstructions[name] ?? ""),
        )),
  );
  const missing = form
    ? [
        !form.name.trim() && "이름",
        !form.subject.trim() && "제목",
        !form.body.trim() && "본문",
      ].filter(Boolean)
    : [];

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const loadVersions = useCallback(
    async (template: MessageTemplate | undefined) => {
      setVersionsError("");
      setViewing(null);
      if (!template || template.version === 0 || readOnly) {
        setVersions([]);
        return;
      }
      setVersions(null);
      try {
        setVersions(await store.versions(template.id));
      } catch (failure) {
        setVersions([]);
        setVersionsError(message(failure, "수정 이력을 불러오지 못했습니다."));
      }
    },
    [store, readOnly],
  );
  useEffect(() => {
    void loadVersions(data.templates.find((item) => item.id === selectedId));
    // 양식을 바꿀 때만 다시 읽는다. 저장 뒤에는 save가 직접 갱신한다.
  }, [selectedId, loadVersions]);

  const open = (template: MessageTemplate) => {
    setSelectedId(template.id);
    setForm(toForm(template));
    setError("");
    setConflict(false);
    setNotice("");
  };
  const discardConfirmed = async () =>
    !dirty ||
    (await confirm(
      "저장하지 않은 수정이 있습니다. 버리고 이동할까요?",
      "수정 버리기",
      "버리기",
    ));
  const keyFor = (signature: string) => {
    if (!keys.current.has(signature))
      keys.current.set(signature, crypto.randomUUID());
    return keys.current.get(signature)!;
  };
  const remember = (
    field: CursorField,
    element: HTMLInputElement | HTMLTextAreaElement,
  ) => {
    cursor.current = {
      field,
      start: element.selectionStart ?? element.value.length,
      end: element.selectionEnd ?? element.value.length,
    };
  };
  /** 마지막으로 커서가 있던 제목·본문 위치에 넣는다. selectInside가 있으면 그 글자를 선택해 둔다. */
  const insert = (text: string, selectInside?: string) => {
    if (!form || readOnly) return;
    const { field, start, end } = cursor.current;
    const result = insertAtCursor(form[field], start, end, text);
    setForm({ ...form, [field]: result.text });
    const insertedAt = result.cursor - text.length;
    const from = selectInside
      ? insertedAt + text.indexOf(selectInside)
      : result.cursor;
    const to = selectInside ? from + selectInside.length : result.cursor;
    cursor.current = { field, start: from, end: to };
    requestAnimationFrame(() => {
      const element = document.getElementById(fieldIds[field]) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
      element?.focus();
      element?.setSelectionRange(from, to);
    });
  };
  const save = async () => {
    if (!form || !selected) return;
    const input = {
      expectedVersion: selected.version,
      name: form.name.trim(),
      subject: form.subject,
      body: form.body,
      aiInstructions: pruneAiInstructions(form.aiInstructions, aiNames),
    };
    const signature = JSON.stringify([selected.id, input]);
    setBusy(true);
    setError("");
    setConflict(false);
    setNotice("");
    try {
      const saved = await store.update(selected.id, input, keyFor(signature));
      keys.current.delete(signature);
      onChange({
        ...data,
        templates: data.templates.map((item) =>
          item.id === saved.id ? saved : item,
        ),
      });
      setForm(toForm(saved));
      setNotice("저장했습니다. 이후 만드는 초안부터 적용됩니다.");
      void loadVersions(saved);
    } catch (failure) {
      const conflicted =
        failure instanceof HumanReviewApiError &&
        failure.code === "VERSION_CONFLICT";
      if (conflicted) keys.current.delete(signature);
      setConflict(conflicted);
      setError(
        conflicted
          ? "다른 사람이 먼저 수정했습니다. 최신 내용을 불러온 뒤 다시 저장하세요."
          : message(failure, "양식을 저장하지 못했습니다."),
      );
    } finally {
      setBusy(false);
    }
  };
  const create = async (kind: MessageTemplateKind) => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await store.create(
        kind,
        name,
        keyFor(JSON.stringify(["create", kind, name])),
      );
      keys.current.delete(JSON.stringify(["create", kind, name]));
      onChange({ ...data, templates: [...data.templates, created] });
      setAdding(null);
      setNewName("");
      open(created);
      setNotice("양식을 추가했습니다. 제목과 본문을 채운 뒤 저장하세요.");
    } catch (failure) {
      setError(message(failure, "양식을 추가하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };
  const viewed = versions?.find((item) => item.version === viewing);

  return (
    <div className="uw-tpl">
      {dialog}
      <nav className="uw-tpl-list" aria-label="메일 양식 목록">
        {templateKinds.map((kind) => {
          const items = data.templates.filter((item) => item.kind === kind);
          return (
            <section key={kind} aria-labelledby={`tpl-kind-${kind}`}>
              <h3 id={`tpl-kind-${kind}`}>{templateKindLabels[kind]}</h3>
              {!items.length && (
                <p className="uw-tpl-muted">등록된 양식이 없습니다.</p>
              )}
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="uw-tpl-item"
                      aria-current={item.id === selectedId ? "true" : undefined}
                      disabled={busy}
                      onClick={async () => {
                        if (item.id === selectedId) return;
                        if (await discardConfirmed()) open(item);
                      }}
                    >
                      <strong>{item.name}</strong>
                      {item.version === 0 ? (
                        <WorkspaceStatus tone="warning">비어 있음</WorkspaceStatus>
                      ) : (
                        <span>
                          버전 {item.version} ·{" "}
                          {item.updatedBy ?? "수정자 미확인"} ·{" "}
                          {dateTime(item.updatedAt)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {!readOnly &&
                (adding === kind ? (
                  <form
                    className="uw-tpl-add"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void create(kind);
                    }}
                  >
                    <Field>
                      <FieldLabel htmlFor={`tpl-new-${kind}`} required>
                        새 양식 이름
                      </FieldLabel>
                      <Input
                        id={`tpl-new-${kind}`}
                        aria-required="true"
                        autoFocus
                        maxLength={80}
                        value={newName}
                        disabled={busy}
                        onChange={(event) => setNewName(event.target.value)}
                      />
                    </Field>
                    <div className="uw-tpl-add-actions">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setAdding(null)}
                      >
                        취소
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={busy || !newName.trim()}
                      >
                        추가
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={async () => {
                      if (!(await discardConfirmed())) return;
                      if (selected) setForm(toForm(selected));
                      setNewName("");
                      setAdding(kind);
                    }}
                  >
                    <Plus /> 양식 추가
                  </Button>
                ))}
            </section>
          );
        })}
      </nav>

      {!selected || !form ? (
        <p className="uw-tpl-muted uw-tpl-editor">
          왼쪽에서 양식을 고르거나 새로 추가하세요.
        </p>
      ) : (
        <div className="uw-tpl-editor">
          <header className="uw-tpl-editor-head">
            <div>
              <h2>{selected.name}</h2>
              <p>
                {templateKindLabels[selected.kind]} ·{" "}
                {selected.version === 0
                  ? "아직 내용이 없습니다"
                  : `버전 ${selected.version}`}
              </p>
            </div>
            {!readOnly && (
              <div className="uw-tpl-editor-actions">
                {dirty && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await confirm(
                          "저장하지 않은 수정을 버릴까요?",
                          "수정 버리기",
                          "버리기",
                        )
                      ) {
                        setForm(toForm(selected));
                        setError("");
                        setConflict(false);
                      }
                    }}
                  >
                    수정 취소
                  </Button>
                )}
                <Button
                  disabled={
                    busy ||
                    !dirty ||
                    missing.length > 0 ||
                    unknown.length > 0 ||
                    unnamed.length > 0
                  }
                  onClick={() => void save()}
                >
                  {busy && <Spinner />} 저장
                </Button>
              </div>
            )}
          </header>
          {error && (
            <WorkspaceError
              message={error}
              onRetry={
                conflict
                  ? () =>
                      void reload()
                        .then(() => {
                          setConflict(false);
                          setError("");
                          setNotice(
                            "최신 내용을 불러왔습니다. 내 수정은 편집기에 남아 있습니다. 수정 이력에서 바뀐 내용을 확인한 뒤 다시 저장하세요.",
                          );
                          void loadVersions(selected);
                        })
                        .catch((failure) =>
                          setError(
                            message(failure, "양식을 불러오지 못했습니다."),
                          ),
                        )
                  : undefined
              }
            />
          )}
          {notice && (
            <p className="uw-ops-notice" role="status">
              {notice}
            </p>
          )}
          {unknown.length > 0 && (
            <FieldError id="tpl-unknown" role="alert">
              쓸 수 없는 자동 입력 이름이 있어 저장할 수 없습니다:{" "}
              {unknown.map((name) => `{{${name}}}`).join(", ")}. 오른쪽 목록에
              있는 이름만 쓸 수 있습니다.
            </FieldError>
          )}
          {unnamed.length > 0 && (
            <FieldError role="alert">
              이름이 비어 있는 자리가 있습니다: {unnamed.join(", ")}. 콜론 뒤에
              이름을 적어 주세요.
            </FieldError>
          )}
          <div className="uw-tpl-fields">
            <Field>
              <FieldLabel htmlFor="tpl-name" required>
                양식 이름
              </FieldLabel>
              <Input
                id="tpl-name"
                aria-required="true"
                maxLength={80}
                value={form.name}
                readOnly={readOnly}
                disabled={busy}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tpl-subject" required>
                제목
              </FieldLabel>
              <Input
                id="tpl-subject"
                aria-required="true"
                aria-invalid={
                  unknownAutoFields(form.subject, "", data.autoFields).length >
                    0 || undefined
                }
                value={form.subject}
                readOnly={readOnly}
                disabled={busy}
                onSelect={(event) => remember("subject", event.currentTarget)}
                onChange={(event) => {
                  remember("subject", event.currentTarget);
                  setForm({ ...form, subject: event.target.value });
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tpl-body" required>
                본문
              </FieldLabel>
              <Textarea
                id="tpl-body"
                className="uw-tpl-body"
                aria-required="true"
                aria-invalid={
                  unknownAutoFields("", form.body, data.autoFields).length >
                    0 || undefined
                }
                aria-describedby={unknown.length ? "tpl-unknown" : undefined}
                rows={16}
                value={form.body}
                readOnly={readOnly}
                disabled={busy}
                onSelect={(event) => remember("body", event.currentTarget)}
                onChange={(event) => {
                  remember("body", event.currentTarget);
                  setForm({ ...form, body: event.target.value });
                }}
              />
            </Field>
          </div>

          <section className="uw-tpl-block" aria-labelledby="tpl-ai-title">
            <h3 id="tpl-ai-title">AI 구간별 기본 지시문</h3>
            {aiNames.length ? (
              <div className="uw-tpl-fields">
                {aiNames.map((name, index) => (
                  <Field key={name}>
                    <FieldLabel htmlFor={`tpl-ai-${index}`}>{name}</FieldLabel>
                    <Textarea
                      id={`tpl-ai-${index}`}
                      rows={2}
                      maxLength={2000}
                      value={form.aiInstructions[name] ?? ""}
                      readOnly={readOnly}
                      disabled={busy}
                      placeholder="이 구간에 AI가 무엇을 어떻게 쓸지 적으세요"
                      onChange={(event) =>
                        setForm({
                          ...form,
                          aiInstructions: {
                            ...form.aiInstructions,
                            [name]: event.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                ))}
                <p className="uw-tpl-muted">
                  제목과 본문에서 빠진 구간의 지시문은 저장할 때 지워집니다.
                </p>
              </div>
            ) : (
              <p className="uw-tpl-muted">
                제목이나 본문에 AI 구간을 넣으면 구간마다 지시문 입력란이
                생깁니다.
              </p>
            )}
          </section>

          <section className="uw-tpl-block" aria-labelledby="tpl-preview-title">
            <h3 id="tpl-preview-title">미리보기</h3>
            <p className="uw-tpl-muted">
              자동 입력은 예시 값으로 채웠습니다. AI 구간과 담당자 입력 자리는
              표시만 합니다.
            </p>
            <div className="uw-tpl-preview">
              <strong>
                {form.subject ? (
                  <Preview text={form.subject} autoFields={data.autoFields} />
                ) : (
                  "제목 없음"
                )}
              </strong>
              <p>
                {form.body ? (
                  <Preview text={form.body} autoFields={data.autoFields} />
                ) : (
                  "본문 없음"
                )}
              </p>
            </div>
          </section>

          {!readOnly && (
            <section className="uw-tpl-block" aria-labelledby="tpl-history-title">
              <h3 id="tpl-history-title">수정 이력</h3>
              {versionsError && (
                <WorkspaceError
                  message={versionsError}
                  onRetry={() => void loadVersions(selected)}
                />
              )}
              {!versionsError && (
                <WorkspaceTable
                  caption={`${selected.name} 수정 이력`}
                  className="uw-tpl-history"
                  columns={[
                    { key: "version", label: "버전" },
                    { key: "by", label: "수정자" },
                    { key: "at", label: "수정 시각" },
                    { key: "open", label: <span className="sr-only">내용</span> },
                  ]}
                  loading={versions === null}
                  empty={versions?.length === 0}
                  emptyTitle="아직 저장한 버전이 없습니다."
                >
                  {versions?.map((item) => (
                    <TableRow
                      key={item.version}
                      data-state={item.version === viewing ? "selected" : undefined}
                    >
                      <TableCell className="ds-table-primary">
                        버전 {item.version}
                        {item.version === selected.version ? " (현재)" : ""}
                      </TableCell>
                      <TableCell>{item.createdBy ?? "수정자 미확인"}</TableCell>
                      <TableCell>{dateTime(item.createdAt)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-expanded={item.version === viewing}
                          onClick={() =>
                            setViewing(
                              item.version === viewing ? null : item.version,
                            )
                          }
                        >
                          {item.version === viewing ? "닫기" : "보기"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </WorkspaceTable>
              )}
              {viewed && (
                <div
                  className="uw-tpl-version"
                  aria-label={`버전 ${viewed.version} 내용`}
                >
                  <div className="uw-tpl-version-head">
                    <h3>버전 {viewed.version} 내용</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setForm({
                          ...form,
                          subject: viewed.subject,
                          body: viewed.body,
                          aiInstructions: { ...viewed.aiInstructions },
                        });
                        setNotice(
                          `버전 ${viewed.version} 내용을 편집기로 불러왔습니다. 저장해야 적용됩니다.`,
                        );
                        document.getElementById("tpl-name")?.scrollIntoView({
                          block: "center",
                        });
                      }}
                    >
                      이 내용을 편집기로 불러오기
                    </Button>
                  </div>
                  <div className="uw-tpl-preview">
                    <strong>{viewed.subject || "제목 없음"}</strong>
                    <p>{viewed.body || "본문 없음"}</p>
                  </div>
                  {Object.entries(viewed.aiInstructions).length > 0 && (
                    <dl className="uw-tpl-instructions">
                      {Object.entries(viewed.aiInstructions).map(
                        ([name, text]) => (
                          <div key={name}>
                            <dt>{name}</dt>
                            <dd>{text || "지시문 없음"}</dd>
                          </div>
                        ),
                      )}
                    </dl>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <aside className="uw-tpl-guide" aria-labelledby="tpl-guide-title">
        <h2 id="tpl-guide-title">쓸 수 있는 자리</h2>
        <section aria-labelledby="tpl-guide-auto">
          <h3 id="tpl-guide-auto">자동 입력</h3>
          <p className="uw-tpl-muted">
            초안을 만들 때 서버가 채웁니다. 누르면 커서 위치에 들어갑니다.
          </p>
          <ul className="uw-tpl-auto">
            {data.autoFields.map((field) => (
              <li key={field.name}>
                <button
                  type="button"
                  disabled={readOnly || busy || !form}
                  onClick={() => insert(`{{${field.name}}}`)}
                >
                  <code>{`{{${field.name}}}`}</code>
                  <span>
                    {field.description}
                    {field.sample ? ` · 예: ${field.sample}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="tpl-guide-ai">
          <h3 id="tpl-guide-ai">AI 작성</h3>
          <p className="uw-tpl-muted">
            <code>{"{{AI:제안 동기}}"}</code>처럼 쓰면 그 자리를 AI가 씁니다.
            구간 이름마다 기본 지시문을 적을 수 있습니다.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={readOnly || busy || !form}
            onClick={() => insert("{{AI:구간 이름}}", "구간 이름")}
          >
            <Plus /> AI 구간 넣기
          </Button>
        </section>
        <section aria-labelledby="tpl-guide-input">
          <h3 id="tpl-guide-input">담당자 입력</h3>
          <p className="uw-tpl-muted">
            <code>{"{{입력:불발 사유}}"}</code>처럼 쓰면 기록이 없을 때 초안에{" "}
            <code>[입력 필요: 불발 사유]</code>로 남습니다. 담당자가 채워야 발송을
            기록할 수 있습니다.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={readOnly || busy || !form}
            onClick={() => insert("{{입력:항목 이름}}", "항목 이름")}
          >
            <Plus /> 담당자 입력 넣기
          </Button>
        </section>
      </aside>
    </div>
  );
}
