import type { Company } from "./model";

export interface MessageMember {
  name: string;
  jobTitle?: string;
}

export function projectSchedule(quarter: string) {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!match) throw new Error(`Invalid target quarter: ${quarter}`);
  const year = Number(match[1]);
  const first = (Number(match[2]) - 1) * 3 + 1;
  const previousYear = first === 1 ? year - 1 : year;
  const previousMonth = first === 1 ? 12 : first - 1;
  const nextYear = first === 10 ? year + 1 : year;
  const nextMonth = first === 10 ? 1 : first + 3;
  // Week 5 is replaced by the last week when that month has only four weeks.
  const days = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate();
  return {
    period: `${year}년 ${first}~${first + 2}월`,
    kickoff: `${previousYear}년 ${previousMonth}월 4주차~${days > 28 ? "5주차" : "마지막 주"}`,
    interim: `${year}년 ${first + 1}월 1~2주차`,
    final: `${year}년 ${first + 2}월 3~4주차`,
    next: `${nextYear}년 ${nextMonth}~${nextMonth + 1}월`,
  };
}

export function withCompanyParticle(name: string) {
  const last = name.charCodeAt(name.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return `${name}(와/과)`;
  return `${name}${(last - 0xac00) % 28 === 0 ? "와" : "과"}`;
}

function relevantPartners(company: Company) {
  const context = `${company.service} ${company.about} ${company.area}`;
  if (/게임/.test(context)) return "슈퍼센트";
  if (/금융|투자|증권|가상자산/.test(context)) return "NH투자증권, 코인원";
  if (/의료|건강|뷰티|병원/.test(context)) return "강남언니";
  if (/기업 정보|R&D|지식|문서/.test(context)) return "더브이씨";
  return "NH투자증권, 강남언니, 슈퍼센트";
}

export function contactMessage(
  company: Company,
  quarter: string,
  members: MessageMember[],
) {
  const leaders = members.filter(
    (member) => member.jobTitle === "대외협력팀장",
  );
  const leader = leaders.length === 1 ? leaders[0].name : "{{대외협력팀장명}}";
  const dates = projectSchedule(quarter);
  return {
    subject: `[Growth Hackers] ${dates.period} ${company.name} 산학협력프로젝트 제안`,
    body: `안녕하세요, ${company.name} {{수신자명}} {{수신자직함}} 님

서울대학교 경영대학 소속 비즈니스 데이터 분석 학회 Growth Hackers 대외협력팀장 ${leader}입니다.

저희 Growth Hackers는 데이터 기반 의사결정을 통해 기업의 비즈니스 가치 창출을 도모하는 학회입니다. ${relevantPartners(company)} 등 다양한 산업군의 기업들과 협력하며, 기업 문제 해결을 위한 데이터 분석 및 모델링 프로젝트를 진행하고 있습니다.

Growth Hackers에서 오는 ${dates.period}에 진행될 산학협력프로젝트를 ${withCompanyParticle(company.name)} 함께하고자 협업을 제안드립니다. ${company.service}에 관한 조사에서 협업 접점을 살펴보았습니다. ${company.possibility} 이 가능성을 함께 논의하고자 {{수신자명}}님께 연락드리게 되었습니다. 제품의 문제 정의 및 현 시점의 과제에 기반하여, 데이터 분석을 통한 전략 제안 및 실행(Data Analysis) 혹은 모델링(Data Science) 프로젝트를 함께 진행하고자 합니다.

예를 들어,

- ${company.area} 관련 사용자 행동 분석 및 개선 가설 도출
- 사용자 세그멘테이션을 통한 ${company.service}의 이용 패턴 및 전환 전략 제안
- 데이터 확보 범위에 따른 주요 행동 예측 모델 설계 및 성능 검증

와 같은 프로젝트를 함께 고민해볼 수 있을 것이라 생각합니다.

사전 미팅을 통해 기업 상황에 적합한 프로젝트 주제를 상세 협의하며, 비즈니스 및 데이터 모델링에 역량을 가진 경영/산업공학/인공지능 관련 전공 등의 학회원들이 프로젝트를 수행하고 있습니다. 지난 해에 협업한 다수의 기업이 재진행 제안을 주셨으며, 정량적 비즈니스 임팩트와 함께 후속 인턴십 연계로도 활발히 이어질 만큼 높은 수준의 리소스 투입과 성과를 이어오고 있습니다.

저희 Growth Hackers에서 진행한 최근 프로젝트는 아래와 같습니다.

1. 더브이씨: LLM 기반 R&D 과제 및 기업 정보 요약 파이프라인 설계
2. 슈퍼센트: 하이브리드 캐쥬얼 게임의 플레이 흐름 기반 유저 광고 수익 최적화
3. 코인원: 유저 세그멘테이션 및 마르코프 체인 분석과 BERT4REC을 통한 리텐션 예측 모델 구성
4. 원셀프월드: 유저 세그멘테이션 기반 리텐션 전환 전략 제시

프로젝트 진행 시, 예상 타임라인은 아래와 같습니다. (변동 가능)

1. 참여 인원 확정 및 킥오프 미팅: ${dates.kickoff}
2. 중간 발표: ${dates.interim}
3. 최종 발표: ${dates.final}

현재는 ${dates.period} 프로젝트를 우선적으로 제안드리고 있으나 데이터 적재 및 프로젝트 준비, 팀 배정 등 제반 상황에 따라 차기 ${dates.next} 일정으로 협의를 이어갈 수도 있습니다.

Growth Hackers 과거 프로젝트에 관한 상세 내용과 협업 방식을 포함한 소개서를 함께 송부드립니다. 앞선 주제 이외에도 현재 내부적으로 고려하고 계신 데이터 관련 과제가 있으시거나 궁금하신 점이 있으시면, 본 메시지나 아래 연락처 통해 회신 주시면 상세히 답변드리겠습니다.
감사합니다.

Growth Hackers 대외협력팀장 ${leader} 드림

메일: contact@ghsnu.com
전화: 010-4757-3987`,
  };
}

export function changeMessageQuarter(
  text: string,
  before: string,
  after: string,
) {
  const oldDates = projectSchedule(before);
  const newDates = projectSchedule(after);
  // Replace in one pass: a new period can equal the old alternative period.
  const mapping = new Map(
    Object.entries(oldDates).map(([key, value]) => [
      value,
      newDates[key as keyof typeof newDates],
    ]),
  );
  const pattern = [...mapping.keys()]
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return text.replace(new RegExp(pattern, "g"), (value) => mapping.get(value)!);
}
