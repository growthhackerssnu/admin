// apps/dh-frontend/src/mocks/fixtures.ts의 샘플 8개 기업을 그대로 재현하는 시드.
// 목업이 이미 검증한 시나리오(무응답 차단, 배포 전 접촉자 제외, 재접촉 맥락 등)로
// 실제 API를 바로 스모크 테스트할 수 있게 하는 것이 목적이다.
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // 아래는 전부 dh 스키마 소유 테이블이다. idempotencyKey는 분리 이후
  // dh.idempotency_keys를 가리키므로 지워도 portal에 영향이 없다(§4.1).
  await prisma.$transaction([
    prisma.idempotencyKey.deleteMany(),
    prisma.response.deleteMany(),
    prisma.sentMessage.deleteMany(),
    prisma.messageDraftRevision.deleteMany(),
    prisma.outreach.deleteMany(),
    prisma.pastProject.deleteMany(),
    prisma.prelaunchContact.deleteMany(),
    prisma.contactEndpoint.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.company.deleteMany(),
    prisma.searchRun.deleteMany(),
    prisma.job.deleteMany(),
    prisma.cycleStartIntent.deleteMany(),
    prisma.cycle.deleteMany(),
    prisma.template.deleteMany(),
  ]);

  // members는 portal이 소유하는 core 스키마의 공유 테이블이다(conventions.md §4, §5).
  // 예전엔 위 삭제 목록에 member.deleteMany()가 있어서, dh 시드를 한 번 돌리면 실제
  // 회원 계정이 전부 날아갔다 — 개발용 DB가 따로 없어 운영 DB를 그대로 보는 지금
  // 구조에서는 특히 위험했다. 이제 시드 전용 계정 둘만 upsert하고 나머지는 두지 않는다.
  const jaewook = await prisma.member.upsert({
    where: { email: "jaewook@ghsnu.com" },
    update: { displayName: "재욱", role: "acting", active: true },
    create: { supabaseUserId: "seed-jaewook", email: "jaewook@ghsnu.com", displayName: "재욱", role: "acting" },
  });
  const minjun = await prisma.member.upsert({
    where: { email: "minjun@ghsnu.com" },
    update: { displayName: "민준", role: "acting", active: true },
    create: { supabaseUserId: "seed-minjun", email: "minjun@ghsnu.com", displayName: "민준", role: "acting" },
  });

  const previousCycle = await prisma.cycle.create({
    data: {
      name: "이전 차수",
      startedAt: new Date("2026-06-01T00:00:00Z"),
      endedAt: new Date("2026-09-01T00:00:00Z"),
      startedById: jaewook.id,
    },
  });
  const currentCycle = await prisma.cycle.create({
    data: { name: "이번 차수", startedAt: new Date("2026-09-01T00:00:00Z"), startedById: jaewook.id },
  });

  async function makeCompany(input: {
    name: string;
    product: string;
    domain: string;
    owner: typeof jaewook;
    route: "new" | "alternate_contact" | "recontact" | "repeat_collaboration";
    workStage: "company_review" | "recipient_selection" | "draft_review" | "ready_to_send" | "response_check";
  }) {
    const company = await prisma.company.create({
      data: { name: input.name, product: input.product, domain: input.domain },
    });
    const outreach = await prisma.outreach.create({
      data: {
        companyId: company.id,
        ownerId: input.owner.id,
        currentCycleId: currentCycle.id,
        route: input.route,
        workStage: input.workStage,
      },
    });
    return { company, outreach };
  }

  // 1. 러닝루프 — 신규/기업 검토
  await makeCompany({
    name: "러닝루프",
    product: "맞춤 학습 앱",
    domain: "교육",
    owner: jaewook,
    route: "new",
    workStage: "company_review",
  });

  // 2. 데일리바스켓 — 다른 관계자/응답 확인 (이전 차수 발송, 무응답 확인 대기)
  {
    const { company, outreach } = await makeCompany({
      name: "데일리바스켓",
      product: "식료품 정기배송",
      domain: "커머스",
      owner: jaewook,
      route: "alternate_contact",
      workStage: "response_check",
    });
    const minsu = await prisma.contact.create({
      data: { companyId: company.id, name: "김민수", title: "사업개발" },
    });
    const minsuEndpoint = await prisma.contactEndpoint.create({
      data: { companyId: company.id, contactId: minsu.id, channel: "email", address: "minsu@company.example" },
    });
    await prisma.outreach.update({
      where: { id: outreach.id },
      data: { lastSentCycleId: previousCycle.id, recipientContactId: minsu.id, recipientEndpointId: minsuEndpoint.id },
    });
    await prisma.sentMessage.create({
      data: {
        outreachId: outreach.id,
        cycleId: previousCycle.id,
        channel: "email",
        recipientContactId: minsu.id,
        recipientEndpointId: minsuEndpoint.id,
        recipientNameSnapshot: minsu.name,
        addressSnapshot: minsuEndpoint.address,
        subjectSnapshot: "[Growthhackers] 협업 제안",
        bodySnapshot: "본문 미기록 (이전 목업 이관 샘플)",
        sentAt: new Date("2026-07-01T02:00:00Z"),
      },
    });
  }

  // 3. 핀브릿지 — 재협업/초안 검토 (과거 협업 기록 + 작성된 초안)
  {
    const { company, outreach } = await makeCompany({
      name: "핀브릿지",
      product: "개인 자산관리 앱",
      domain: "금융",
      owner: minjun,
      route: "repeat_collaboration",
      workStage: "draft_review",
    });
    await prisma.pastProject.create({
      data: { companyId: company.id, title: "사용자 세분화 분석", summary: "데이터 제공과 커뮤니케이션 원활" },
    });
    const seoyeon = await prisma.contact.create({
      data: { companyId: company.id, name: "박서연", title: "사업개발 리드" },
    });
    const seoyeonEndpoint = await prisma.contactEndpoint.create({
      data: { companyId: company.id, contactId: seoyeon.id, channel: "email", address: "partner@company.example" },
    });
    await prisma.outreach.update({
      where: { id: outreach.id },
      data: { recipientContactId: seoyeon.id, recipientEndpointId: seoyeonEndpoint.id, currentRevision: 1 },
    });
    await prisma.messageDraftRevision.create({
      data: {
        outreachId: outreach.id,
        revision: 1,
        topic: "온보딩 개선",
        subject: "[Growthhackers] 산학협력 제안",
        body: "박서연님 안녕하세요.\n지난 협업에 감사드립니다. 이번에는 온보딩 개선을 주제로 산학협력을 제안드립니다.\n\n이 내용은 시드 샘플 메시지입니다.",
        createdBy: "ai",
      },
    });
  }

  // 4. 모먼트핏 — 다른 관계자/응답 확인, 이번 차수에 이미 발송(추가 발송 차단 케이스)
  {
    const { company, outreach } = await makeCompany({
      name: "모먼트핏",
      product: "운동 기록 서비스",
      domain: "헬스케어",
      owner: minjun,
      route: "alternate_contact",
      workStage: "response_check",
    });
    const minsu = await prisma.contact.create({
      data: { companyId: company.id, name: "김민수", title: "사업개발" },
    });
    const minsuEndpoint = await prisma.contactEndpoint.create({
      data: { companyId: company.id, contactId: minsu.id, channel: "email", address: "minsu@company.example" },
    });
    await prisma.outreach.update({
      where: { id: outreach.id },
      data: { lastSentCycleId: currentCycle.id, recipientContactId: minsu.id, recipientEndpointId: minsuEndpoint.id },
    });
    await prisma.sentMessage.create({
      data: {
        outreachId: outreach.id,
        cycleId: currentCycle.id,
        channel: "email",
        recipientContactId: minsu.id,
        recipientEndpointId: minsuEndpoint.id,
        recipientNameSnapshot: minsu.name,
        addressSnapshot: minsuEndpoint.address,
        subjectSnapshot: "[Growthhackers] 협업 제안",
        bodySnapshot: "본문 미기록 (이전 목업 이관 샘플)",
        sentAt: new Date("2026-09-05T02:00:00Z"),
      },
    });
  }

  // 5. 워크네스트 — 재접촉/기업 검토 (이전 차수 보류 응답 존재)
  {
    const { company, outreach } = await makeCompany({
      name: "워크네스트",
      product: "팀 협업 도구",
      domain: "업무 생산성",
      owner: jaewook,
      route: "recontact",
      workStage: "company_review",
    });
    const minsu = await prisma.contact.create({
      data: { companyId: company.id, name: "김민수", title: "사업개발" },
    });
    const minsuEndpoint = await prisma.contactEndpoint.create({
      data: { companyId: company.id, contactId: minsu.id, channel: "email", address: "minsu@company.example" },
    });
    const send = await prisma.sentMessage.create({
      data: {
        outreachId: outreach.id,
        cycleId: previousCycle.id,
        channel: "email",
        recipientContactId: minsu.id,
        recipientEndpointId: minsuEndpoint.id,
        recipientNameSnapshot: minsu.name,
        addressSnapshot: minsuEndpoint.address,
        subjectSnapshot: "[Growthhackers] 협업 제안",
        bodySnapshot: "본문 미기록 (이전 목업 이관 샘플)",
        sentAt: new Date("2026-07-15T02:00:00Z"),
      },
    });
    await prisma.response.create({
      data: {
        outreachId: outreach.id,
        sentMessageId: send.id,
        result: "deferred",
        category: "resource_shortage",
        explanation: "내부 리소스 부족으로 협업 진행이 어렵습니다. (시드 샘플)",
        revisitCondition: "내부 리소스 확보 여부 확인 필요",
        checkedById: jaewook.id,
        checkedAt: new Date("2026-07-20T02:00:00Z"),
      },
    });
  }

  // 6. 로컬패스 — 신규/관계자 선택
  await makeCompany({
    name: "로컬패스",
    product: "지역 경험 예약",
    domain: "여행",
    owner: minjun,
    route: "new",
    workStage: "recipient_selection",
  });

  // 7. 그린테이블 — 신규/기업 검토
  await makeCompany({
    name: "그린테이블",
    product: "식단 관리 앱",
    domain: "라이프스타일",
    owner: jaewook,
    route: "new",
    workStage: "company_review",
  });

  // 8. 브릿지랩 — 신규/기업 검토, 배포 전 LinkedIn 접촉자 제외 샘플
  {
    const { company } = await makeCompany({
      name: "브릿지랩",
      product: "팀 일정 앱",
      domain: "업무 생산성",
      owner: jaewook,
      route: "new",
      workStage: "company_review",
    });
    await prisma.company.update({ where: { id: company.id }, data: { isPrelaunchOnly: true } });
    await prisma.prelaunchContact.create({
      data: {
        companyId: company.id,
        name: "박서연",
        email: "partner@company.example",
        note: "배포 전 LinkedIn 컨택 · 시드 샘플",
      },
    });
  }

  console.log("시드 완료: 시드 회원 2명(upsert), cycles=2, companies=8");
  console.log("  core.members의 다른 회원은 건드리지 않았습니다 — portal 소유 테이블입니다.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
