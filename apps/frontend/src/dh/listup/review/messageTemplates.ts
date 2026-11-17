import type { HumanReviewTransport } from "./humanReviewApi";

export type MessageTemplateKind = "new" | "recontact" | "repeat_collaboration";
export interface MessageTemplate {
  id: string;
  kind: MessageTemplateKind;
  name: string;
  /** 0이면 아직 내용이 없는 양식이다. */
  version: number;
  subject: string;
  body: string;
  aiInstructions: Record<string, string>;
  updatedAt: string | null;
  updatedBy: string | null;
}
export interface AutoField {
  name: string;
  description: string;
  sample: string;
}
export interface SenderInfo {
  leadName: string | null;
  leadPhone: string | null;
  email: string;
}
export interface MessageTemplateData {
  canManage: boolean;
  sender: SenderInfo;
  autoFields: AutoField[];
  templates: MessageTemplate[];
}
export interface MessageTemplateVersion {
  version: number;
  subject: string;
  body: string;
  aiInstructions: Record<string, string>;
  createdAt: string;
  createdBy: string | null;
}
export interface MessageTemplateInput {
  expectedVersion: number;
  name: string;
  subject: string;
  body: string;
  aiInstructions: Record<string, string>;
}
/** 작업 상세 응답의 messageTemplate 필드. */
export interface MessageTemplateHint {
  kind: MessageTemplateKind;
  suggestedTemplateId: string | null;
}
export interface MessageTemplateStore {
  load(): Promise<MessageTemplateData>;
  create(
    kind: MessageTemplateKind,
    name: string,
    key: string,
  ): Promise<MessageTemplate>;
  update(
    id: string,
    input: MessageTemplateInput,
    key: string,
  ): Promise<MessageTemplate>;
  versions(id: string): Promise<MessageTemplateVersion[]>;
}

export const templateKinds: MessageTemplateKind[] = [
  "new",
  "recontact",
  "repeat_collaboration",
];
export const templateKindLabels: Record<MessageTemplateKind, string> = {
  new: "신규 발굴",
  recontact: "과거 컨택",
  repeat_collaboration: "재수주",
};

export class MessageTemplateApi implements MessageTemplateStore {
  constructor(private readonly api: HumanReviewTransport) {}
  async load() {
    return (await this.api.request<MessageTemplateData>("/message-templates"))
      .data;
  }
  async create(kind: MessageTemplateKind, name: string, key: string) {
    return (
      await this.api.request<MessageTemplate>(
        "/message-templates",
        "POST",
        { kind, name },
        key,
      )
    ).data;
  }
  async update(id: string, input: MessageTemplateInput, key: string) {
    return (
      await this.api.request<MessageTemplate>(
        `/message-templates/${encodeURIComponent(id)}`,
        "PUT",
        input,
        key,
      )
    ).data;
  }
  async versions(id: string) {
    return (
      await this.api.request<MessageTemplateVersion[]>(
        `/message-templates/${encodeURIComponent(id)}/versions`,
      )
    ).data;
  }
}

export type TemplateTokenKind = "auto" | "ai" | "input";
export interface TemplateToken {
  kind: TemplateTokenKind;
  name: string;
  raw: string;
  index: number;
}
const tokenPattern = /\{\{([^{}]*)\}\}/g;
const aiPrefix = "AI:";
const inputPrefix = "입력:";
function classify(inner: string): Pick<TemplateToken, "kind" | "name"> {
  const text = inner.trim();
  if (text.startsWith(aiPrefix))
    return { kind: "ai", name: text.slice(aiPrefix.length).trim() };
  if (text.startsWith(inputPrefix))
    return { kind: "input", name: text.slice(inputPrefix.length).trim() };
  return { kind: "auto", name: text };
}
/** `{{이름}}`, `{{AI:이름}}`, `{{입력:이름}}` 자리를 나온 순서대로 찾는다. */
export function templateTokens(text: string): TemplateToken[] {
  return [...text.matchAll(tokenPattern)].map((match) => ({
    ...classify(match[1]),
    raw: match[0],
    index: match.index ?? 0,
  }));
}
const unique = (names: string[]) => [...new Set(names)];
/** 제목과 본문에 나온 AI 구간 이름. 같은 이름은 한 번만, 나온 순서대로. */
export function aiSectionNames(subject: string, body: string) {
  return unique(
    templateTokens(`${subject}\n${body}`)
      .filter((token) => token.kind === "ai" && token.name)
      .map((token) => token.name),
  );
}
/** 서버가 채울 수 없는 자동 입력 이름. 하나라도 있으면 저장할 수 없다. */
export function unknownAutoFields(
  subject: string,
  body: string,
  autoFields: Pick<AutoField, "name">[],
) {
  const known = new Set(autoFields.map((field) => field.name));
  return unique(
    templateTokens(`${subject}\n${body}`)
      .filter((token) => token.kind === "auto" && !known.has(token.name))
      .map((token) => token.name || "(빈 이름)"),
  );
}
/** 이름이 빈 AI 구간·담당자 입력 자리. `{{AI:}}`처럼 쓰다 만 것을 저장 전에 잡는다. */
export function unnamedTokens(subject: string, body: string) {
  return unique(
    templateTokens(`${subject}\n${body}`)
      .filter((token) => token.kind !== "auto" && !token.name)
      .map((token) => token.raw),
  );
}
/** 본문에서 빠진 구간의 지시문은 버리고, 남은 구간은 본문 순서대로 돌려준다. */
export function pruneAiInstructions(
  instructions: Record<string, string>,
  names: string[],
) {
  return Object.fromEntries(
    names.map((name) => [name, (instructions[name] ?? "").trim()]),
  );
}

export type PreviewSegment = {
  text: string;
  kind: "text" | "ai" | "input" | "unknown";
};
export const aiPreviewMark = (name: string) => `〔AI: ${name}〕`;
export const inputNeededPrefix = "[입력 필요:";
export const inputNeededMark = (name: string) => `${inputNeededPrefix} ${name}]`;
/** 미리보기 조각. 자동 입력은 예시 값으로 채우고, 모르는 이름은 원문 그대로 남긴다. */
export function previewSegments(
  text: string,
  autoFields: AutoField[],
): PreviewSegment[] {
  const samples = new Map(autoFields.map((field) => [field.name, field.sample]));
  const segments: PreviewSegment[] = [];
  const push = (value: string, kind: PreviewSegment["kind"]) => {
    if (!value) return;
    const last = segments[segments.length - 1];
    if (last && last.kind === "text" && kind === "text") last.text += value;
    else segments.push({ text: value, kind });
  };
  let cursor = 0;
  for (const token of templateTokens(text)) {
    push(text.slice(cursor, token.index), "text");
    if (token.kind === "ai") push(aiPreviewMark(token.name), "ai");
    else if (token.kind === "input") push(inputNeededMark(token.name), "input");
    else if (samples.has(token.name)) push(samples.get(token.name)!, "text");
    else push(token.raw, "unknown");
    cursor = token.index + token.raw.length;
  }
  push(text.slice(cursor), "text");
  return segments;
}
export function renderTemplatePreview(text: string, autoFields: AutoField[]) {
  return previewSegments(text, autoFields)
    .map((segment) => segment.text)
    .join("");
}
/** 초안에 담당자가 채워야 할 자리가 남아 있는지. 남아 있으면 발송 기록을 막는다. */
export function needsManualInput(...texts: (string | null | undefined)[]) {
  return texts.some((text) => text?.includes(inputNeededPrefix));
}
/** 커서 위치(또는 선택 영역)에 글자를 넣고, 넣은 뒤의 커서 위치를 함께 돌려준다. */
export function insertAtCursor(
  text: string,
  start: number,
  end: number,
  inserted: string,
) {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  return {
    text: text.slice(0, from) + inserted + text.slice(to),
    cursor: from + inserted.length,
  };
}

export interface TemplateChoice {
  /** 해당 경우의 양식 전체. */
  options: MessageTemplate[];
  /** 처음 선택해 둘 양식. 쓸 수 있는 양식이 없으면 null. */
  defaultId: string | null;
  /** 양식이 모두 비어 있어 초안을 만들 수 없는 상태. */
  blocked: boolean;
}
/** 초안 화면의 양식 선택 규칙. 양식을 아직 못 불러왔으면(null) 아무것도 막지 않는다. */
export function templateChoice(
  templates: MessageTemplate[] | null | undefined,
  kind: MessageTemplateKind,
  preferredIds: (string | null | undefined)[] = [],
): TemplateChoice {
  if (!templates) return { options: [], defaultId: null, blocked: false };
  const options = templates.filter((template) => template.kind === kind);
  const usable = options.filter((template) => template.version > 0);
  const preferred = preferredIds
    .map((id) => usable.find((template) => template.id === id))
    .find(Boolean);
  return {
    options,
    defaultId: (preferred ?? usable[0])?.id ?? null,
    blocked: usable.length === 0,
  };
}
