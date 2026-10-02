import { contactMessage } from "../messageTemplate";
import { initialReviewData } from "./fixtures";
import {
  canCopy,
  currentActor,
  validRecipient,
  draftCurrent,
  type Actor,
  type CandidateCommand,
  type ReviewData,
  type ReviewRepository,
} from "./contracts";

export function applyCommand(
  data: ReviewData,
  id: string,
  version: number,
  command: CandidateCommand,
  actor: Actor = currentActor,
): ReviewData {
  const next = structuredClone(data);
  const candidate = next.candidates.find((item) => item.id === id);
  if (!candidate) throw new Error("기업을 찾을 수 없습니다.");
  if (candidate.version !== version)
    throw new Error(
      "다른 변경이 저장되었습니다. 새로고침 후 다시 확인해주세요.",
    );
  if (candidate.owner && candidate.owner.id !== actor.id)
    throw new Error("다른 담당자가 검토 중입니다.");
  if (command.type !== "claim" && command.type !== "retry" && !candidate.owner)
    throw new Error("배정된 기업만 변경할 수 있습니다.");
  const invalidate = () => {
    if (candidate.draft) candidate.draft.approvedRevision = null;
  };
  switch (command.type) {
    case "claim":
      if (candidate.researchStatus !== "ready")
        throw new Error("조사가 완료된 후 검토를 시작할 수 있습니다.");
      candidate.owner = actor;
      if (candidate.reviewStatus === "unreviewed")
        candidate.reviewStatus = "reviewing";
      break;
    case "contact":
      if (!validRecipient(command.recipient))
        throw new Error(
          "이름과 올바른 LinkedIn 프로필 또는 이메일을 입력해주세요.",
        );
      const savedRecipient = {
        ...command.recipient,
        name: command.recipient.name.trim(),
        title: command.recipient.title.trim(),
        address: command.recipient.address.trim(),
      };
      const contacts = candidate.contacts ?? (candidate.recipient ? [candidate.recipient] : []);
      if (command.mode === "add" || !candidate.recipient) contacts.push(savedRecipient);
      else {
        const index = contacts.findIndex((item) => JSON.stringify(item) === JSON.stringify(candidate.recipient));
        contacts[index < 0 ? 0 : index] = savedRecipient;
      }
      candidate.contacts = contacts;
      candidate.recipient = savedRecipient;
      if (candidate.reviewStatus === "unreviewed")
        candidate.reviewStatus = "reviewing";
      invalidate();
      break;
    case "selectContact": {
      const contact = candidate.contacts?.[command.index];
      if (!contact) throw new Error("선택한 관계자를 찾을 수 없습니다.");
      candidate.recipient = contact;
      invalidate();
      break;
    }
    case "decide":
      if (candidate.researchStatus !== "ready" || !candidate.research)
        throw new Error("조사 자료를 먼저 확인해주세요.");
      if (
        command.status === "approved" &&
        (!candidate.recipient || !validRecipient(candidate.recipient))
      )
        throw new Error("관계자를 저장하면 승인할 수 있습니다.");
      candidate.reviewStatus = command.status;
      candidate.decisions.push({
        status: command.status,
        fit: command.status === "rejected_fit" ? "unfit" : "fit",
        contact:
          command.status === "approved"
            ? "confirmed"
            : command.status === "rejected_contact"
              ? "not_found"
              : "unchecked",
        actor,
        at: new Date().toISOString(),
        researchId: candidate.research.id,
        note: command.note.trim(),
      });
      invalidate();
      break;
    case "reopen":
      candidate.reviewStatus = "reviewing";
      invalidate();
      break;
    case "quarter":
      if (!next.quarters.includes(command.quarter))
        throw new Error("등록된 분기를 선택해주세요.");
      candidate.quarter = command.quarter;
      invalidate();
      break;
    case "generate": {
      if (
        candidate.reviewStatus !== "approved" ||
        !candidate.recipient ||
        !candidate.quarter ||
        !candidate.research
      )
        throw new Error(
          "사람의 승인, 수신자, 목표 분기와 조사 자료가 필요합니다.",
        );
      // Preview only: deterministic rendering of the existing template; never an AI/API fallback.
      const message = contactMessage(
        {
          id,
          name: candidate.name,
          service: candidate.summary,
          area: "서비스 활용",
          about: candidate.research.facts.map((f) => f.text).join(" "),
          possibility:
            candidate.research.ideas[0]?.rationale ??
            "저장된 조사 자료에 기반해 과제를 함께 논의합니다.",
          value: "",
          fit: "fit",
          aiFit: "pending",
          fitChanges: [],
          people: [],
        },
        candidate.quarter,
        [{ name: "샘플 팀장", jobTitle: "대외협력팀장" }],
      );
      candidate.draft = {
        revision: (candidate.draft?.revision ?? 0) + 1,
        approvedRevision: null,
        subject: message.subject,
        body: message.body
          .replaceAll("{{수신자명}}", candidate.recipient.name)
          .replaceAll("{{수신자직함}}", candidate.recipient.title),
        quarter: candidate.quarter,
        researchId: candidate.research.id,
        recipient: structuredClone(candidate.recipient),
      };
      break;
    }
    case "saveDraft":
      if (!candidate.draft || !command.subject.trim() || !command.body.trim())
        throw new Error("제목과 본문을 입력해주세요.");
      candidate.draft.subject = command.subject;
      candidate.draft.body = command.body;
      candidate.draft.revision++;
      invalidate();
      break;
    case "approveDraft":
      if (candidate.reviewStatus !== "approved" || !draftCurrent(candidate))
        throw new Error(
          "현재 분기·관계자·조사 자료로 메시지를 다시 생성해주세요.",
        );
      candidate.draft!.approvedRevision = candidate.draft!.revision;
      break;
    case "send":
      if (!canCopy(candidate))
        throw new Error("현재 조사·분기·수신자와 일치하는 초안이 필요합니다.");
      if (candidate.sent.length)
        throw new Error("이 기업의 첫 발송은 이미 기록됐습니다.");
      candidate.sent.push({
        id: crypto.randomUUID(),
        actor,
        at: new Date().toISOString(),
        draft: structuredClone(candidate.draft!),
      });
      break;
    case "retry":
      if (candidate.researchStatus !== "error" || !candidate.error?.retryable)
        throw new Error("재시도할 수 있는 오류가 아닙니다.");
      candidate.researchStatus = "queued";
      candidate.error = null;
      break;
  }
  candidate.version++;
  return next;
}

const storageKey = "dh-human-review-preview-v1";
interface Envelope {
  data: ReviewData;
  operations: Record<string, string>;
}
function read(): Envelope {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return { data: initialReviewData(), operations: {} };
  const stored = JSON.parse(raw) as Envelope;
  if (
    stored.data?.schema !== 1 ||
    !Array.isArray(stored.data.candidates) ||
    !stored.operations
  )
    throw new Error(
      "미리보기 저장 자료를 읽을 수 없습니다. 브라우저의 해당 미리보기 데이터를 확인해주세요.",
    );
  return stored;
}
async function mutate(
  key: string,
  signature: string,
  update: (data: ReviewData) => ReviewData,
) {
  if (!navigator.locks)
    throw new Error(
      "이 브라우저에서는 미리보기 동시 저장을 지원하지 않습니다.",
    );
  return navigator.locks.request(storageKey, () => {
    const envelope = read();
    if (envelope.operations[key]) {
      if (envelope.operations[key] !== signature)
        throw new Error("다른 작업에 같은 요청 키를 사용할 수 없습니다.");
      return envelope.data;
    }
    const data = update(envelope.data);
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        data,
        operations: { ...envelope.operations, [key]: signature },
      }),
    );
    return data;
  });
}
export const previewRepository: ReviewRepository = {
  mode: "preview",
  load: async () => read().data,
  execute: (id, version, command, key) =>
    mutate(key, JSON.stringify({ id, version, command }), (data) =>
      applyCommand(data, id, version, command),
    ),
  addQuarter: (quarter, key) =>
    mutate(key, JSON.stringify({ quarter }), (data) => {
      if (!/^(20\d{2}|2100)-Q[1-4]$/.test(quarter))
        throw new Error("2000~2100년의 올바른 분기를 입력해주세요.");
      return {
        ...data,
        quarters: [...new Set([...data.quarters, quarter])].sort(),
      };
    }),
};
