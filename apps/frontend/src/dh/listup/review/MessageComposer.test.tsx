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
