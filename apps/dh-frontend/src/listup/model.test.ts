import { describe, expect, it } from "vitest";
import { sampleCompanies } from "./fixtures";
import {
  canHandoff,
  draftFor,
  eligibleForBulkEmail,
  preferredRoute,
} from "./model";
import type { ContactTask } from "./model";

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
});
