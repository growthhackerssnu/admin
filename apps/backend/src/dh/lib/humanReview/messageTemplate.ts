// 메일 양식의 자리 표기를 읽고 채우는 순수 함수. DB나 AI 호출은 여기 없다.
//
// 본문·제목 안의 자리는 세 종류다.
//   {{기업명}}          자동 입력 — 서버가 아는 값으로 채운다. 이름은 AUTO_FIELDS에 있는 것만 쓸 수 있다.
//   {{AI:제안 동기}}     AI 작성 — 구간 이름마다 기본 지시문이 있고, AI가 조사 내용을 바탕으로 쓴다.
//   {{입력:불발 사유}}   담당자 입력 — 저장된 기록에서 확인되면 채우고, 아니면 "[입력 필요: 불발 사유]"로 남긴다.

export const SOCIETY_EMAIL = "contact@ghsnu.com";

// 채워지지 않은 담당자 입력 자리의 표시. 초안에 이 표시가 남아 있으면 발송을 기록할 수 없다.
export const MISSING_INPUT_PREFIX = "[입력 필요:";
export const missingInputMark = (name: string) => `${MISSING_INPUT_PREFIX} ${name}]`;
export const hasMissingInput = (...texts: string[]) => texts.some((text) => text.includes(MISSING_INPUT_PREFIX));

export const AUTO_FIELDS = [
  { name: "기업명", description: "연락할 기업 이름", sample: "모닝루프" },
  { name: "기업명(와/과)", description: "기업 이름에 조사 와/과를 붙인 것", sample: "모닝루프와" },
  { name: "수신자 호칭", description: "인사말에 쓰는 호칭 (기업명 성함 직함님)", sample: "모닝루프 김민수 매니저님" },
  { name: "수신자 지칭", description: "본문에서 수신자를 가리키는 말 (성함님)", sample: "김민수님" },
  { name: "팀장 이름", description: "현재 대외협력 팀장 이름", sample: "홍길동" },
  { name: "팀장 전화번호", description: "현재 대외협력 팀장의 전화번호 (노션 명단)", sample: "010-0000-0000" },
  { name: "학회 메일", description: "학회 대표 메일 주소", sample: SOCIETY_EMAIL },
  { name: "목표 분기", description: "이번 수주의 목표 분기", sample: "2027년 1분기" },
  { name: "프로젝트 기간", description: "목표 분기의 프로젝트 진행 기간", sample: "2027년 1~3월" },
  { name: "킥오프 일정", description: "참여 인원 확정과 킥오프 미팅 시기", sample: "2026년 12월 4주차~2027년 1월 1주차" },
  { name: "중간 발표 일정", description: "중간 발표 시기", sample: "2027년 2월 1~2주차" },
  { name: "최종 발표 일정", description: "최종 발표 시기", sample: "2027년 3월 3~4주차" },
  { name: "차기 기간", description: "다음 분기의 프로젝트 진행 기간", sample: "2027년 4~6월" },
] as const;
export type AutoFieldName = (typeof AUTO_FIELDS)[number]["name"];
const AUTO_NAMES = new Set<string>(AUTO_FIELDS.map((field) => field.name));

const TOKEN = /{{\s*(?:(AI|입력)\s*:\s*)?([^{}]+?)\s*}}/g;

export type TemplateSlots = {
  auto: string[];
  ai: string[];
  manual: string[];
  /** 접두어 없이 썼는데 자동 입력 목록에 없는 이름 */
  unknown: string[];
};

export function parseSlots(...texts: string[]): TemplateSlots {
  const slots = { auto: new Set<string>(), ai: new Set<string>(), manual: new Set<string>(), unknown: new Set<string>() };
  for (const text of texts)
    for (const match of text.matchAll(TOKEN)) {
      const kind = match[1];
      const name = match[2] ?? "";
      if (kind === "AI") slots.ai.add(name);
      else if (kind === "입력") slots.manual.add(name);
      else if (AUTO_NAMES.has(name)) slots.auto.add(name);
      else slots.unknown.add(name);
    }
  return { auto: [...slots.auto], ai: [...slots.ai], manual: [...slots.manual], unknown: [...slots.unknown] };
}

// 저장 전에 양식을 검사한다. 문제가 없으면 빈 배열.
export function templateProblems(subject: string, body: string): string[] {
  const problems: string[] = [];
  if (!subject.trim()) problems.push("제목을 입력하세요.");
  if (!body.trim()) problems.push("본문을 입력하세요.");
  const slots = parseSlots(subject, body);
  if (slots.unknown.length)
    problems.push(`자동 입력 목록에 없는 자리입니다: ${slots.unknown.map((name) => `{{${name}}}`).join(", ")}`);
  // 짝이 맞지 않는 중괄호는 오타일 가능성이 높아 그대로 메일에 나가지 않게 막는다.
  const leftover = `${subject}\n${body}`.replace(TOKEN, "");
  if (leftover.includes("{{") || leftover.includes("}}"))
    problems.push("{{ 와 }} 의 짝이 맞지 않는 곳이 있습니다.");
  return problems;
}

// 본문에 실제로 쓰인 AI 구간의 지시문만 남긴다.
export function cleanInstructions(raw: Record<string, string>, aiSlots: string[]) {
  const cleaned: Record<string, string> = {};
  for (const name of aiSlots) cleaned[name] = (raw[name] ?? "").trim();
  return cleaned;
}

export type SlotValues = {
  auto: Partial<Record<AutoFieldName, string>>;
  ai: Record<string, string>;
  /** 값이 없거나 비어 있으면 "[입력 필요: 이름]"으로 남는다. */
  manual: Record<string, string | null | undefined>;
};

export class MissingSlotError extends Error {
  constructor(readonly slot: string) {
    super(`양식의 자리 ${slot}에 넣을 값이 없습니다.`);
  }
}

export function renderTemplate(text: string, values: SlotValues): string {
  return text.replace(TOKEN, (_match, kind: string | undefined, name: string) => {
    if (kind === "입력") return values.manual[name]?.trim() || missingInputMark(name);
    const value = kind === "AI" ? values.ai[name] : values.auto[name as AutoFieldName];
    if (!value?.trim()) throw new MissingSlotError(kind === "AI" ? `AI:${name}` : name);
    return value.trim();
  });
}

export type TemplateKind = "new" | "recontact" | "repeat_collaboration";

// 작업이 어느 경우에 해당하는지. 후보에서 시작한 작업은 신규 발굴, 재협업 경로는 재수주, 나머지는 과거 컨택이다.
export function templateKindOf(outreach: { candidateId: string | null; route: string }): TemplateKind {
  if (outreach.candidateId) return "new";
  return outreach.route === "repeat_collaboration" ? "repeat_collaboration" : "recontact";
}

// 과거 컨택에서 이전 결과에 맞는 양식을 기본값으로 고른다. 맞는 것이 없으면 그 경우의 첫 양식.
export function suggestTemplate<T extends { id: string; key: string | null; currentVersion: number }>(
  templates: T[],
  previousOutcome: string | null,
): T | null {
  const usable = templates.filter((template) => template.currentVersion > 0);
  const wanted =
    previousOutcome === "unresolved" ? "recontact_no_reply"
      : previousOutcome === "rejected" ? "recontact_discussed" : null;
  return usable.find((template) => wanted && template.key === wanted) ?? usable[0] ?? null;
}
