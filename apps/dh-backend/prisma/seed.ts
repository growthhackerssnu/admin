// apps/dh-frontend/src/mocks/fixtures.ts의 샘플 8개 기업을 그대로 재현하는 시드.
// 목업이 이미 검증한 시나리오(무응답 차단, 배포 전 접촉자 제외, 재접촉 맥락 등)로
// 실제 API를 바로 스모크 테스트할 수 있게 하는 것이 목적이다.
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // 아래는 전부 dh 스키마 소유 테이블이다. idempotencyKey는 분리 이후
  // dh.idempotency_keys를 가리키므로 지워도 portal에 영향이 없다(§4.1).
  // 리스트업 쪽은 candidates ↔ fit_assessments/human_fit_decisions가 서로를 참조해서
  // 지우는 순서만으로는 못 푼다. 후보의 "현재 무엇을 가리키는지"를 먼저 비우고 지운다.
  await prisma.candidate.updateMany({
    data: { currentResearchId: null, latestSystemAssessmentId: null, activeHumanDecisionId: null },
  });
  await prisma.$transaction([
    prisma.candidateContact.deleteMany(),
    prisma.researchTask.deleteMany(),
    prisma.interventionAssessment.deleteMany(),
    prisma.fitAssessment.deleteMany(),
    prisma.humanFitDecision.deleteMany(),
    prisma.candidate.deleteMany(),
    prisma.researchClaim.deleteMany(),
    prisma.companyResearch.deleteMany(),
    prisma.contactChannel.deleteMany(),
    prisma.companyPerson.deleteMany(),
    prisma.evidence.deleteMany(),
    prisma.searchRun.deleteMany(),
  ]);

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
    prisma.job.deleteMany(),
    prisma.quarter.deleteMany(),
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

  // 분기 라벨은 담당자가 정하는 값이다. 시드는 프론트 미리보기와 같은 YYYY-Qn 형식을 쓴다.
  const previousQuarter = await prisma.quarter.create({
    data: {
      label: "2026-Q2",
      active: false,
      createdAt: new Date("2026-06-01T00:00:00Z"),
      closedAt: new Date("2026-09-01T00:00:00Z"),
      createdById: jaewook.id,
    },
  });
  const currentQuarter = await prisma.quarter.create({
    data: { label: "2026-Q3", createdAt: new Date("2026-09-01T00:00:00Z"), createdById: jaewook.id },
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
        quarterId: currentQuarter.id,
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
      data: { lastSentQuarterId: previousQuarter.id, recipientContactId: minsu.id, recipientEndpointId: minsuEndpoint.id },
    });
    await prisma.sentMessage.create({
      data: {
        outreachId: outreach.id,
        quarterId: previousQuarter.id,
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
      data: { lastSentQuarterId: currentQuarter.id, recipientContactId: minsu.id, recipientEndpointId: minsuEndpoint.id },
    });
    await prisma.sentMessage.create({
      data: {
        outreachId: outreach.id,
        quarterId: currentQuarter.id,
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
        quarterId: previousQuarter.id,
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

  // ---------- 리스트업 샘플 ----------
  // 결과 화면의 네 가지 분류(명세 §4.3)가 전부 한 번씩 나오도록 만든다.
  const searchRun = await prisma.searchRun.create({
    data: {
      quarterId: currentQuarter.id,
      sourcePolicy: "allow_supplementary",
      sources: [
        { key: "Google", name: "Google", entry_urls: [], query: "신규 구독 서비스 출시 기업" },
        { key: "뉴스레터", name: "뉴스레터", entry_urls: [], query: null },
      ],
      filters: {
        industries: [],
        keywords: ["구독 서비스"],
        regions: [],
        company_stages: [],
        excluded_company_ids: [],
        additional_conditions: null,
      },
      limits: { max_companies: 20, max_fit_followup_rounds: 1, max_contact_search_rounds: 2 },
      status: "completed",
      duplicateExcludedCount: 2,
      createdById: jaewook.id,
      startedAt: new Date("2026-09-20T01:00:00Z"),
      finishedAt: new Date("2026-09-20T01:40:00Z"),
    },
  });

  async function makeListupCompany(name: string, domain: string, aliases: string[]) {
    return prisma.company.create({
      data: { name, aliases, canonicalDomain: domain, websiteUrl: `https://${domain}` },
    });
  }

  // 1) 적합 + 창구 확보 — 시스템이 적합으로 판단했고 쓸 수 있는 이메일이 있다.
  const fitCompany = await makeListupCompany("모닝루프", "morningloop.example", ["MorningLoop"]);
  const fitEvidence = await prisma.evidence.create({
    data: {
      companyId: fitCompany.id,
      searchRunId: searchRun.id,
      url: "https://morningloop.example/pricing",
      sourceName: "공식 사이트",
      sourceType: "official",
      title: "요금제 안내",
      excerpt: "월 구독 2종과 연간 결제 할인을 운영한다.",
    },
  });
  const fitResearch = await prisma.companyResearch.create({
    data: {
      companyId: fitCompany.id,
      searchRunId: searchRun.id,
      missingInformation: ["해지율 수준"],
      claims: {
        create: [
          {
            category: "revenue_model",
            content: "월 구독 2종과 연간 결제 할인을 함께 운영한다.",
            basis: "reported_fact",
            evidenceIds: [fitEvidence.id],
          },
          {
            category: "user_journey",
            content: "가입 후 첫 사용까지 이탈이 클 것으로 보인다.",
            basis: "inference",
            evidenceIds: [],
          },
        ],
      },
    },
  });
  const fitCandidate = await prisma.candidate.create({
    data: {
      searchRunId: searchRun.id,
      companyId: fitCompany.id,
      discoveryEvidenceIds: [fitEvidence.id],
      currentResearchId: fitResearch.id,
    },
  });
  const fitAssessment = await prisma.fitAssessment.create({
    data: {
      candidateId: fitCandidate.id,
      researchId: fitResearch.id,
      verdict: "fit",
      summary: "온보딩 이탈 구간에서 실험할 여지가 크다.",
      informationGaps: [{ question: "해지율 수준", resolution_method: "company_confirmation" }],
      criteriaVersion: "2026-09",
      interventions: {
        create: [
          {
            area: "온보딩 개선",
            feasibilityVerdict: "supported",
            feasibilityRationale: "공개된 가입 흐름에서 단계별 이탈 지점을 확인할 수 있다.",
            feasibilityEvidenceIds: [fitEvidence.id],
            requiredConditions: ["가입 퍼널 데이터 접근"],
            valueVerdict: "supported",
            valueRationale: "구독 전환이 매출과 직결된다.",
            valueEvidenceIds: [fitEvidence.id],
            targetBusinessOutcome: "첫 구독 전환율 상승",
          },
        ],
      },
    },
  });
  const fitPerson = await prisma.companyPerson.create({
    data: {
      companyId: fitCompany.id,
      name: "이지현",
      jobTitle: "그로스 리드",
      jobFunction: "business_development",
      seniority: "manager",
      employmentStatus: "current",
      employmentEvidenceIds: [fitEvidence.id],
    },
  });
  const fitChannel = await prisma.contactChannel.create({
    data: {
      companyId: fitCompany.id,
      personId: fitPerson.id,
      type: "email",
      value: "jihyun@morningloop.example",
      ownerType: "person",
      discoveryMethod: "public_source",
      ownershipStatus: "supported",
      validationStatus: "valid_format",
      evidenceIds: [fitEvidence.id],
    },
  });
  await prisma.candidateContact.create({
    data: {
      candidateId: fitCandidate.id,
      contactChannelId: fitChannel.id,
      status: "usable",
      priority: "preferred",
      roleRelevance: "그로스 실험 의사결정에 관여",
      decisionAuthority: "supported",
      reason: "재직이 확인됐고 형식도 유효하다.",
    },
  });
  await prisma.candidate.update({
    where: { id: fitCandidate.id },
    data: {
      latestSystemAssessmentId: fitAssessment.id,
      effectiveFit: "fit",
      contactStatus: "available",
      usableContactCount: 1,
    },
  });

  // 2) 판단 보류 — 공개 정보가 부족해서 결론을 내리지 못했다.
  const pendingCompany = await makeListupCompany("폴드마켓", "foldmarket.example", []);
  const pendingEvidence = await prisma.evidence.create({
    data: {
      companyId: pendingCompany.id,
      searchRunId: searchRun.id,
      url: "https://news.example/foldmarket",
      sourceName: "뉴스",
      sourceType: "news",
      excerpt: "시드 투자를 유치했다.",
    },
  });
  const pendingResearch = await prisma.companyResearch.create({
    data: {
      companyId: pendingCompany.id,
      searchRunId: searchRun.id,
      missingInformation: ["수익 모델", "주요 고객군"],
    },
  });
  const pendingCandidate = await prisma.candidate.create({
    data: {
      searchRunId: searchRun.id,
      companyId: pendingCompany.id,
      discoveryEvidenceIds: [pendingEvidence.id],
      currentResearchId: pendingResearch.id,
    },
  });
  const pendingAssessment = await prisma.fitAssessment.create({
    data: {
      candidateId: pendingCandidate.id,
      researchId: pendingResearch.id,
      verdict: "pending",
      summary: "수익 모델을 확인하지 못해 개입 가치를 판단할 수 없다.",
      informationGaps: [{ question: "수익 모델", resolution_method: "public_research" }],
      criteriaVersion: "2026-09",
    },
  });
  await prisma.candidate.update({
    where: { id: pendingCandidate.id },
    data: { latestSystemAssessmentId: pendingAssessment.id, effectiveFit: "pending" },
  });

  // 3) 시스템은 부적합, 사람이 적합으로 뒤집은 뒤 연락 조사가 도는 중 — searching 상태.
  const overriddenCompany = await makeListupCompany("클리어노트", "clearnote.example", []);
  const overriddenResearch = await prisma.companyResearch.create({
    data: { companyId: overriddenCompany.id, searchRunId: searchRun.id, missingInformation: [] },
  });
  const overriddenCandidate = await prisma.candidate.create({
    data: {
      searchRunId: searchRun.id,
      companyId: overriddenCompany.id,
      discoveryEvidenceIds: [],
      currentResearchId: overriddenResearch.id,
    },
  });
  const overriddenAssessment = await prisma.fitAssessment.create({
    data: {
      candidateId: overriddenCandidate.id,
      researchId: overriddenResearch.id,
      verdict: "unfit",
      summary: "개입할 만한 성장 지표를 찾지 못했다.",
      criteriaVersion: "2026-09",
    },
  });
  const humanDecision = await prisma.humanFitDecision.create({
    data: {
      candidateId: overriddenCandidate.id,
      verdict: "fit",
      reason: "기존 판단에서 다루지 않은 온보딩 개선 가능성이 있음",
      interventionNote: "가입 후 첫 사용까지의 이탈 구간에 실험 가능",
      basedOnAssessmentId: overriddenAssessment.id,
      decidedById: minjun.id,
    },
  });
  await prisma.researchTask.create({
    data: {
      searchRunId: searchRun.id,
      candidateId: overriddenCandidate.id,
      type: "contact_research",
      trigger: "fit_changed",
      followupPolicy: "automatic",
      status: "queued",
    },
  });
  await prisma.candidate.update({
    where: { id: overriddenCandidate.id },
    data: {
      latestSystemAssessmentId: overriddenAssessment.id,
      activeHumanDecisionId: humanDecision.id,
      effectiveFit: "fit",
      contactStatus: "searching",
      revision: 2,
    },
  });

  // 재시도 흐름을 눌러볼 수 있게 실패한 작업을 하나 남긴다.
  await prisma.researchTask.create({
    data: {
      searchRunId: searchRun.id,
      candidateId: pendingCandidate.id,
      type: "company_research",
      trigger: "human_request",
      requestedInformation: ["현재 구독 상품의 수익 구조와 가격 정책 확인"],
      followupPolicy: "none",
      status: "failed",
      errorCode: "SOURCE_TIMEOUT",
      errorMessage: "검색 소스가 응답하지 않았습니다.",
      errorRetryable: true,
      finishedAt: new Date("2026-09-20T01:35:00Z"),
    },
  });

  console.log("시드 완료: 시드 회원 2명(upsert), quarters=2, companies=11");
  console.log("  리스트업: search_runs=1, candidates=3(적합·보류·사람변경), tasks=2");
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
