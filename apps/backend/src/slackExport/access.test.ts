import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { isSlackBackupCohort } = await import("./access");

describe("isSlackBackupCohort", () => {
  it("allows 19기 and newer", () => {
    expect(isSlackBackupCohort("19기")).toBe(true);
    expect(isSlackBackupCohort("20")).toBe(true);
  });
  it("rejects older or unknown cohorts", () => {
    expect(isSlackBackupCohort("18기")).toBe(false);
    expect(isSlackBackupCohort("9")).toBe(false);
    expect(isSlackBackupCohort("")).toBe(false);
    expect(isSlackBackupCohort(null)).toBe(false);
  });
});
