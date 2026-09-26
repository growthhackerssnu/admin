import type { Prisma } from "@/generated/prisma";
import { LocalTaskReporter } from "@/lib/listup/localObservability";
import {
  runStructuredOutput,
  runWebSearch,
  type WebSearchResult,
} from "@/lib/listup/openaiWebSearch";
import { recomputeCandidateState } from "@/lib/listup/state";
import type { ResultRef } from "@/lib/listup/types";
import { ensureCompanyMailboxContact } from "@/lib/companyMailboxContact";
import { prisma } from "@/lib/prisma";

type CompanyIdentity = {
  id: string;
  name: string;
  legalName: string | null;
  aliases: string[];
  websiteUrl: string | null;
  canonicalDomain: string | null;
};

type LinkedinProfile = {
  profileUrl: string;
  name: string;
  title: string;
  quote: string;
};

type OfficialPage = {
  url: string;
  title: string | null;
  text: string;
  entityMatched: boolean;
};

type SavedContact = {
  endpointId: string;
  evidenceId: string;
};

type ContactSearchStrategy =
  | "executive"
  | "functional_leads"
  | "department_leads";

const PROFILE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["profiles"],
  properties: {
    profiles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["profileUrl", "name", "title", "quote"],
        properties: {
          profileUrl: { type: "string" },
          name: { type: "string" },
          title: { type: "string" },
          quote: { type: "string" },
        },
      },
    },
  },
};

function companyNames(company: CompanyIdentity) {
  return [company.name, company.legalName, ...company.aliases]
    .filter((name): name is string => Boolean(name?.trim()))
    .map((name) => name.trim());
}

function hasCompanyName(text: string, names: string[]) {
  const haystack = text.toLocaleLowerCase();
  return names.some((name) => haystack.includes(name.toLocaleLowerCase()));
}

function textFromHtml(value: string) {
  return value
    .replace(/mailto:([^\s"'<>?]+)/gi, " $1 ")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function domainOf(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function hasOfficialDomain(url: string, domain: string) {
  const host = domainOf(url);
  return Boolean(host && (host === domain || host.endsWith(`.${domain}`)));
}

function isLinkedinProfileUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      (url.hostname === "linkedin.com" ||
        url.hostname.endsWith(".linkedin.com")) &&
      /^\/in\/[^/]+/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isCLevel(title: string) {
  return /\b(?:ceo|coo|cto|cpo|cmo|cdo|cro|cfo|cio|cso|chief)\b|대표(?:이사)?|사장|최고[^\s,·]*책임자/i.test(
    title,
  );
}

function isRelevantLead(title: string) {
  return (
    /product|growth|crm|marketing|data|ai|strategy|operations|business development|제품|그로스|마케팅|데이터|인공지능|전략|운영/i.test(
      title,
    ) && /\b(?:head|lead)\b|헤드|리드|팀장|본부장/i.test(title)
  );
}

function profilePriority(title: string) {
  if (isCLevel(title)) return 0;
  if (isRelevantLead(title)) return 1;
  return 2;
}

function jobFunction(title: string) {
  if (isCLevel(title)) return "executive" as const;
  if (/product|제품/i.test(title)) return "product" as const;
  if (/data|ai|인공지능|데이터/i.test(title)) return "data" as const;
  return "business_development" as const;
}

function sourceRef(
  sourceKey: string,
  result: WebSearchResult,
  acceptedCount: number,
): ResultRef {
  return {
    type: "source",
    sourceKey,
    status: "succeeded",
    foundCount: result.sourceUrls.length,
    acceptedCount,
    webSearchCallCount: result.webSearchCallCount,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

function failedSourceRef(sourceKey: string, error: unknown): ResultRef {
  return {
    type: "source",
    sourceKey,
    status: "failed",
    foundCount: 0,
    acceptedCount: 0,
    errorMessage:
      error instanceof Error ? error.message : "Unknown source error",
  };
}

function savedRefs(value: unknown): ResultRef[] {
  return Array.isArray(value) ? (value as ResultRef[]) : [];
}

export function contactSearchStrategy(requestedInformation: string[]) {
  if (requestedInformation.includes("contact_strategy:functional_leads"))
    return "functional_leads" as const;
  if (requestedInformation.includes("contact_strategy:department_leads"))
    return "department_leads" as const;
  return "executive" as const;
}

export function buildLinkedinSearch(
  company: CompanyIdentity,
  strategy: ContactSearchStrategy = "executive",
) {
  const target =
    strategy === "executive"
      ? "Find publicly indexed LinkedIn profile URLs for current C-level leaders. Do not return non-executive profiles."
      : strategy === "functional_leads"
        ? "Do not return C-level leaders. Find current Head or Lead profiles for product, growth, CRM, marketing, data, AI, strategy, or operations."
        : "Do not return C-level leaders. Find current department Heads or Leads for business development, partnerships, customer success, growth, marketing, product, data, or operations.";
  return [
    "Perform exactly one focused public-web lookup for company contacts.",
    `Company names: ${companyNames(company).join(" / ")}`,
    "Use general web search results and public snippets only. Do not log in to LinkedIn, use LinkedIn internal search, or open LinkedIn profile pages.",
    target,
    "For every possible profile, state the person name, current title, company name, profile URL, and a concise cited quotation. Do not infer missing details.",
  ].join("\n");
}

export function verifiedOfficialDomain(company: CompanyIdentity) {
  if (!company.websiteUrl || !company.canonicalDomain) return null;
  const domain = company.canonicalDomain.replace(/^www\./i, "").toLowerCase();
  return hasOfficialDomain(company.websiteUrl, domain) ? domain : null;
}

export function buildOfficialEmailSearch(
  company: CompanyIdentity,
  domain: string,
) {
  return [
    "Perform exactly one focused public-web lookup for an official company contact email.",
    `Company names: ${companyNames(company).join(" / ")}`,
    `Search only pages on the verified official domain: site:${domain}`,
    "Find a publicly published shared company or team email, such as partnership, business, contact, hello, or info. Do not infer addresses or return personal email addresses.",
    "Return concise cited results only.",
  ].join("\n");
}

export function selectLinkedinProfile(
  profiles: LinkedinProfile[],
  sourceUrls: string[],
  searchText: string,
  names: string[],
) {
  const citedUrls = new Set(
    sourceUrls.map(canonicalUrl).filter((url): url is string => Boolean(url)),
  );
  return profiles
    .map((profile) => ({
      ...profile,
      profileUrl: canonicalUrl(profile.profileUrl),
    }))
    .filter((profile): profile is LinkedinProfile & { profileUrl: string } =>
      Boolean(
        profile.profileUrl &&
          isLinkedinProfileUrl(profile.profileUrl) &&
          profile.name.trim() &&
          profile.title.trim() &&
          profile.quote.trim() &&
          citedUrls.has(profile.profileUrl) &&
          searchText.includes(profile.quote) &&
          profile.quote.includes(profile.name) &&
          profile.quote.includes(profile.title) &&
          hasCompanyName(profile.quote, names) &&
          profilePriority(profile.title) < 2,
      ),
    )
    .sort(
      (left, right) =>
        profilePriority(left.title) - profilePriority(right.title) ||
        left.name.localeCompare(right.name, "ko"),
    )[0];
}

export function selectOfficialSourceUrl(urls: string[], domain: string) {
  return (
    urls.find((url) => canonicalUrl(url) && hasOfficialDomain(url, domain)) ??
    null
  );
}

function emailPriority(email: string) {
  const local = email.split("@", 1)[0] ?? "";
  if (/partnership|partner|business|biz|sales/i.test(local)) return 0;
  if (/contact|hello|info/i.test(local)) return 1;
  return 2;
}

export function selectPublishedOfficialEmail(text: string, domain: string) {
  const emails = [
    ...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []),
  ]
    .map((email) => email.toLowerCase())
    .filter((email) => {
      const [local, emailDomain] = email.split("@");
      return Boolean(
        local &&
          emailDomain &&
          (emailDomain === domain || emailDomain.endsWith(`.${domain}`)) &&
          /partnership|partner|business|biz|sales|contact|hello|info|support|help|marketing|growth/i.test(
            local,
          ),
      );
    });
  return (
    emails.sort(
      (left, right) =>
        emailPriority(left) - emailPriority(right) || left.localeCompare(right),
    )[0] ?? null
  );
}

async function fetchOfficialPage(
  url: string,
  names: string[],
): Promise<OfficialPage> {
  const response = await fetch(url, {
    headers: { "User-Agent": "dhbot-contact-research/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const html = (await response.text()).slice(0, 120_000);
  const titleHtml = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = titleHtml ? textFromHtml(titleHtml).slice(0, 500) : null;
  const text = textFromHtml(html);
  return {
    url,
    title,
    text,
    entityMatched: hasCompanyName(`${title ?? ""} ${text}`, names),
  };
}

async function claimContactResearchTask(taskId: string, runId: string) {
  const task = await prisma.researchTask.findUnique({ where: { id: taskId } });
  if (!task || task.type !== "contact_research") return null;
  const claim = await prisma.researchTask.updateMany({
    where: { id: taskId, status: "queued" },
    data: {
      status: "running",
      jobId: runId,
      startedAt: new Date(),
      errorCode: null,
      errorMessage: null,
      errorRetryable: null,
    },
  });
  if (claim.count) return true;
  if (task.status !== "running" || task.jobId !== runId) return false;
  await prisma.researchTask.update({
    where: { id: taskId },
    data: { attempt: { increment: 1 } },
  });
  return true;
}

async function cancelContactResearchTask(
  taskId: string,
  candidateId: string,
  runId: string,
) {
  await prisma.$transaction(async (tx) => {
    await tx.researchTask.updateMany({
      where: { id: taskId, status: "running", jobId: runId },
      data: { status: "cancelled", finishedAt: new Date() },
    });
    await recomputeCandidateState(tx, candidateId);
  });
  return { cancelled: true };
}

async function upsertAssessment(
  tx: Prisma.TransactionClient,
  input: {
    candidateId: string;
    endpointId: string;
    roleRelevance: string | null;
    decisionAuthority: "supported" | "unknown";
    reason: string;
    sourceUrl: string;
  },
) {
  const where = {
    candidateId_endpointId: {
      candidateId: input.candidateId,
      endpointId: input.endpointId,
    },
  };
  const existing = await tx.contactOptionAssessment.findUnique({
    where,
    select: { confirmedById: true },
  });
  if (existing?.confirmedById) return;
  const data = {
    status: "usable" as const,
    roleRelevance: input.roleRelevance,
    decisionAuthority: input.decisionAuthority,
    reason: input.reason,
    sourceUrl: input.sourceUrl,
    checkedAt: new Date(),
  };
  if (existing) {
    await tx.contactOptionAssessment.update({ where, data });
  } else {
    await tx.contactOptionAssessment.create({
      data: {
        ...data,
        candidateId: input.candidateId,
        endpointId: input.endpointId,
      },
    });
  }
}

async function saveLinkedinProfile(
  tx: Prisma.TransactionClient,
  input: {
    candidateId: string;
    company: CompanyIdentity;
    searchRunId: string;
    profile: LinkedinProfile & { profileUrl: string };
  },
): Promise<SavedContact> {
  const evidence = await tx.evidence.create({
    data: {
      companyId: input.company.id,
      searchRunId: input.searchRunId,
      url: input.profile.profileUrl,
      sourceKey: "OpenAI public web search",
      title: `LinkedIn: ${input.profile.name} — ${input.profile.title}`,
      excerpt: input.profile.quote,
    },
  });
  const where = {
    companyId_channel_address: {
      companyId: input.company.id,
      channel: "linkedin" as const,
      address: input.profile.profileUrl,
    },
  };
  const existing = await tx.contactEndpoint.findUnique({
    where,
    include: { contact: { select: { id: true, evidenceIds: true } } },
  });
  const contact =
    existing?.contact ??
    (await tx.contact.create({
      data: {
        companyId: input.company.id,
        name: input.profile.name,
        title: input.profile.title,
        role: input.profile.title,
        jobFunction: jobFunction(input.profile.title),
        seniority: isCLevel(input.profile.title) ? "c_level" : "manager",
        employmentStatus: "current",
        employmentCheckedAt: new Date(),
        evidenceIds: [evidence.id],
      },
    }));
  if (existing?.contact) {
    await tx.contact.update({
      where: { id: contact.id },
      data: {
        employmentStatus: "current",
        employmentCheckedAt: new Date(),
        evidenceIds: [...new Set([...contact.evidenceIds, evidence.id])],
      },
    });
  }
  const endpoint = existing
    ? await tx.contactEndpoint.update({
        where,
        data: {
          ...(existing.contactId ? {} : { contactId: contact.id }),
          evidenceIds: [...new Set([...existing.evidenceIds, evidence.id])],
          checkedAt: new Date(),
        },
      })
    : await tx.contactEndpoint.create({
        data: {
          companyId: input.company.id,
          contactId: contact.id,
          ownerType: "person",
          channel: "linkedin",
          address: input.profile.profileUrl,
          discoveryMethod: "public_source",
          ownershipStatus: "supported",
          validationStatus: "valid_format",
          reachabilityStatus: "unknown",
          linkedinMethods: ["connection_request"],
          evidenceIds: [evidence.id],
          checkedAt: new Date(),
        },
      });
  await upsertAssessment(tx, {
    candidateId: input.candidateId,
    endpointId: endpoint.id,
    roleRelevance: input.profile.title,
    decisionAuthority: isCLevel(input.profile.title) ? "supported" : "unknown",
    reason: "Publicly indexed LinkedIn profile with current company and title.",
    sourceUrl: input.profile.profileUrl,
  });
  return { endpointId: endpoint.id, evidenceId: evidence.id };
}

async function saveOfficialEmail(
  tx: Prisma.TransactionClient,
  input: {
    candidateId: string;
    company: CompanyIdentity;
    searchRunId: string;
    email: string;
    sourceUrl: string;
  },
): Promise<SavedContact> {
  const evidence = await tx.evidence.create({
    data: {
      companyId: input.company.id,
      searchRunId: input.searchRunId,
      url: input.sourceUrl,
      sourceKey: "Official company website",
      excerpt: input.email,
    },
  });
  const where = {
    companyId_channel_address: {
      companyId: input.company.id,
      channel: "email" as const,
      address: input.email,
    },
  };
  const existing = await tx.contactEndpoint.findUnique({ where });
  const endpoint = existing
    ? await tx.contactEndpoint.update({
        where,
        data: {
          evidenceIds: [...new Set([...existing.evidenceIds, evidence.id])],
          checkedAt: new Date(),
        },
      })
    : await tx.contactEndpoint.create({
        data: {
          companyId: input.company.id,
          ownerType: "company",
          channel: "email",
          address: input.email,
          discoveryMethod: "public_source",
          ownershipStatus: "supported",
          validationStatus: "valid_format",
          reachabilityStatus: "unknown",
          linkedinMethods: [],
          evidenceIds: [evidence.id],
          checkedAt: new Date(),
        },
      });
  await ensureCompanyMailboxContact(tx, input.company, endpoint.id);
  await upsertAssessment(tx, {
    candidateId: input.candidateId,
    endpointId: endpoint.id,
    roleRelevance: null,
    decisionAuthority: "unknown",
    reason: "Shared email published on the verified official company domain.",
    sourceUrl: input.sourceUrl,
  });
  return { endpointId: endpoint.id, evidenceId: evidence.id };
}

export async function executeContactResearchTask(
  taskId: string,
  runId: string,
) {
  const claimed = await claimContactResearchTask(taskId, runId);
  if (!claimed) return { ignored: true };
  const reporter = new LocalTaskReporter(taskId, "contact_research");
  try {
    const task = await prisma.researchTask.findUniqueOrThrow({
      where: { id: taskId },
      include: {
        searchRun: { select: { status: true } },
        candidate: { include: { company: true } },
      },
    });
    if (!task.candidate)
      throw new Error("Contact research task has no candidate.");
    if (
      task.searchRun.status === "cancelled" ||
      task.candidate.effectiveFit !== "fit"
    )
      return cancelContactResearchTask(task.id, task.candidate.id, runId);

    const company = task.candidate.company;
    const names = companyNames(company);
    const strategy = contactSearchStrategy(task.requestedInformation);
    const refs = savedRefs(task.resultRefs);
    let successfulWebSearches = 0;
    let profile: (LinkedinProfile & { profileUrl: string }) | undefined;

    try {
      const profileSearch = await runWebSearch(
        buildLinkedinSearch(company, strategy),
        {
          onComplete: (metric) =>
            reporter.captureAiCall("web_search:linkedin", metric),
        },
      );
      successfulWebSearches += 1;
      let extractedProfiles: LinkedinProfile[] = [];
      try {
        const extraction = await runStructuredOutput<{
          profiles: LinkedinProfile[];
        }>(
          [
            "Extract only LinkedIn profiles explicitly supported by the supplied public-web search response.",
            "Each quote must appear exactly in responseText and include the person's name, current title, and company name.",
            "Return no profile when a fact or profile URL is missing. Do not browse or infer.",
            JSON.stringify({
              companyNames: names,
              citedSourceUrls: profileSearch.sourceUrls,
              responseText: profileSearch.text,
            }),
          ].join("\n"),
          PROFILE_SCHEMA,
          {
            onComplete: (metric) =>
              reporter.captureAiCall("linkedin_profile_extraction", metric),
          },
        );
        extractedProfiles = extraction.value.profiles;
        profile = selectLinkedinProfile(
          extractedProfiles,
          profileSearch.sourceUrls,
          profileSearch.text,
          names,
        );
        refs.push({
          type: "source",
          sourceKey: "OpenAI LinkedIn profile extraction",
          status: "succeeded",
          foundCount: extractedProfiles.length,
          acceptedCount: profile ? 1 : 0,
          webSearchCallCount: 0,
          inputTokens: extraction.inputTokens,
          outputTokens: extraction.outputTokens,
        });
      } catch (error) {
        refs.push(failedSourceRef("OpenAI LinkedIn profile extraction", error));
      }
      refs.push(
        sourceRef(
          "OpenAI web search: LinkedIn profiles",
          profileSearch,
          profile ? 1 : 0,
        ),
      );
    } catch (error) {
      refs.push(failedSourceRef("OpenAI web search: LinkedIn profiles", error));
    }

    let email: string | null = null;
    let emailSourceUrl: string | null = null;
    const officialDomain =
      profile || strategy !== "executive"
        ? null
        : verifiedOfficialDomain(company);
    if (officialDomain) {
      try {
        const emailSearch = await runWebSearch(
          buildOfficialEmailSearch(company, officialDomain),
          {
            onComplete: (metric) =>
              reporter.captureAiCall("web_search:official_email", metric),
          },
        );
        successfulWebSearches += 1;
        const sourceUrl = selectOfficialSourceUrl(
          emailSearch.sourceUrls,
          officialDomain,
        );
        if (sourceUrl) {
          try {
            const page = await reporter.measure(
              "fetch_official_email_page",
              () => fetchOfficialPage(sourceUrl, names),
            );
            if (page.entityMatched) {
              email = selectPublishedOfficialEmail(page.text, officialDomain);
              if (email) emailSourceUrl = page.url;
            }
            refs.push({
              type: "source",
              sourceKey: "Cited official email page",
              status: "succeeded",
              foundCount: 1,
              acceptedCount: email ? 1 : 0,
            });
          } catch (error) {
            refs.push(failedSourceRef("Cited official email page", error));
          }
        }
        refs.push(
          sourceRef(
            "OpenAI web search: official email",
            emailSearch,
            email ? 1 : 0,
          ),
        );
      } catch (error) {
        refs.push(failedSourceRef("OpenAI web search: official email", error));
      }
    }

    if (!successfulWebSearches) {
      await prisma.researchTask.updateMany({
        where: { id: task.id, status: "running", jobId: runId },
        data: { resultRefs: refs as Prisma.InputJsonValue },
      });
      throw new Error("All OpenAI web-search calls failed.");
    }

    const result = await prisma.$transaction(async (tx) => {
      const running = await tx.researchTask.findUniqueOrThrow({
        where: { id: task.id },
        include: { candidate: true, searchRun: { select: { status: true } } },
      });
      if (
        !running.candidate ||
        running.status !== "running" ||
        running.jobId !== runId
      )
        return null;
      if (
        running.searchRun.status === "cancelled" ||
        running.candidate.effectiveFit !== "fit"
      ) {
        await tx.researchTask.update({
          where: { id: running.id },
          data: { status: "cancelled", finishedAt: new Date() },
        });
        await recomputeCandidateState(tx, running.candidate.id);
        return { cancelled: true };
      }

      const saved = profile
        ? await saveLinkedinProfile(tx, {
            candidateId: running.candidate.id,
            company,
            searchRunId: running.searchRunId,
            profile,
          })
        : email && emailSourceUrl
          ? await saveOfficialEmail(tx, {
              candidateId: running.candidate.id,
              company,
              searchRunId: running.searchRunId,
              email,
              sourceUrl: emailSourceUrl,
            })
          : null;
      await tx.researchTask.update({
        where: { id: running.id },
        data: {
          status: "succeeded",
          resultRefs: [
            ...refs,
            ...(saved
              ? [
                  { type: "contactEndpoint" as const, id: saved.endpointId },
                  { type: "evidence" as const, id: saved.evidenceId },
                ]
              : []),
          ] as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      await recomputeCandidateState(tx, running.candidate.id);
      return {
        endpointId: saved?.endpointId ?? null,
        usedLinkedin: Boolean(profile),
        usedOfficialEmail: Boolean(email && emailSourceUrl),
      };
    });

    const output = result ?? { ignored: true };
    reporter.finish("succeeded", output);
    return output;
  } catch (error) {
    reporter.finish("failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export async function markContactResearchFailed(
  taskId: string,
  message: string,
) {
  await prisma.researchTask.updateMany({
    where: { id: taskId, type: "contact_research", status: "running" },
    data: {
      status: "failed",
      errorCode: "SERVICE_UNAVAILABLE",
      errorMessage: message,
      errorRetryable: false,
      finishedAt: new Date(),
    },
  });
}

export async function queuedContactResearchTaskIds(limit = 50) {
  const tasks = await prisma.researchTask.findMany({
    where: { type: "contact_research", status: "queued" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return tasks.map((task) => task.id);
}
