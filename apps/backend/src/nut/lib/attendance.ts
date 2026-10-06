import type { Member } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

// 출석체크. 예전 내부운영 시트의 '출석체크'·'벌점벌금' 탭을 옮겼다.
// 보기는 NUT 회원 전원, 고치기는 회장단(회장·부회장)·총무·admin만.
export function canEditAttendance(member: Member) {
  return (
    member.role === "admin" ||
    member.opsRole === "president" ||
    member.opsRole === "vice_president" ||
    member.opsRole === "treasurer"
  );
}

// 출석체크 API 권한(withApiHandler의 access): GET은 전원, 쓰기는 위 사람들만.
export const attendanceAccess = {
  allow: (member: Member, method: string) => method === "GET" || canEditAttendance(member),
  message: "출석체크 수정은 회장단·총무·관리자만 할 수 있습니다.",
};

export type AttendanceType = "late" | "absent" | "quest";
export type Excuse = "excused" | "partial" | "unexcused";
type Classifiable = { type: AttendanceType; excuse: Excuse; minutesLate: number | null };

// 벌점벌금 탭의 열. 점수·금액은 반기마다 출석체크 탭에서 바꿀 수 있고, 안 바꾼 값은 시트의 기본값을 쓴다.
// 사유(전부 인정)는 언제나 벌점이 없다.
export const RULES = [
  { id: "late-partial-under30", label: "부분사유지각(<30%)", points: 1, fine: 0 },
  { id: "late-partial-over30", label: "부분사유지각(>30%)", points: 3, fine: 10000 },
  { id: "late-unexcused-under5", label: "무단지각(<5%)", points: 1, fine: 5000 },
  { id: "late-unexcused-5to30", label: "무단지각(5~30%)", points: 2, fine: 10000 },
  { id: "late-unexcused-over30", label: "무단지각(>30%)", points: 5, fine: 20000 },
  { id: "absent-partial", label: "부분사유결석", points: 3, fine: 10000 },
  { id: "absent-unexcused", label: "무단결석", points: 5, fine: 20000 },
  { id: "quest-partial", label: "퀘스트미제출(부분사유)", points: 1, fine: 5000 },
  { id: "quest-unexcused", label: "퀘스트미제출(무단)", points: 2, fine: 10000 },
] as const;
export type RuleId = (typeof RULES)[number]["id"];
export type AttendanceRules = { sessionMinutes: number; rates: Record<RuleId, { points: number; fine: number }> };

// 지각 비율(지각 분 ÷ 세션 길이)의 기준. 시트 기록(9분 = 5% 경계)에서 3시간으로 맞췄다.
export const DEFAULT_RULES: AttendanceRules = {
  sessionMinutes: 180,
  rates: Object.fromEntries(RULES.map(({ id, points, fine }) => [id, { points, fine }])) as AttendanceRules["rates"],
};

function ruleFor({ type, excuse, minutesLate }: Classifiable, sessionMinutes: number): RuleId {
  if (type !== "late") return `${type}-${excuse as "partial" | "unexcused"}`;
  const ratio = minutesLate! / sessionMinutes;
  if (excuse === "partial") return ratio <= 0.3 ? "late-partial-under30" : "late-partial-over30";
  return ratio < 0.05 ? "late-unexcused-under5" : ratio <= 0.3 ? "late-unexcused-5to30" : "late-unexcused-over30";
}

export function penalty(record: Classifiable, rules: AttendanceRules = DEFAULT_RULES) {
  const { type, excuse, minutesLate } = record;
  if (excuse === "excused") return { label: type === "absent" ? "사유결석" : type === "quest" ? "퀘스트미제출(사유)" : "사유지각", points: 0, fine: 0 };
  // 지각 시간을 아직 모르면 벌점을 매기지 않고 화면에서 입력하라고 알린다.
  if (type === "late" && minutesLate == null)
    return { label: excuse === "partial" ? "부분사유지각" : "무단지각", points: 0, fine: 0, needsMinutes: true };
  const id = ruleFor(record, rules.sessionMinutes);
  return { label: RULES.find((rule) => rule.id === id)!.label, ...rules.rates[id] };
}

// 반기 설정: key는 '<규칙 id>.points'·'<규칙 id>.fine'·'session-minutes'. 없는 값은 기본값.
export async function getRules(periodId: string): Promise<AttendanceRules> {
  const rows = await prisma.nutAttendanceSetting.findMany({ where: { periodId } });
  const value = new Map(rows.map((row) => [row.key, row.value]));
  return {
    sessionMinutes: value.get("session-minutes") ?? DEFAULT_RULES.sessionMinutes,
    rates: Object.fromEntries(
      RULES.map(({ id, points, fine }) => [id, { points: value.get(`${id}.points`) ?? points, fine: value.get(`${id}.fine`) ?? fine }]),
    ) as AttendanceRules["rates"],
  };
}

export const SETTING_KEYS = ["session-minutes", ...RULES.flatMap(({ id }) => [`${id}.points`, `${id}.fine`])];

export async function saveRule(periodId: string, key: string, value: number) {
  await prisma.nutAttendanceSetting.upsert({
    where: { periodId_key: { periodId, key } },
    update: { value },
    create: { periodId, key, value },
  });
}

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

// 반기 안의 기록과, 기록이 없는 사람도 0점으로 보이도록 환급 계좌 명단(= 학회원 명단)을 돌려준다.
// 출석체크는 NUT와 같은 반기를 쓴다. 화면 위쪽 반기 선택에 쓰도록 반기 목록도 같이 준다.
export async function getAttendance(periodId: string, canEdit: boolean) {
  const period = await prisma.nutFinancePeriod.findUniqueOrThrow({ where: { id: periodId } });
  const [periods, records, roster, rules, reset] = await Promise.all([
    prisma.nutFinancePeriod.findMany({ orderBy: { periodStart: "desc" }, select: { id: true, label: true } }),
    prisma.nutAttendanceRecord.findMany({
      where: { date: { gte: period.periodStart, lte: period.periodEnd } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    prisma.nutRefundAccount.findMany({ select: { name: true, cohort: true }, orderBy: [{ cohort: "asc" }, { name: "asc" }] }),
    getRules(periodId),
    prisma.nutAttendanceReset.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);
  const clearedThrough = reset ? dateOnly(reset.clearedThrough) : null;
  return {
    period: { id: period.id, label: period.label, start: dateOnly(period.periodStart), end: dateOnly(period.periodEnd) },
    periods,
    canEdit,
    // 이 날짜까지의 기록은 초기화돼서 벌점·벌금 합계에 넣지 않는다(기록은 남는다).
    clearedThrough,
    sessionMinutes: rules.sessionMinutes,
    rules: RULES.map(({ id, label }) => ({ id, label, ...rules.rates[id] })),
    roster,
    records: records.map((record) => {
      const classified = { type: record.type as AttendanceType, excuse: record.excuse as Excuse, minutesLate: record.minutesLate };
      return {
        id: record.id,
        date: dateOnly(record.date),
        name: record.name,
        project: record.project,
        ...classified,
        note: record.note,
        source: record.source,
        penalty: penalty(classified, rules),
        cleared: clearedThrough != null && dateOnly(record.date) <= clearedThrough,
      };
    }),
  };
}

export type AttendanceInput = Classifiable & { date: string; name: string; project?: string | null; note?: string | null };

export async function saveAttendanceRecord(input: AttendanceInput & { id?: string }) {
  const data = {
    date: new Date(`${input.date}T00:00:00Z`),
    name: input.name,
    project: input.project || null,
    type: input.type,
    excuse: input.excuse,
    minutesLate: input.type === "late" ? input.minutesLate : null,
    note: input.note || null,
  };
  if (input.id) await prisma.nutAttendanceRecord.update({ where: { id: input.id }, data });
  else await prisma.nutAttendanceRecord.create({ data: { id: `att-${crypto.randomUUID()}`, source: "직접 입력", ...data } });
}

export async function deleteAttendanceRecord(id: string) {
  await prisma.nutAttendanceRecord.delete({ where: { id } });
}

// ---------- Slack '출석핑' 워크플로 ----------

export type Person = { name: string; email: string | null };

// 출석 기록 단계: 네 명단을 기록으로 만든다. id에 워크플로 실행 id를 넣어서 Slack이 재전송해도 한 번만 생긴다.
// 사유결석·사유지각은 일단 사유(벌점 없음)로 넣고, 부분사유인지는 화면에서 회장단이 고친다.
export async function recordRollCall(
  executionId: string,
  date: string,
  project: string | null,
  groups: Array<{ people: Person[]; type: AttendanceType; excuse: Excuse }>,
) {
  const rows = groups.flatMap(({ people, type, excuse }) =>
    people.map((person) => ({
      id: `att-${executionId}-${person.email ?? person.name}-${type}`,
      date: new Date(`${date}T00:00:00Z`),
      name: person.name,
      email: person.email,
      project,
      type,
      excuse,
      source: "Slack",
    })),
  );
  if (rows.length) await prisma.nutAttendanceRecord.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}

// '지각했어용' 단계: 그날 그 사람의 결석·지각 기록에 지각 시간을 채운다(결석으로 찍혔어도 늦게 왔으면 지각).
// 명단에 없던 사람이면 무단지각으로 새로 만든다.
export async function recordArrival(executionId: string, date: string, person: Person, minutesLate: number) {
  const day = new Date(`${date}T00:00:00Z`);
  const existing = await prisma.nutAttendanceRecord.findFirst({
    where: {
      date: day,
      type: { in: ["late", "absent"] },
      ...(person.email ? { email: person.email } : { name: person.name }),
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    await prisma.nutAttendanceRecord.update({ where: { id: existing.id }, data: { type: "late", minutesLate } });
    return existing.id;
  }
  const id = `att-${executionId}`;
  await prisma.nutAttendanceRecord.upsert({
    where: { id },
    update: { minutesLate },
    create: { id, date: day, name: person.name, email: person.email, type: "late", excuse: "unexcused", minutesLate, source: "Slack" },
  });
  return id;
}

// ---------- 벌점 초기화 ----------

export async function clearPenalties(through: string) {
  await prisma.nutAttendanceReset.create({
    data: { id: `att-reset-${crypto.randomUUID()}`, clearedThrough: new Date(`${through}T00:00:00Z`) },
  });
}

// 가장 최근 초기화를 취소한다. 그 전 초기화가 있으면 그것이 다시 기준이 된다.
export async function undoLastClear() {
  const last = await prisma.nutAttendanceReset.findFirst({ orderBy: { createdAt: "desc" } });
  if (last) await prisma.nutAttendanceReset.delete({ where: { id: last.id } });
}
