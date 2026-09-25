import { describe, expect, it } from "vitest";
import {
  initialState,
  normalizeStoredState,
  sampleCompanies,
} from "./fixtures";
import {
  canHandoff,
  draftFor,
  eligibleForBulkEmail,
  preferredRoute,
  previewActor,
  reviewFit,
} from "./model";
import type { ContactTask, ListupState } from "./model";

describe("신규 기업 탐색과 컨택 경계", () => {
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
  };

  it("적합하고 연락 창구가 있는 기업만 넘긴다", () => {
    expect(canHandoff(linkedInCompany)).toBe(true);
    expect(canHandoff(noContactCompany)).toBe(false);
    expect(canHandoff(sampleCompanies[2])).toBe(false);
  });

  it("LinkedIn과 이메일이 모두 있으면 LinkedIn을 우선 추천한다", () => {
    expect(preferredRoute(linkedInCompany)).toBe("linkedin");
    expect(preferredRoute(emailOnlyCompany)).toBe("email");
  });

  it("이메일 일괄 발송은 이메일만 확보된 준비된 작업에 한정한다", () => {
    expect(eligibleForBulkEmail(task, emailOnlyCompany)).toBe(true);
    expect(eligibleForBulkEmail(task, linkedInCompany)).toBe(false);
    expect(
      eligibleForBulkEmail({ ...task, status: "pending" }, emailOnlyCompany),
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
