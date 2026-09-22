import type {
  CompanyCommand,
  Scenario,
  SearchInput,
  Workspace,
} from "../models/outreach";
import { reasons } from "../models/outreach";
import { excluded, inactiveStages } from "../models/policy";
import {
  RepositoryError,
  type OutreachRepository,
} from "../services/outreachRepository";
import { contacts, createFixtures, templates } from "./fixtures";

export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const KEY = "dhbot-frontend-v1";
const clone = <T>(value: T): T => structuredClone(value);
const requireThat = (condition: unknown, code: string, message: string) => {
  if (!condition) throw new RepositoryError(code, message);
};
// Development adapter only. Browser persistence is not a production database or authorization boundary.
export function createMockRepository(
  storage: StoragePort,
  scenario: Scenario = "normal",
  delay = 350,
): OutreachRepository {
  async function wait(write = false) {
    await new Promise((resolve) =>
      setTimeout(resolve, scenario === "slow" ? 1800 : delay),
    );
    requireThat(
      scenario !== "forbidden",
      "FORBIDDEN",
      "이 작업에 접근할 권한이 없습니다.",
    );
    requireThat(
      !(write && scenario === "save-error"),
      "SAVE_FAILED",
      "저장에 실패했습니다. 입력은 유지됩니다. 다시 시도해 주세요.",
    );
    requireThat(
      !(!write && scenario === "read-error"),
      "LOAD_FAILED",
      "데이터를 불러오지 못했습니다. 다시 시도해 주세요.",
    );
  }
  function read(): Workspace {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return createFixtures();
      const value = JSON.parse(raw) as Workspace;
      requireThat(
        Array.isArray(value.cycles) &&
          value.cycles.length > 0 &&
          Array.isArray(value.companies),
        "INVALID_DATA",
        "개발용 저장 데이터 형식이 잘못되었습니다.",
      );
      return value;
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      throw new RepositoryError(
        "STORAGE_READ",
        "브라우저 저장 데이터를 읽을 수 없습니다. 개발 설정에서 초기화할 수 있습니다.",
      );
    }
  }
  function save(value: Workspace) {
    try {
      storage.setItem(KEY, JSON.stringify(value));
    } catch {
      throw new RepositoryError(
        "STORAGE_WRITE",
        "브라우저 저장 공간에 기록하지 못했습니다. 입력은 유지됩니다.",
      );
    }
    return clone(value);
  }
  return {
    async load() {
      await wait();
      const value = read();
      return scenario === "empty" ? { ...value, companies: [] } : clone(value);
    },
    async getTemplates() {
      return clone(templates);
    },
    async reset() {
      await wait(true);
      return save(createFixtures());
    },
    async search(input: SearchInput, expectedCycleId: string) {
      await wait(true);
      const value = read();
      const current = value.cycles.at(-1)!;
      requireThat(
        current.id === expectedCycleId,
        "CYCLE_CHANGED",
        "현재 차수가 바뀌었습니다. 새로고침 후 다시 시도해 주세요.",
      );
      requireThat(
        input.domains.length &&
          input.sources.length &&
          (!input.newCycle || input.name.trim()),
        "VALIDATION",
        "차수 이름과 탐색 조건을 확인해 주세요.",
      );
      let target = current;
      if (input.newCycle) {
        requireThat(
          !Number.isNaN(Date.parse(input.startedAt)),
          "VALIDATION",
          "차수 시작 시각이 올바르지 않습니다.",
        );
        target = {
          id: crypto.randomUUID(),
          name: input.name.trim(),
          startedAt: input.startedAt,
        };
        current.endedAt = input.startedAt;
        value.cycles.push(target);
        value.companies = value.companies.map((c) => ({
          ...c,
          version: c.version + 1,
          ...(c.lastSentCycleId ? { lastLabel: "이전 차수" } : {}),
          ...(c.stage === "이번 차수 건너뛰기"
            ? {
                stage: "기업 검토" as const,
                cycleId: target.id,
                skipCycleId: undefined,
                history: [...c.history, `${target.name} · 검토 복귀`],
              }
            : {}),
          ...(c.stage === "응답 확인" ? { confirmed: false } : {}),
        }));
      }
      value.companies.unshift({
        id: crypto.randomUUID(),
        cycleId: target.id,
        version: 1,
        name: `새봄랩 ${value.companies.length + 1}`,
        product: "앱 기반 서비스",
        domain: input.domains[0],
        route: "신규 컨택",
        stage: "기업 검토",
        owner: "재욱",
        reason: `선호 도메인 ${input.domains.join(", ")} · 소스 ${input.sources.join(", ")} · 샘플 조사`,
        history: [],
        sentRecords: [],
      });
      return save(value);
    },
    async execute(id: string, version: number, command: CompanyCommand) {
      await wait(true);
      const value = read();
      const cycle = value.cycles.at(-1)!;
      const c = value.companies.find((x) => x.id === id);
      requireThat(c, "NOT_FOUND", "기업을 찾을 수 없습니다.");
      if (!c) throw new Error("unreachable");
      requireThat(
        c.version === version,
        "VERSION_CONFLICT",
        "다른 작업에서 변경되었습니다. 내 입력을 복사한 뒤 최신 내용을 다시 불러와 주세요.",
      );
      requireThat(
        !inactiveStages.includes(c.stage),
        "INACTIVE",
        "현재 상태에서는 작업할 수 없습니다.",
      );
      const now = new Date().toISOString();
      const stage = (...allowed: string[]) =>
        requireThat(
          allowed.includes(c.stage),
          "INVALID_STATE",
          "현재 단계에서 할 수 없는 작업입니다.",
        );
      switch (command.type) {
        case "approveCompany":
          stage("기업 검토");
          requireThat(
            c.lastSentCycleId !== cycle.id,
            "SAME_CYCLE_BLOCKED",
            "이번 차수에 이미 발송했습니다.",
          );
          requireThat(
            c.route !== "다른 관계자" || c.confirmed,
            "CONFIRM_REQUIRED",
            "실제 무응답 여부를 먼저 확인해 주세요.",
          );
          requireThat(
            c.route !== "재접촉" || command.reviewNote?.trim(),
            "VALIDATION",
            "재접촉 승인 사유가 필요합니다.",
          );
          c.reviewNote = command.reviewNote;
          c.conditionEvidence = command.conditionEvidence;
          c.stage = "관계자 선택";
          c.cycleId = cycle.id;
          break;
        case "skipForCycle":
        case "excludeCompany":
          requireThat(
            command.type !== "skipForCycle" || c.route !== "신규 컨택",
            "INVALID_STATE",
            "신규 컨택에는 차수 건너뛰기가 없습니다.",
          );
          requireThat(
            c.route !== "재협업" || command.note.trim(),
            "VALIDATION",
            "재협업하지 않는 사유가 필요합니다.",
          );
          c.stage =
            command.type === "skipForCycle"
              ? "이번 차수 건너뛰기"
              : "영구 제외";
          c.skipCycleId =
            command.type === "skipForCycle" ? cycle.id : undefined;
          c.decisionNote = command.note;
          break;
        case "searchContacts":
          stage("관계자 선택");
          c.contacts = clone(contacts).filter((p) => !excluded(c, p));
          break;
        case "selectRecipient": {
          stage("관계자 선택");
          const candidates = [
            ...(c.contacts || []),
            ...(c.route === "재접촉" && c.recontact?.contact
              ? [c.recontact.contact]
              : []),
          ];
          const person = candidates.find((p) => p.id === command.contactId);
          requireThat(
            person && !excluded(c, person),
            "CONTACT_EXCLUDED",
            "선택 가능한 관계자가 아닙니다.",
          );
          c.recipient = clone(person!);
          if (c.draft) c.draft.approvedRevision = undefined;
          break;
        }
        case "changeRecipient":
          stage("초안 검토", "발송 준비");
          c.stage = "관계자 선택";
          if (c.draft) c.draft.approvedRevision = undefined;
          break;
        case "generateDraft": {
          stage("관계자 선택");
          requireThat(
            c.recipient && !excluded(c, c.recipient),
            "CONTACT_EXCLUDED",
            "수신자를 확인해 주세요.",
          );
          if (!c.draft) {
            const t = templates[c.route];
            requireThat(
              t,
              "TEMPLATE_NOT_CONNECTED",
              "지정 템플릿 연결이 필요합니다.",
            );
            if (!t) break;
            const vars: Record<string, string> = {
              companyName: c.name,
              product: c.product,
              recipientName: c.recipient!.name,
              recipientRole: c.recipient!.role,
              topic: "",
              senderName: "Growthhackers",
            };
            const render = (text: string) =>
              text.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => {
                requireThat(
                  key in vars,
                  "TEMPLATE_VARIABLE",
                  "알 수 없는 템플릿 변수: " + key,
                );
                return vars[key];
              });
            c.draft = {
              topic: "",
              subject: render(t.subject),
              body: render(t.body),
              revision: 1,
              templateUsed: { id: t.id, version: t.version },
            };
          }
          c.draft.approvedRevision = undefined;
          c.stage = "초안 검토";
          c.cycleId = cycle.id;
          break;
        }
        case "saveDraft":
          stage("초안 검토", "발송 준비");
          c.draft = {
            ...c.draft,
            ...command.values,
            revision: (c.draft?.revision || 0) + 1,
            approvedRevision: undefined,
          };
          c.stage = "초안 검토";
          break;
        case "approveDraft":
          stage("초안 검토");
          requireThat(
            c.draft && c.draft.revision === command.revision,
            "VERSION_CONFLICT",
            "저장된 최신 초안을 다시 확인해 주세요.",
          );
          requireThat(
            c.draft?.topic.trim() &&
              c.draft.subject.trim() &&
              c.draft.body.trim() &&
              c.recipient,
            "VALIDATION",
            "수신자·주제·제목·본문을 확인해 주세요.",
          );
          c.draft!.approvedRevision = command.revision;
          c.stage = "발송 준비";
          break;
        case "recordSimulatedSend": {
          stage("발송 준비");
          requireThat(
            c.lastSentCycleId !== cycle.id,
            "SAME_CYCLE_BLOCKED",
            "같은 차수에 다시 발송할 수 없습니다.",
          );
          requireThat(
            c.recipient && !excluded(c, c.recipient),
            "CONTACT_EXCLUDED",
            "수신자를 확인해 주세요.",
          );
          requireThat(
            c.draft &&
              c.draft.approvedRevision === command.revision &&
              c.draft.revision === command.revision,
            "VERSION_CONFLICT",
            "최신 초안의 검토를 완료해 주세요.",
          );
          const draft = c.draft!;
          c.sentRecords.push({
            id: crypto.randomUUID(),
            recipient: clone(c.recipient!),
            subject: draft.subject,
            body: draft.body,
            topic: draft.topic,
            time: now,
            cycleId: cycle.id,
            cycleName: cycle.name,
            templateUsed: clone(draft.templateUsed),
          });
          c.previousContact = clone(c.recipient!);
          c.lastSentCycleId = cycle.id;
          c.lastLabel = "이번 차수";
          c.cycleId = cycle.id;
          c.route = "다른 관계자";
          c.stage = "응답 확인";
          c.confirmed = false;
          c.response = undefined;
          draft.approvedRevision = undefined;
          break;
        }
        case "saveResponse": {
          stage("응답 확인");
          const r = command.values;
          requireThat(
            !["거절", "보류"].includes(r.result) ||
              (r.category &&
                reasons.includes(r.category) &&
                (r.category !== "기타" || r.note.trim())),
            "VALIDATION",
            "거절·보류 사유와 기타 설명을 확인해 주세요.",
          );
          c.response = { ...r, time: now, by: "재욱 (샘플)" };
          c.confirmed = r.result === "답변 없음";
          if (r.result === "답변 없음")
            c.stage =
              c.lastSentCycleId === cycle.id ? "응답 확인" : "기업 검토";
          if (r.result === "논의 시작") c.stage = "논의 중";
          if (["거절", "보류"].includes(r.result)) {
            c.route = "재접촉";
            c.stage = "보류";
            c.recontact = {
              reason: r.category!,
              reply: r.note || "원문 미등록",
              condition: r.revisit || "재접촉 조건 확인 필요",
              contact: c.recipient || c.previousContact,
            };
          }
          if (r.result === "연락 종료") c.stage = "제외";
          break;
        }
      }
      const labels: Record<CompanyCommand["type"], string> = {
        approveCompany: "기업 승인",
        skipForCycle: "이번 차수 건너뛰기",
        excludeCompany: "영구 제외",
        searchContacts: "관계자 탐색 (샘플)",
        selectRecipient: "수신자 선택",
        changeRecipient: "수신자 변경",
        generateDraft: "초안 검토 시작",
        saveDraft: "초안 저장",
        approveDraft: "초안 검토 완료",
        recordSimulatedSend: "발송 시뮬레이션",
        saveResponse: "응답 확인",
      };
      c.history.push(
        `${now} · ${labels[command.type]}${command.type === "saveResponse" ? " · " + command.values.result + (command.values.category ? " · " + command.values.category : "") + (command.values.note ? " · " + command.values.note : "") + (command.values.revisit ? " · 재논의: " + command.values.revisit : "") : ""}${"note" in command && command.note ? " · " + command.note : ""}${command.type === "approveCompany" && command.reviewNote ? " · " + command.reviewNote : ""}`,
      );
      c.version++;
      return save(value);
    },
  };
}
