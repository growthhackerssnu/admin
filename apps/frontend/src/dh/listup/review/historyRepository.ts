import {
  currentActor,
  validRecipient,
  safeUrl,
  type Actor,
  type Recipient,
} from "./contracts";
import {
  generationReasons,
  type HistoryCompany,
  type HistoryData,
  type HistoryCommand,
  type HistoryRepository,
} from "./historyContracts";

const recipient: Recipient = {
  name: "김민수",
  title: "사업개발",
  channel: "linkedin",
  address: "https://www.linkedin.com/in/example-minsu/",
};
const other = { id: "history-b", name: "박지윤" };
const round = {
  id: "preview-round-2027-1",
  quarter: "2027-Q1",
  startedAt: "2026-10-03T00:00:00Z",
};
const send = (
  id: string,
  at: string,
  outcome: "rejected" | "unresolved" | "won" | null,
) => ({
  id,
  at,
  quarter: "2026-Q4",
  owner: currentActor,
  recipient,
  subject: "Growth Hackers 산학협력 제안",
  body: "안녕하세요. Growth Hackers입니다. 데이터 분석 산학협력을 제안드립니다.\n\n구체적인 프로젝트 주제는 사전 미팅에서 함께 협의하고자 합니다.",
  outcome,
  response:
    outcome === "rejected"
      ? "이번 분기는 일정이 어려워 다음 모집 때 다시 연락 부탁드립니다."
      : null,
});
const base = (
  id: string,
  name: string,
  description: string,
): HistoryCompany => ({
  id,
  name,
  description,
  research: null,
  contacts: [recipient],
  sends: [],
  projects: [],
  wonQuarter: null,
  work: null,
});
export function initialHistoryData(): HistoryData {
  const a = base(
    "history-morningloop",
    "모닝루프",
    "반복 업무 자동화 B2B SaaS",
  );
  a.research =
    "팀의 반복 업무를 자동화하는 소프트웨어를 제공합니다. 기업 고객이 업무 흐름을 구성하고 실행하는 제품입니다.";
  a.sends = [send("send-morning", "2026-09-18T02:00:00Z", "rejected")];
  const b = base("history-clearnote", "클리어노트", "회의 기록과 팀 지식 관리");
  b.sends = [send("send-clear", "2026-09-24T02:00:00Z", "unresolved")];
  b.work = {
    id: "work-clear",
    roundId: round.id,
    owner: other,
    purpose: "새 모집 분기 재제안",
    recipient,
    draft: null,
    sent: null,
    version: 1,
  };
  const c = base(
    "history-long",
    "플로우데이터",
    "여러 팀이 함께 사용하는 업무 데이터 통합 및 운영 자동화 플랫폼",
  );
  c.research =
    "기업 내부의 여러 도구에서 발생하는 데이터를 통합하고 운영 업무를 자동화합니다. 고객사는 팀마다 다른 운영 흐름을 구성할 수 있으며, 제품 안에서 처리 이력을 확인하고 공유합니다. ".repeat(
      10,
    );
  c.sends = [send("send-flow", "2026-08-25T02:00:00Z", null)];
  c.contacts = [];
  const d = base("history-sent", "폴드마켓", "리테일 운영 플랫폼");
  const sent = {
    ...send("send-current", "2026-10-03T01:00:00Z", null),
    quarter: round.quarter,
    outcome: "pending" as const,
  };
  d.sends = [sent, send("send-old-fold", "2026-08-20T02:00:00Z", "unresolved")];
  d.work = {
    id: "work-sent",
    roundId: round.id,
    owner: currentActor,
    purpose: "새로운 협업 제안",
    recipient,
    draft: null,
    sent,
    version: 2,
  };
  const e = base("history-vc", "더브이씨", "기업·투자 정보 서비스");
  e.projects = [
    {
      id: "project-vc",
      title: "LLM 기반 R&D 과제 및 기업 정보 요약 파이프라인 설계",
      year: 2026,
      quarter: 1,
      status: "completed",
      summary: "기업 정보와 R&D 과제를 요약하는 파이프라인을 설계했습니다.",
      ownerName: "박지윤",
      contactName: "박지훈",
      resultUrl: "https://example.com/project-vc",
      version: 1,
    },
    {
      id: "project-vc-2",
      title: "기업 검색 경험 분석",
      year: 2026,
      quarter: 4,
      status: "in_progress",
      summary: "기업 정보 검색과 조회 흐름을 분석하는 프로젝트입니다.",
      ownerName: "성민준",
      contactName: "박지훈",
      resultUrl: "",
      version: 1,
    },
  ];
  const f = base("history-won", "슈퍼센트", "모바일 게임 퍼블리셔");
  f.wonQuarter = "2027-Q1";
  f.sends = [
    {
      ...send("send-super", "2026-09-29T02:00:00Z", "won"),
      quarter: "2027-Q1",
    },
  ];
  const g = base("history-legacy", "원셀프월드", "개인화 서비스");
  g.contacts = [];
  g.projects = [
    {
      id: "project-legacy",
      title: "유저 세그멘테이션 기반 리텐션 전환 전략",
      year: null,
      quarter: null,
      status: null,
      summary: "사용자 세그먼트별 전환 전략을 제안했습니다.",
      ownerName: "",
      contactName: "",
      resultUrl: "",
      version: 1,
    },
  ];
  return {
    actor: currentActor,
    canManage: true,
    round,
    companies: [a, b, c, d, e, f, g],
  };
}

const storageKey = "dh-history-preview-v1";
/** Production history demo: isolated fixtures, never existing company/send records. */
export function initialMockHistoryData(actor: Actor): HistoryData {
  const data = initialHistoryData();
  for (const [index, name] of [
    "넥스트웨이브",
    "핀플로우",
    "스택노트",
    "루미데이터",
  ].entries()) {
    const company = base(
      `mock-contact-${index}`,
      name,
      [
        "팀 협업 도구",
        "금융 운영 데이터 서비스",
        "업무 기록과 지식 관리",
        "커머스 데이터 분석 플랫폼",
      ][index],
    );
    company.research = `${company.description}를 제공하는 기업입니다. 이 내용은 화면 검토를 위한 목업 조사 정보입니다.`;
    const record = send(
      `mock-send-${index}`,
      `2026-09-${String(20 - index).padStart(2, "0")}T02:00:00Z`,
      index === 0 ? "rejected" : index === 1 ? "unresolved" : null,
    );
    if (index === 2) record.owner = other;
    company.sends = [record];
    data.companies.push(company);
  }
  for (const [index, name] of [
    "비즈브릿지",
    "플레이하버",
    "마켓스퀘어",
    "클라우드픽",
  ].entries()) {
    const company = base(
      `mock-project-${index}`,
      name,
      [
        "B2B 거래 플랫폼",
        "모바일 게임 스튜디오",
        "온라인 커머스 서비스",
        "클라우드 업무 관리 서비스",
      ][index],
    );
    company.projects = [
      {
        id: `mock-project-record-${index}`,
        title: [
          "기업 고객 세그먼트별 전환 분석",
          "유저 행동 기반 리텐션 분석",
          "고객 구매 패턴과 추천 모델링",
          "서비스 활성화 지표 설계",
        ][index],
        year: 2026,
        quarter: index % 2 === 0 ? 3 : 4,
        status:
          index === 0 || index === 2
            ? "completed"
            : index === 1
              ? "in_progress"
              : "won",
        summary:
          "화면 검토를 위한 목업 협업 이력입니다. 저장된 기업 정보와 프로젝트 목적을 바탕으로 후속 연락을 준비합니다.",
        ownerName: index % 2 ? "박지윤" : actor.name,
        contactName: "김민수",
        resultUrl: "",
        version: 1,
      },
    ];
    data.companies.push(company);
  }
  for (const company of data.companies) {
    for (const record of company.sends) {
      if (record.owner.id === currentActor.id) record.owner = actor;
    }
    if (company.work?.owner.id === currentActor.id) company.work.owner = actor;
    if (company.work?.sent?.owner.id === currentActor.id)
      company.work.sent.owner = actor;
  }
  return { ...data, actor };
}
/** Browser-local fixture store. This code never calls AI, sends messages, or touches live data. */
export class PreviewHistoryRepository implements HistoryRepository {
  constructor(
    private actor: Actor = currentActor,
    private canManage = true,
    readonly mode: "preview" | "mock" = "preview",
  ) {}
  private get storageKey() {
    return this.mode === "mock"
      ? `dh-history-mock-v1:${this.actor.id}`
      : storageKey;
  }
  async load(): Promise<HistoryData> {
    let data =
      this.mode === "mock"
        ? initialMockHistoryData(this.actor)
        : initialHistoryData();
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) data = JSON.parse(stored) as HistoryData;
    } catch {
      /* unavailable storage uses fixtures */
    }
    return { ...data, actor: this.actor, canManage: this.canManage };
  }
  async execute(
    companyId: string,
    version: number | null,
    command: HistoryCommand,
  ) {
    const data = await this.load();
    let company = data.companies.find((c) => c.id === companyId);
    if (command.type === "project" && command.newCompany) {
      if (!data.canManage)
        throw new Error("팀장·관리자만 프로젝트를 등록할 수 있습니다.");
      if (!command.newCompany.name.trim())
        throw new Error("기업명을 입력해주세요.");
      if (
        data.companies.some((c) => c.name === command.newCompany!.name.trim())
      )
        throw new Error(
          "같은 이름의 기업이 있습니다. 기존 기업을 선택해주세요.",
        );
      company = base(
        crypto.randomUUID(),
        command.newCompany.name.trim(),
        command.newCompany.description,
      );
      company.contacts = [];
      data.companies.push(company);
    }
    if (!company) throw new Error("기업을 찾을 수 없습니다.");
    if (command.type === "project") {
      if (!data.canManage)
        throw new Error("팀장·관리자만 프로젝트를 수정할 수 있습니다.");
      const p = command.project;
      if (
        !p.title.trim() ||
        !Number.isInteger(p.year) ||
        !p.quarter ||
        !p.status
      )
        throw new Error("프로젝트명·진행 분기·상태를 입력해주세요.");
      if (p.resultUrl && !safeUrl(p.resultUrl))
        throw new Error("올바른 자료 링크를 입력해주세요.");
      const i = company.projects.findIndex((item) => item.id === p.id);
      if (i >= 0 && company.projects[i].version !== p.version)
        throw new Error("프로젝트가 변경되었습니다. 다시 확인해주세요.");
      if (p.sourceOutreachId) {
        const source = company.sends.find(
          (s) => s.id === p.sourceOutreachId && s.outcome === "won",
        );
        if (!source || `${p.year}-Q${p.quarter}` !== source.quarter)
          throw new Error("수주 기록의 기업·진행 분기와 일치해야 합니다.");
        if (
          company.projects.some(
            (existing) =>
              existing.id !== p.id &&
              existing.sourceOutreachId === p.sourceOutreachId,
          )
        )
          throw new Error("이 수주 기록의 프로젝트가 이미 등록되어 있습니다.");
      }
      const saved = { ...p, version: p.version + 1 };
      if (i < 0) company.projects.push(saved);
      else company.projects[i] = saved;
      if (company.work?.draft) company.work.draft.contextMatches = false;
    } else if (command.type === "start") {
      if (!data.round) throw new Error("현재 수주 회차가 설정되지 않았습니다.");
      if (!company.work)
        company.work = {
          id: crypto.randomUUID(),
          roundId: data.round.id,
          owner: data.actor,
          purpose: "",
          recipient: company.contacts[0] ?? null,
          draft: null,
          sent: null,
          version: 1,
        };
    } else {
      const work = company.work;
      if (!work || work.owner.id !== data.actor.id)
        throw new Error("본인 담당 작업만 변경할 수 있습니다.");
      if (work.version !== version)
        throw new Error("작업이 변경되었습니다. 다시 확인해주세요.");
      if (work.sent) throw new Error("이번 회차 발송을 마쳤습니다.");
      if (!data.round || work.roundId !== data.round.id)
        throw new Error("종료 회차의 수정 정책은 아직 정해지지 않았습니다.");
      if (command.type === "purpose") {
        work.purpose = command.purpose.trim();
        if (work.draft) work.draft.contextMatches = false;
      }
      if (command.type === "recipient") {
        if (!validRecipient(command.recipient))
          throw new Error(
            "이름과 올바른 LinkedIn 개인 프로필 또는 이메일을 입력해주세요.",
          );
        work.recipient = {
          ...command.recipient,
          name: command.recipient.name.trim(),
          address: command.recipient.address.trim(),
        };
        if (
          !company.contacts.some((c) => c.address === work.recipient?.address)
        )
          company.contacts.push(work.recipient);
        if (work.draft) work.draft.contextMatches = false;
      }
      if (command.type === "generate") {
        const reasons = generationReasons(company, data.round, data.actor);
        if (reasons.length) throw new Error(reasons[0]);
        work.draft = {
          revision: (work.draft?.revision ?? 0) + 1,
          contextMatches: true,
          subject: `[Growth Hackers] ${company.name} ${data.round.quarter} 산학협력 제안`,
          body: `안녕하세요, ${company.name} ${work.recipient!.name}님.\n\nGrowth Hackers 대외협력팀입니다.\n\n${work.purpose}\n\n${company.projects[0]?.summary || company.research?.slice(0, 180) || "이전에 드린 협업 제안을 바탕으로 다시 연락드립니다."}\n\n${data.round.quarter} 산학협력 프로젝트를 함께 논의하고자 합니다. 관심 있으시면 편하신 일정으로 말씀 부탁드립니다.\n\n감사합니다.\nGrowth Hackers 드림\n\n[${this.mode === "mock" ? "목업" : "개발용 예시"} 문안 · AI 미호출]`,
        };
      }
      if (command.type === "draft") {
        if (
          !work.draft?.contextMatches ||
          !command.subject.trim() ||
          !command.body.trim()
        )
          throw new Error("현재 근거에 맞는 초안과 제목·본문이 필요합니다.");
        work.draft = {
          ...work.draft,
          subject: command.subject,
          body: command.body,
          revision: work.draft.revision + 1,
        };
      }
      if (command.type === "send") {
        if (
          !work.draft?.contextMatches ||
          !work.recipient ||
          generationReasons(company, data.round, data.actor).length
        )
          throw new Error("목적·수신자·초안을 확인해주세요.");
        work.sent = {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          quarter: data.round.quarter,
          owner: data.actor,
          recipient: structuredClone(work.recipient),
          subject: work.draft.subject,
          body: work.draft.body,
          outcome: "pending",
          response: null,
        };
        company.sends.unshift(work.sent);
      }
      work.version++;
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch {
      throw new Error("브라우저에 저장하지 못했습니다. 입력은 유지됩니다.");
    }
    return data;
  }
}
export const unavailableHistoryRepository: HistoryRepository = {
  mode: "unavailable",
  load: async () => {
    throw new Error("연락·협업 이력 API 연결을 준비 중입니다.");
  },
  execute: async () => {
    throw new Error("이력 API가 연결되지 않았습니다.");
  },
};
