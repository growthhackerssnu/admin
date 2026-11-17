import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MessageComposer } from "./MessageComposer";
import {
  currentActor,
  type Candidate,
  type CandidateCommand,
} from "./contracts";
import { initialReviewData } from "./fixtures";
import { applyCommand } from "./previewRepository";
import { MessageTemplatesContext } from "./MessageTemplateChoice";
import { initialMessageTemplateData } from "./fixtures";
import type { MessageTemplate } from "./messageTemplates";

vi.mock("@/design-system/use-aligned-scroll", () => ({
  useAlignedScroll: () => ({ current: null }),
}));

function approvedCompany(withDraft = false) {
  let data = initialReviewData();
  const commands: CandidateCommand[] = [
    { type: "claim" },
    {
      type: "contact",
      recipient: {
        name: "시연 관계자",
        title: "사업개발",
        channel: "linkedin",
        address: "https://www.linkedin.com/in/example",
      },
    },
    { type: "decide", status: "approved", note: "" },
    { type: "quarter", quarter: "2027-Q1" },
  ];
  if (withDraft) commands.push({ type: "generate" });
  for (const command of commands)
    data = applyCommand(
      data,
      "morningloop",
      data.candidates[0].version,
      command,
    );
  return data;
}
const activeRound = initialReviewData().currentRound;
function markup(candidate: Candidate, round = activeRound, roundError?: string) {
  return renderToStaticMarkup(
    <MessageComposer
      candidate={candidate}
      actor={currentActor}
      currentRound={round}
      roundError={roundError}
      retryRound={() => {}}
      change={async () => true}
      pending={false}
      onDirty={() => {}}
    />,
  );
}
function button(html: string, label: string) {
  const found = html
    .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
    ?.find((value) => value.includes(label));
  expect(found, `${label} button`).toBeDefined();
  return found!;
}

function markupWithTemplates(
  candidate: Candidate,
  templates: MessageTemplate[] | null,
  canManageOps = false,
) {
  return renderToStaticMarkup(
    <MessageTemplatesContext.Provider value={templates}>
      <MessageComposer
        candidate={candidate}
        actor={currentActor}
        currentRound={activeRound}
        retryRound={() => {}}
        canManageOps={canManageOps}
        change={async () => true}
        pending={false}
        onDirty={() => {}}
      />
    </MessageTemplatesContext.Provider>,
  );
}

describe("message templates on the discovery draft screen", () => {
  const templates = initialMessageTemplateData().templates;
  it("offers a template choice when the case has two or more templates", () => {
    const html = markupWithTemplates(approvedCompany().candidates[0], templates);
    expect(html).toContain("메일 양식");
    expect(html).toContain('id="uw-message-template"');
    expect(button(html, "메시지 생성")).not.toContain('disabled=""');
  });
  it("hides the choice for a single template and without a template list", () => {
    const single = templates.filter((item) => item.id !== "template-new-short");
    expect(
      markupWithTemplates(approvedCompany().candidates[0], single),
    ).not.toContain('id="uw-message-template"');
    expect(
      markupWithTemplates(approvedCompany().candidates[0], null),
    ).not.toContain('id="uw-message-template"');
  });
  it("blocks generation and points to settings when every template is empty", () => {
    const empty = templates.map((item) => ({ ...item, version: 0 }));
    const html = markupWithTemplates(
      approvedCompany().candidates[0],
      empty,
      true,
    );
    expect(html).toContain("설정에서 신규 발굴 양식을 먼저 채우세요.");
    expect(html).toContain("view=settings&amp;section=templates");
    expect(button(html, "메시지 생성")).toContain('disabled=""');
  });
  it("shows an optional intent field for discovery work", () => {
    const html = markupWithTemplates(
      { ...approvedCompany().candidates[0], contactPurpose: "지난 행사 인연" },
      templates,
    );
    expect(html).toContain("담당자 의도 (선택)");
    expect(html).toContain("AI가 쓰는 부분에 반영할 의도가 있으면 적으세요");
    expect(html).toContain("지난 행사 인연");
  });
  it("blocks recording a send while the draft still needs manual input", () => {
    const candidate = approvedCompany(true).candidates[0];
    const html = markupWithTemplates(
      {
        ...candidate,
        draft: {
          ...candidate.draft!,
          body: "지난번에는 [입력 필요: 불발 사유]로 함께하지 못했습니다.",
        },
      },
      templates,
    );
    expect(html).toContain("입력 필요로 표시된 부분을 채운 뒤 기록하세요.");
    expect(button(html, "발송 완료 표시")).toContain('disabled=""');
    expect(button(html, "다시 생성")).not.toContain('disabled=""');
  });
});

describe("sample generation with a chosen template", () => {
  it("renders the chosen template and records which template made the draft", () => {
    const data = approvedCompany();
    const candidate = applyCommand(
      data,
      "morningloop",
      data.candidates[0].version,
      { type: "generate", templateId: "template-new-short", purpose: "행사 인연" },
    ).candidates[0];
    expect(candidate.draft?.messageTemplateId).toBe("template-new-short");
    expect(candidate.draft?.subject).toBe(`${candidate.name} 산학협력 제안`);
    expect(candidate.draft?.body).toContain("시연 관계자님");
    expect(candidate.draft?.body).toContain("행사 인연");
    expect(candidate.contactPurpose).toBe("행사 인연");
  });
});

describe("message work inside the company's center pane", () => {
  it("shows the fixed quarter and enables generation without individual quarter selection", () => {
    const html = markup({ ...approvedCompany().candidates[0], quarter: null });
    expect(html).toContain("수주 분기");
    expect(html).toContain("2027년 1분기");
    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain("분기 추가");
    expect(html).not.toContain("목표 분기 선택");
    expect(button(html, "메시지 생성")).not.toContain('disabled=""');
  });
  it("distinguishes a missing setting from a failed lookup and offers retry only for the latter", () => {
    const candidate = { ...approvedCompany().candidates[0], quarter: null };
    const html = markup(candidate, null);
    expect(html).toContain("수주 분기 미설정 · 팀장 설정 필요");
    expect(button(html, "메시지 생성")).toContain('disabled=""');
    expect(html).not.toContain("다시 불러오기");
    const failed = markup(candidate, null, "수주 분기를 불러오지 못했습니다.");
    expect(failed).not.toContain("팀장 설정 필요");
    expect(failed).toContain("다시 불러오기");
    expect(button(failed, "메시지 생성")).toContain('disabled=""');
  });
  it("keeps closed work in its original quarter and blocks editing and generation", () => {
    const candidate = { ...approvedCompany(true).candidates[0], quarter: "2026-Q4", canEditMessage: false, canGenerateMessage: false, messageBlockReasons: ["round_closed"] };
    const html = markup(candidate);
    expect(html).toContain("2026년 4분기");
    expect(html).toContain("종료된 수주 분기 · 읽기 전용");
    expect(html).toContain('readonly=""');
    expect(button(html, "다시 생성")).toContain('disabled=""');
    expect(button(html, "발송 완료 표시")).toContain('disabled=""');
  });
  it("shows a saved draft and send actions without a separate page navigation", () => {
    const html = markup(approvedCompany(true).candidates[0]);
    expect(html).toContain('aria-label="메시지 작성"');
    expect(html).not.toContain("메시지 목록");
    expect(html).not.toContain("내용 수정");
    expect(html).not.toContain('readonly=""');
    expect(html).toContain('id="uw-message-subject"');
    expect(html).toContain('id="uw-message-body"');
    expect(button(html, "본문 복사")).not.toContain('disabled=""');
    expect(button(html, "발송 완료 표시")).not.toContain('disabled=""');
  });
  it("keeps another owner's draft visible but blocks editing and recording", () => {
    const candidate = approvedCompany(true).candidates[0];
    const html = markup({
      ...candidate,
      owner: { id: "someone-else", name: "다른 담당자" },
    });
    expect(html).toContain(candidate.draft!.subject);
    expect(html).toContain('readonly=""');
    expect(html).not.toContain("발송 완료 표시");
    expect(html).not.toContain("수정 저장");
  });
  it("shows the first-send history without offering a second send or regeneration", () => {
    const data = approvedCompany(true);
    const candidate = applyCommand(
      data,
      "morningloop",
      data.candidates[0].version,
      { type: "send" },
    ).candidates[0];
    const html = markup(candidate);
    expect(html).toContain("발송 기록 1건");
    expect(html).not.toContain("발송 완료 표시");
    expect(html).not.toContain("다시 생성");
    expect(html).toContain(candidate.sent[0].draft.body.slice(0, 20));
  });
});
