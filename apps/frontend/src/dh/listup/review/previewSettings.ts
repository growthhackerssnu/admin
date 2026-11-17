import { AcquisitionQuarterApi } from "./acquisitionQuarter";
import type { AcquisitionRound, TargetQuarter } from "./contracts";
import { initialMessageTemplateData, initialReviewData } from "./fixtures";
import {
  HumanReviewApiError,
  type ApiEnvelope,
  type HumanReviewTransport,
} from "./humanReviewApi";
import type {
  AssignmentInput,
  AssignmentPreview,
  OperationsSummary,
} from "./liveRepository";
import {
  MessageTemplateApi,
  aiSectionNames,
  inputNeededMark,
  pruneAiInstructions,
  templateKinds,
  templateTokens,
  unknownAutoFields,
  type MessageTemplate,
  type MessageTemplateData,
  type MessageTemplateInput,
  type MessageTemplateKind,
  type MessageTemplateVersion,
} from "./messageTemplates";
import type { SettingsRepository } from "./settingsRepository";

/** 로그인 없는 개발 화면용 메모리 서버. 실제 API·AI·DB를 호출하지 않는다. */
interface PreviewState {
  templateData: MessageTemplateData;
  versions: Record<string, MessageTemplateVersion[]>;
  quarters: TargetQuarter[];
  round: AcquisitionRound | null;
}
const storageKey = "dh-settings-preview-v1";
const previewEditor = "샘플 팀장";

function initialState(): PreviewState {
  const templateData = initialMessageTemplateData();
  const round = initialReviewData().currentRound ?? null;
  return {
    templateData,
    versions: Object.fromEntries(
      templateData.templates.map((template) => [
        template.id,
        Array.from({ length: template.version }, (_, index) => ({
          version: template.version - index,
          subject: template.subject,
          body:
            index === 0
              ? template.body
              : template.body.replace("\n\n감사합니다.", "\n\n고맙습니다."),
          aiInstructions: template.aiInstructions,
          createdAt: new Date(
            Date.parse(template.updatedAt ?? "2026-11-02T05:20:00.000Z") -
              index * 86_400_000,
          ).toISOString(),
          createdBy: template.updatedBy,
        })),
      ]),
    ),
    quarters: [
      { id: "preview-quarter-2026-4", year: 2026, quarter: 4 },
      ...(round ? [round.targetQuarter] : []),
    ],
    round,
  };
}
let memory: PreviewState | null = null;
function state(): PreviewState {
  if (memory) return memory;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as PreviewState;
      if (Array.isArray(parsed.templateData?.templates) && parsed.versions)
        return (memory = parsed);
    }
  } catch {
    /* 저장소를 쓸 수 없으면 메모리만 쓴다 */
  }
  return (memory = initialState());
}
function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(memory));
  } catch {
    /* 메모리에는 남아 있다 */
  }
}
/** 테스트에서 샘플 자료를 처음 상태로 되돌린다. */
export function resetPreviewSettings() {
  memory = initialState();
}
export function previewTemplate(id: string | null | undefined) {
  return state().templateData.templates.find((item) => item.id === id);
}
/** 샘플 초안. 자동 입력은 넘겨받은 값(없으면 예시 값)으로, AI 구간은 고정 문구로 채운다. */
export function renderPreviewDraft(
  template: MessageTemplate,
  values: Record<string, string | null | undefined>,
  aiText: (name: string, instruction: string) => string,
) {
  const samples = new Map(
    state().templateData.autoFields.map((field) => [field.name, field.sample]),
  );
  const fill = (text: string) => {
    let cursor = 0;
    let result = "";
    for (const token of templateTokens(text)) {
      result += text.slice(cursor, token.index);
      result +=
        token.kind === "ai"
          ? aiText(token.name, template.aiInstructions[token.name] ?? "")
          : token.kind === "input"
            ? inputNeededMark(token.name)
            : values[token.name] || samples.get(token.name) || token.raw;
      cursor = token.index + token.raw.length;
    }
    return result + text.slice(cursor);
  };
  return { subject: fill(template.subject), body: fill(template.body) };
}

function fail(message: string, status: number, code: string): never {
  throw new HumanReviewApiError(message, status, code);
}
export class PreviewSettingsTransport implements HumanReviewTransport {
  constructor(private readonly canManage = true) {}
  async request<T, Metadata extends object = Record<never, never>>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<ApiEnvelope<T> & Metadata> {
    const data = this.route(path.split("?")[0], method, body);
    if (method !== "GET") persist();
    return { data: structuredClone(data) } as ApiEnvelope<T> & Metadata;
  }
  private manage() {
    if (!this.canManage)
      fail("팀장 또는 관리자만 변경할 수 있습니다.", 403, "FORBIDDEN");
  }
  private route(path: string, method: string, body: unknown): unknown {
    const current = state();
    if (path === "/acquisition-rounds/current") return current.round;
    if (path === "/target-quarters" && method === "GET")
      return current.quarters;
    if (path === "/target-quarters") {
      this.manage();
      const { year, quarter } = body as { year: number; quarter: number };
      const existing = current.quarters.find(
        (item) => item.year === year && item.quarter === quarter,
      );
      if (existing) return existing;
      const added = { id: `preview-quarter-${year}-${quarter}`, year, quarter };
      current.quarters = [...current.quarters, added].sort(
        (a, b) => a.year - b.year || a.quarter - b.quarter,
      );
      return added;
    }
    if (path === "/acquisition-rounds") {
      this.manage();
      const { targetQuarterId, expectedActiveRoundId } = body as {
        targetQuarterId: string;
        expectedActiveRoundId: string | null;
      };
      if ((current.round?.id ?? null) !== expectedActiveRoundId)
        fail("수주 분기가 이미 변경됐습니다.", 409, "ROUND_CHANGED");
      const targetQuarter = current.quarters.find(
        (item) => item.id === targetQuarterId,
      );
      if (!targetQuarter)
        return fail("등록된 분기를 선택해주세요.", 422, "VALIDATION_ERROR");
      const closedRoundId = current.round?.id ?? null;
      current.round = {
        id: `preview-round-${targetQuarter.year}-${targetQuarter.quarter}`,
        targetQuarter,
        startedAt: new Date().toISOString(),
        endedAt: null,
      };
      return { currentRound: current.round, closedRoundId, unresolvedCount: 0 };
    }
    if (path === "/message-templates" && method === "GET")
      return { ...current.templateData, canManage: this.canManage };
    if (path === "/message-templates") {
      this.manage();
      const { kind, name } = body as {
        kind: MessageTemplateKind;
        name: string;
      };
      if (!templateKinds.includes(kind) || !name?.trim())
        fail("양식 이름을 입력해주세요.", 422, "VALIDATION_ERROR");
      const created: MessageTemplate = {
        id: `template-${crypto.randomUUID()}`,
        kind,
        name: name.trim(),
        version: 0,
        subject: "",
        body: "",
        aiInstructions: {},
        updatedAt: null,
        updatedBy: null,
      };
      current.templateData.templates.push(created);
      current.versions[created.id] = [];
      return created;
    }
    const match = /^\/message-templates\/([^/]+)(\/versions)?$/.exec(path);
    if (match) {
      this.manage();
      const id = decodeURIComponent(match[1]);
      const index = current.templateData.templates.findIndex(
        (item) => item.id === id,
      );
      if (index < 0) return fail("양식을 찾을 수 없습니다.", 404, "NOT_FOUND");
      if (match[2]) return current.versions[id] ?? [];
      const template = current.templateData.templates[index];
      const input = body as MessageTemplateInput;
      if (input.expectedVersion !== template.version)
        fail("다른 사람이 먼저 수정했습니다.", 409, "VERSION_CONFLICT");
      if (!input.name.trim() || !input.subject.trim() || !input.body.trim())
        fail("이름, 제목, 본문을 모두 입력해주세요.", 422, "VALIDATION_ERROR");
      const unknown = unknownAutoFields(
        input.subject,
        input.body,
        current.templateData.autoFields,
      );
      if (unknown.length)
        fail(
          `쓸 수 없는 자동 입력 이름이 있습니다: ${unknown.join(", ")}`,
          422,
          "VALIDATION_ERROR",
        );
      const now = new Date().toISOString();
      const saved: MessageTemplate = {
        ...template,
        name: input.name.trim(),
        subject: input.subject,
        body: input.body,
        aiInstructions: pruneAiInstructions(
          input.aiInstructions,
          aiSectionNames(input.subject, input.body),
        ),
        version: template.version + 1,
        updatedAt: now,
        updatedBy: previewEditor,
      };
      current.templateData.templates[index] = saved;
      current.versions[id] = [
        {
          version: saved.version,
          subject: saved.subject,
          body: saved.body,
          aiInstructions: saved.aiInstructions,
          createdAt: now,
          createdBy: previewEditor,
        },
        ...(current.versions[id] ?? []),
      ];
      return saved;
    }
    return fail("샘플 화면에서 지원하지 않는 요청입니다.", 404, "NOT_FOUND");
  }
}

export const previewMessageTemplates = new MessageTemplateApi(
  new PreviewSettingsTransport(),
);

const previewMembers = [
  { id: "preview-a", name: "샘플 팀원 A" },
  { id: "preview-b", name: "샘플 팀원 B" },
  { id: "preview-c", name: "샘플 팀원 C" },
];
const previewQueue = [
  "모닝루프",
  "클리어노트",
  "플로우데이터",
  "폴드마켓",
  "더브이씨",
  "슈퍼센트",
  "원셀프월드",
  "넥스트웨이브",
  "핀플로우",
  "스택노트",
  "루미데이터",
  "비즈브릿지",
];
/** 설정 페이지 샘플 저장소. `canManage=false`로 권한 없는 화면을 볼 수 있다. */
export function createPreviewSettingsRepository(
  canManage = true,
): SettingsRepository {
  const transport = new PreviewSettingsTransport(canManage);
  const summary: OperationsSummary = {
    assignable: previewQueue.length,
    researching: 3,
    researchError: 1,
    assigned: 8,
    autoExcluded: 5,
    intakePaused: false,
    intakeVersion: 1,
    canManage,
    pipelineEnabled: true,
  };
  return {
    acquisitionQuarters: new AcquisitionQuarterApi(transport),
    messageTemplates: new MessageTemplateApi(transport),
    loadOperations: async () => ({
      summary: { ...summary },
      members: canManage ? previewMembers : [],
    }),
    setIntake: async (paused) => {
      summary.intakePaused = paused;
      summary.intakeVersion += 1;
      return { paused, version: summary.intakeVersion };
    },
    previewAssignment: async (input: AssignmentInput) => {
      const items = input.memberIds.flatMap((memberId, memberIndex) =>
        Array.from({ length: input.perMemberCount }, (_, index) => {
          const position = memberIndex * input.perMemberCount + index;
          return {
            candidateId: `preview-candidate-${position}`,
            companyName: previewQueue[position % previewQueue.length],
            memberId,
          };
        }),
      );
      return {
        ...input,
        eligibleCount: summary.assignable,
        selectedCount: items.length,
        items,
      };
    },
    confirmAssignment: async (preview: AssignmentPreview) => {
      summary.assignable -= preview.selectedCount;
      summary.assigned += preview.selectedCount;
      return null;
    },
  };
}
