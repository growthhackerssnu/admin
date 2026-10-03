import { describe, expect, it } from "vitest";
import { parsePastContacts, parseQuarter, parseSentAt } from "./pastContacts";

const now = new Date("2026-10-03T00:00:00Z");
const record = (patch: Record<string, unknown> = {}) => ({
  company: "채널톡",
  recipient: {
    name: "Wansup Choi",
    title: "CPO",
    channel: "linkedin",
    address: "https://www.linkedin.com/in/wansupchoi",
  },
  targetQuarter: "2026-Q4",
  sentAt: "2026-09-09",
  subject: "제목",
  body: "안녕하세요\n\n본문입니다.",
  ...patch,
});
const file = (records = [record()]) => ({ sender: "박지윤", records });

describe("parseSentAt", () => {
  it("treats a bare date as noon in Korea", () => {
    expect(parseSentAt("2026-09-09", now).toISOString()).toBe("2026-09-09T03:00:00.000Z");
  });
  it("keeps an explicit offset", () => {
    expect(parseSentAt("2026-09-09T14:30:00+09:00", now).toISOString()).toBe("2026-09-09T05:30:00.000Z");
  });
  it("rejects impossible, malformed, offset-less and future values", () => {
    expect(() => parseSentAt("2026-02-31", now)).toThrow("존재하지 않는");
    expect(() => parseSentAt("9월 9일", now)).toThrow("형식");
    expect(() => parseSentAt("2026-09-09T14:30:00", now)).toThrow("형식");
    expect(() => parseSentAt("2026-10-04", now)).toThrow("미래");
  });
});

describe("parseQuarter", () => {
  it("reads year and quarter", () => expect(parseQuarter("2026-Q4")).toEqual({ year: 2026, quarter: 4 }));
  it("rejects other shapes", () => {
    expect(() => parseQuarter("26.4Q")).toThrow();
    expect(() => parseQuarter("2026-Q5")).toThrow();
  });
});

describe("parsePastContacts", () => {
  it("normalizes a valid file", () => {
    const parsed = parsePastContacts(file(), now);
    expect(parsed.sender).toBe("박지윤");
    expect(parsed.records[0]).toMatchObject({ year: 2026, quarter: 4, subject: "제목" });
    expect(parsed.records[0]?.body).toBe("안녕하세요\n\n본문입니다.");
  });
  it("ignores the _instructions block but rejects unknown keys elsewhere", () => {
    expect(() => parsePastContacts({ _instructions: ["x"], ...file() }, now)).not.toThrow();
    expect(() => parsePastContacts(file([record({ extra: 1 })]), now)).toThrow("형식 오류");
  });
  it("refuses empty body or sentAt before writing anything", () => {
    expect(() => parsePastContacts(file([record({ body: "  " })]), now)).toThrow("body");
    expect(() => parsePastContacts(file([record({ sentAt: "" })]), now)).toThrow("sentAt");
  });
  it("checks the address against the channel", () => {
    const bad = record({ recipient: { name: "A", title: "", channel: "linkedin", address: "https://example.com/in/a" } });
    expect(() => parsePastContacts(file([bad]), now)).toThrow("linkedin.com/in/");
    const email = record({ recipient: { name: "A", title: "", channel: "email", address: "not-an-email" } });
    expect(() => parsePastContacts(file([email]), now)).toThrow("이메일");
  });
  it("collects every bad record in one error and rejects duplicates", () => {
    const parsed = () =>
      parsePastContacts(file([record({ sentAt: "2026-13-01" }), record({ targetQuarter: "x" }), record(), record()]), now);
    expect(parsed).toThrow(/records\[0\][\s\S]*records\[1\][\s\S]*records\[3\].*두 번/);
  });
});
