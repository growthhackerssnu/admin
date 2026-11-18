// 목표 분기에서 메일에 들어가는 일정 문구를 만든다. 양식 본문은 DB(설정 > 메일 양식)에 있다.
// 1·3분기는 방학에 진행한다 — 두 달(1~2월, 7~8월)이고 중간 발표 없이 둘째 달 3~4주차에 최종 발표한다.
// 중간 발표가 없으면 midSchedule은 null이고, 양식에서 그 줄은 빠진다(dropSlotLine).
const isVacation = (quarter: number) => quarter === 1 || quarter === 3;

export function quarterSchedule(year: number, quarter: number) {
  if (!Number.isInteger(year) || !Number.isInteger(quarter) || quarter < 1 || quarter > 4)
    throw new Error("Invalid target quarter");
  const firstMonth = (quarter - 1) * 3 + 1;
  const lastMonth = firstMonth + (isVacation(quarter) ? 1 : 2);
  const nextQuarter = quarter === 4 ? 1 : quarter + 1;
  const nextYear = quarter === 4 ? year + 1 : year;
  const nextFirstMonth = (nextQuarter - 1) * 3 + 1;
  const nextLastMonth = nextFirstMonth + (isVacation(nextQuarter) ? 1 : 2);
  const previousMonth = firstMonth === 1 ? 12 : firstMonth - 1;
  const previousYear = firstMonth === 1 ? year - 1 : year;
  return {
    projectPeriod: `${year}년 ${firstMonth}~${lastMonth}월`,
    kickoffSchedule: `${previousYear}년 ${previousMonth}월 4주차~${year}년 ${firstMonth}월 1주차`,
    midSchedule: isVacation(quarter) ? null : `${year}년 ${firstMonth + 1}월 1~2주차`,
    finalSchedule: `${year}년 ${lastMonth}월 3~4주차`,
    nextPeriod: `${nextYear}년 ${nextFirstMonth}~${nextLastMonth}월`,
  };
}
