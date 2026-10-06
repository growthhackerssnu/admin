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

export type AttendanceType = "late" | "absent" | "quest";
export type Excuse = "excused" | "partial" | "unexcused";
type Classifiable = { type: AttendanceType; excuse: Excuse; minutesLate: number | null };

// 지각 비율(지각 분 ÷ 세션 길이)의 기준 세션 길이. 시트 기록(9분 = 5% 미만)에서 3시간으로 맞췄다.
// ponytail: 세션마다 길이가 다르면 기록에 세션 길이를 저장한다.
export const SESSION_MINUTES = 180;

// 벌점벌금 탭의 열과 같은 이름·점수·금액. 사유(전부 인정)는 벌점이 없다.
export function penalty({ type, excuse, minutesLate }: Classifiable) {
  if (excuse === "excused") return { label: type === "absent" ? "사유결석" : "사유지각", points: 0, fine: 0 };
  if (type === "absent")
    return excuse === "partial"
      ? { label: "부분사유결석", points: 3, fine: 10000 }
      : { label: "무단결석", points: 5, fine: 20000 };
  if (type === "quest")
    return excuse === "partial"
      ? { label: "퀘스트미제출(부분사유)", points: 1, fine: 5000 }
      : { label: "퀘스트미제출(무단)", points: 2, fine: 10000 };
  // 지각 시간을 아직 모르면 벌점을 매기지 않고 화면에서 입력하라고 알린다.
  if (minutesLate == null) return { label: excuse === "partial" ? "부분사유지각" : "무단지각", points: 0, fine: 0, needsMinutes: true };
  const ratio = minutesLate / SESSION_MINUTES;
  if (excuse === "partial")
    return ratio <= 0.3
      ? { label: "부분사유지각(<30%)", points: 1, fine: 0 }
      : { label: "부분사유지각(>30%)", points: 3, fine: 10000 };
  if (ratio < 0.05) return { label: "무단지각(<5%)", points: 1, fine: 5000 };
  if (ratio <= 0.3) return { label: "무단지각(5~30%)", points: 2, fine: 10000 };
  return { label: "무단지각(>30%)", points: 5, fine: 20000 };
}

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

// 반기 안의 기록과, 기록이 없는 사람도 0점으로 보이도록 환급 계좌 명단(= 학회원 명단)을 돌려준다.
export async function getAttendance(periodId: string) {
  const period = await prisma.nutFinancePeriod.findUniqueOrThrow({ where: { id: periodId } });
  const [records, roster] = await Promise.all([
    prisma.nutAttendanceRecord.findMany({
      where: { date: { gte: period.periodStart, lte: period.periodEnd } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    prisma.nutRefundAccount.findMany({ select: { name: true, cohort: true }, orderBy: [{ cohort: "asc" }, { name: "asc" }] }),
  ]);
  return {
    sessionMinutes: SESSION_MINUTES,
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
        penalty: penalty(classified),
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
