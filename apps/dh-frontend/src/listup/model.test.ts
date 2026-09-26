import { describe, expect, it } from "vitest";
import {
  initialState,
  normalizeStoredState,
  sampleCompanies,
} from "./fixtures";
import {
  draftFor,
  eligibleForBulkEmail,
  hasContactOption,
  prepareCandidateTasks,
  previewActor,
  quarterOfTimestamp,
  reviewFit,
  canManageCompany,
  previewUsers,
} from "./model";
import type { ContactTask, ListupState } from "./model";

describe("신규 기업 탐색과 컨택 경계", () => {
  it("팀원은 본인 기업만, 팀장은 모든 기업을 변경한다", () => {
    const state = prepareCandidateTasks(initialState());
    expect(canManageCompany(state, previewUsers[0], "morningloop")).toBe(true);
    expect(canManageCompany(state, previewUsers[0], "greenery")).toBe(false);
    expect(canManageCompany(state, previewUsers[1], "greenery")).toBe(true);
    expect(canManageCompany(state, previewUsers[1], "morningloop")).toBe(false);
    expect(canManageCompany(state, previewUsers[2], "greenery")).toBe(true);
    expect(canManageCompany(state, previewUsers[2], "morningloop")).toBe(true);
    // Investigation exceptions also belong to the originating batch owner.
    expect(canManageCompany(state, previewUsers[0], "clearnote")).toBe(true);
    expect(canManageCompany(state, previewUsers[1], "clearnote")).toBe(false);
  });

  it("목표 분기를 옮겨도 권한은 원 담당자를 따른다", () => {
    const state = prepareCandidateTasks(initialState());
    state.tasks[0].quarter = "2027-Q1";
    expect(
      canManageCompany(state, previewUsers[0], state.tasks[0].companyId),
    ).toBe(true);
    expect(
      canManageCompany(state, previewUsers[1], state.tasks[0].companyId),
    ).toBe(false);
    state.batches[0].assignee = null;
    expect(
      canManageCompany(state, previewUsers[0], state.tasks[0].companyId),
    ).toBe(false);
    expect(
      canManageCompany(state, previewUsers[2], state.tasks[0].companyId),
    ).toBe(true);
  });
  const linkedInCompany = sampleCompanies[0];
  const noContactCompany = sampleCompanies[3];
  const emailOnlyCompany = {
    ...linkedInCompany,
    people: [
      {
        id: "email-person",
        name: "담당자",
        role: "Manager",
        email: "manager@example.com",
      },
    ],
  };
  const task: ContactTask = {
    companyId: emailOnlyCompany.id,
    quarter: "2026-Q4",
    batchId: "initial",
    status: "ready",
    ...draftFor(emailOnlyCompany),
    personId: "email-person",
    channel: "email",
    sent: null,
    needsResearch: false,
  };

  it("적합하고 연락 선택지가 있는 기업만 후보로 본다", () => {
    expect(hasContactOption(linkedInCompany)).toBe(true);
    expect(hasContactOption(noContactCompany)).toBe(false);
    expect(hasContactOption(sampleCompanies[2])).toBe(false);
  });

  it("후보 작업은 관계자나 전송 수단을 자동 선택하지 않는다", () => {
    const prepared = prepareCandidateTasks(initialState());
    const linkedInTask = prepared.tasks.find(
      (item) => item.companyId === linkedInCompany.id,
    );
    expect(linkedInTask?.personId).toBeNull();
    expect(linkedInTask?.channel).toBeNull();
    expect(prepareCandidateTasks(prepared).tasks).toHaveLength(
      prepared.tasks.length,
    );
  });

  it("발송 실적은 목표 분기가 아닌 한국 시각의 실제 발송 분기에 귀속한다", () => {
    expect(quarterOfTimestamp("2026-09-30T14:59:00.000Z")).toBe("2026-Q3");
    expect(quarterOfTimestamp("2026-09-30T15:00:00.000Z")).toBe("2026-Q4");
    expect(quarterOfTimestamp("잘못된 날짜")).toBeNull();
  });

  it("LinkedIn이 있어도 사람이 이메일을 선택하면 일괄 발송 대상이 된다", () => {
    expect(eligibleForBulkEmail(task, emailOnlyCompany)).toBe(true);
    expect(
      eligibleForBulkEmail(
        { ...task, personId: linkedInCompany.people[0].id },
        linkedInCompany,
      ),
    ).toBe(true);
    expect(
      eligibleForBulkEmail({ ...task, status: "pending" }, emailOnlyCompany),
    ).toBe(false);
    expect(
      eligibleForBulkEmail({ ...task, needsResearch: true }, emailOnlyCompany),
    ).toBe(false);
    expect(
      eligibleForBulkEmail(
        {
          ...task,
          sent: {
            channel: "email",
            recipient: "담당자",
            subject: "제목",
            body: "본문",
            at: "지금",
          },
        },
        emailOnlyCompany,
      ),
    ).toBe(false);
  });

  it("사람이 fit을 바꿀 때 AI 최초 판단과 이전 변경 이력을 유지한다", () => {
    const original = sampleCompanies[2];
    const first = reviewFit(
      original,
      "fit",
      previewActor,
      "2026-09-25T06:00:00.000Z",
    );
    const second = reviewFit(
      first,
      "unfit",
      previewActor,
      "2026-09-25T06:01:00.000Z",
    );
    expect(original.fitChanges).toHaveLength(0);
    expect(second.aiFit).toBe("pending");
    expect(second.fit).toBe("unfit");
    expect(second.fitChanges.map((change) => change.fit)).toEqual([
      "fit",
      "unfit",
    ]);
    expect(
      reviewFit(second, "unfit", previewActor, "2026-09-25T06:02:00.000Z"),
    ).toBe(second);
  });

  it("이전 브라우저 저장 데이터의 담당자와 fit 수정 기록을 안전하게 보완한다", () => {
    const legacy = initialState() as ListupState & {
      companies: Array<
        (typeof sampleCompanies)[number] & { changedByUser?: boolean }
      >;
    };
    delete (legacy.batches[0] as Partial<(typeof legacy.batches)[number]>)
      .assignee;
    delete (legacy.companies[0] as Partial<(typeof legacy.companies)[number]>)
      .aiFit;
    delete (legacy.companies[0] as Partial<(typeof legacy.companies)[number]>)
      .fitChanges;
    legacy.companies[0].changedByUser = true;
    const migrated = normalizeStoredState(legacy);
    expect(migrated.batches[0].assignee).toBeNull();
    expect(migrated.companies[0].aiFit).toBe("fit");
    expect(migrated.companies[0].fitChanges).toEqual([
      { fit: "fit", by: null, at: null },
    ]);
  });
});
