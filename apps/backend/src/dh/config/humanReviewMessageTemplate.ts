// 목표 분기에서 메일에 들어가는 일정 문구를 만든다. 양식 본문은 DB(설정 > 메일 양식)에 있다.
export function quarterSchedule(year: number, quarter: number) {
  if (!Number.isInteger(year) || !Number.isInteger(quarter) || quarter < 1 || quarter > 4)
    throw new Error("Invalid target quarter");
  const firstMonth = (quarter - 1) * 3 + 1;
  const nextYear = quarter === 4 ? year + 1 : year;
  const nextFirstMonth = quarter === 4 ? 1 : firstMonth + 3;
  const previousMonth = firstMonth === 1 ? 12 : firstMonth - 1;
  const previousYear = firstMonth === 1 ? year - 1 : year;
  return {
    projectPeriod: `${year}년 ${firstMonth}~${firstMonth + 2}월`,
    kickoffSchedule: `${previousYear}년 ${previousMonth}월 4주차~${year}년 ${firstMonth}월 1주차`,
    midSchedule: `${year}년 ${firstMonth + 1}월 1~2주차`,
    finalSchedule: `${year}년 ${firstMonth + 2}월 3~4주차`,
    nextPeriod: `${nextYear}년 ${nextFirstMonth}~${nextFirstMonth + 2}월`,
  };
}
