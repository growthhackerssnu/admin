import type { Company, Contact } from "./outreach";
export const inactiveStages = [
  "논의 중",
  "보류",
  "제외",
  "이번 차수 건너뛰기",
  "영구 제외",
];
export function samePerson(a: Contact, b: Contact) {
  return (
    a.id === b.id ||
    (!!a.email && a.email.toLowerCase() === b.email.toLowerCase()) ||
    (!!a.linkedin &&
      a.linkedin.replace(/\/$/, "") === b.linkedin?.replace(/\/$/, ""))
  );
}
export function excluded(c: Company, p: Contact) {
  return (
    (c.prelaunchContacts || []).some((x) => samePerson(x, p)) ||
    (c.route === "다른 관계자" &&
      !!c.previousContact &&
      samePerson(c.previousContact, p))
  );
}
export function stageLabel(c: Company, cycleId: string) {
  if (c.stage === "응답 확인" && c.confirmed && c.lastSentCycleId === cycleId)
    return "무응답 확인 완료 · 다음 차수 재검토";
  if (c.stage === "관계자 선택" && c.route === "다른 관계자")
    return "다른 관계자 선택";
  return c.stage;
}
