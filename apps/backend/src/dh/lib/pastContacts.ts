import { z } from "zod";

// scripts/dh/data/pastContacts.json 검증. 과거에 이미 보낸 연락을 DB로 옮길 때 쓴다.
// DB 접근 없이 파일만 본다. 형식이 틀리면 한 건도 쓰기 전에 전부 거절한다.

const KST_NOON = "T12:00:00+09:00";

// 날짜만 쓰면 한국시간 정오로 본다. 시각을 쓰면 오프셋(+09:00 등)이 있어야 한다.
export function parseSentAt(value: string, now = new Date()): Date {
  const text = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(text + KST_NOON)
    : z.string().datetime({ offset: true }).safeParse(text).success
      ? new Date(text)
      : null;
  if (!date || Number.isNaN(date.getTime())) throw new Error(`sentAt 형식이 올바르지 않습니다: "${value}"`);
  // new Date("2026-02-31T12:00:00+09:00")는 3월로 넘어가 버리므로 날짜가 그대로인지 되확인한다.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) !== text)
    throw new Error(`존재하지 않는 날짜입니다: "${value}"`);
  if (date > now) throw new Error(`미래 시각은 발송 기록으로 옮길 수 없습니다: "${value}"`);
  return date;
}

export function parseQuarter(value: string) {
  const match = /^(\d{4})-Q([1-4])$/.exec(value.trim());
  if (!match) throw new Error(`targetQuarter는 "2026-Q4" 형식이어야 합니다: "${value}"`);
  return { year: Number(match[1]), quarter: Number(match[2]) };
}

const recipientSchema = z
  .object({
    name: z.string().trim().min(1),
    title: z.string().trim().default(""),
    channel: z.enum(["linkedin", "email"]),
    address: z.string().trim().min(1),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.channel === "email") {
      if (!z.string().email().safeParse(r.address).success)
        ctx.addIssue({ code: "custom", path: ["address"], message: "올바른 이메일이 아닙니다." });
      return;
    }
    let url: URL | null = null;
    try {
      url = new URL(r.address);
    } catch {
      /* fallthrough */
    }
    if (!url || !/(^|\.)linkedin\.com$/.test(url.hostname) || !url.pathname.startsWith("/in/"))
      ctx.addIssue({ code: "custom", path: ["address"], message: "linkedin.com/in/ 프로필 주소여야 합니다." });
  });

const recordSchema = z
  .object({
    sheetRow: z.number().int().optional(),
    company: z.string().trim().min(1),
    recipient: recipientSchema,
    targetQuarter: z.string(),
    sentAt: z.string().min(1, "sentAt을 채워주세요."),
    subject: z.string().default(""),
    body: z.string().trim().min(1, "body를 채워주세요."),
  })
  .strict();

const fileSchema = z
  .object({
    _instructions: z.array(z.string()).optional(),
    sender: z.string().trim().min(1),
    records: z.array(recordSchema).min(1),
  })
  .strict();

export type PastContactRecord = {
  sheetRow?: number;
  company: string;
  recipient: { name: string; title: string; channel: "linkedin" | "email"; address: string };
  year: number;
  quarter: number;
  sentAt: Date;
  subject: string;
  body: string;
};

export function parsePastContacts(input: unknown, now = new Date()) {
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      "pastContacts.json 형식 오류:\n" +
        parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n"),
    );
  const problems: string[] = [];
  const seen = new Set<string>();
  const records: PastContactRecord[] = [];
  parsed.data.records.forEach((r, index) => {
    const label = `records[${index}] ${r.company}`;
    try {
      const key = [r.company, r.recipient.channel, r.recipient.address].join("\u0000");
      if (seen.has(key)) throw new Error("같은 기업·수신자가 두 번 들어 있습니다.");
      seen.add(key);
      records.push({
        sheetRow: r.sheetRow,
        company: r.company,
        recipient: r.recipient,
        ...parseQuarter(r.targetQuarter),
        sentAt: parseSentAt(r.sentAt, now),
        subject: r.subject.trim(),
        body: r.body,
      });
    } catch (error) {
      problems.push(`  - ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  if (problems.length) throw new Error("pastContacts.json 값 오류:\n" + problems.join("\n"));
  return { sender: parsed.data.sender, records };
}
