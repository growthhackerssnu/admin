// 승인 큐(/hr/admin, ARCHITECTURE.md §12.4)의 승인/반려 처리. 승인만 Notion에
// 실제로 쓴다(§5 write-back 플로우) — 반려는 상태만 바꾸고 Notion은 안 건드림.
import type { Member } from "@/generated/prisma";
import { ApiError } from "./errors";
import { prisma } from "@/lib/prisma";
import { invalidateFieldOptions } from "./fieldOptions";
import { memoryDelete } from "./memoryCache";
import { callNotionRateLimited, getNotionClient } from "./notion";
import { recentUpdateLabel } from "./quarter";

// Notion "최근 업데이트"(select, "YY-NQ") — 승인할 때마다 승인 시각(KST) 기준 분기로
// 자동 세팅한다. 옵션이 아직 없으면 Notion이 이름으로 새로 만들어준다.
const RECENT_UPDATE_PROPERTY = "최근 업데이트";

const SECTION_HEADING: Record<string, string> = {
  careers: "Careers",
  activities: "Activities",
  projects: "Projects",
};

export async function approveEditRequest(admin: Member, editRequestId: string, reviewNote?: string) {
  const editRequest = await prisma.editRequest.findUnique({ where: { id: editRequestId } });
  if (!editRequest) throw new ApiError("NOT_FOUND", "수정 요청을 찾을 수 없습니다.");
  if (editRequest.status !== "pending") {
    throw new ApiError("VALIDATION_ERROR", "이미 처리된 요청입니다.");
  }

  const diff = editRequest.diff as unknown as {
    structuredFields: Record<string, { before: unknown; after: unknown }>;
    freeTextSections: Record<string, { before: unknown; after: unknown }>;
  };

  // 본문 섹션(블록)을 먼저 쓰고, 속성은 마지막에 한 번에 쓴다 — 속성 쓰기에
  // "최근 업데이트"가 항상 들어가므로, 본문 쓰기가 중간에 실패하면 "최근 업데이트"
  // 만 갱신된 어중간한 상태가 남지 않는다.
  for (const [key, entry] of Object.entries(diff.freeTextSections)) {
    const heading = SECTION_HEADING[key];
    if (!heading) continue; // 모르는 key는 조용히 무시(방어적으로만 — 서버가 만든 diff라 원래 없어야 함)
    await replaceSectionBlocks(editRequest.notionPageId, heading, entry.after as string);
  }
  await writeStructuredFields(editRequest.notionPageId, diff.structuredFields, new Date());

  // people_cache 무효화(§5) — list/개별 둘 다(DB + 서버 메모리). 다음 조회 때 새로
  // 채워진다. 새 옵션이 생겼을 수 있으니 옵션 목록 캐시도 같이 비운다.
  memoryDelete("list", editRequest.notionPageId);
  invalidateFieldOptions();
  await prisma.peopleCache.deleteMany({
    where: { key: { in: ["list", editRequest.notionPageId] } },
  });

  return prisma.editRequest.update({
    where: { id: editRequestId },
    data: { status: "approved", reviewedByMemberId: admin.id, reviewedAt: new Date(), reviewNote },
  });
}

export async function rejectEditRequest(admin: Member, editRequestId: string, reviewNote: string) {
  const editRequest = await prisma.editRequest.findUnique({ where: { id: editRequestId } });
  if (!editRequest) throw new ApiError("NOT_FOUND", "수정 요청을 찾을 수 없습니다.");
  if (editRequest.status !== "pending") {
    throw new ApiError("VALIDATION_ERROR", "이미 처리된 요청입니다.");
  }

  return prisma.editRequest.update({
    where: { id: editRequestId },
    data: { status: "rejected", reviewedByMemberId: admin.id, reviewedAt: new Date(), reviewNote },
  });
}

const PROPERTY_NAME_TO_TYPE: Record<string, "email" | "url" | "rich_text" | "select" | "multi_select"> = {
  이메일: "email",
  LinkedIn: "url",
  "현재 커리어": "rich_text",
  기수: "select",
  "직무 계열": "multi_select", // 2026-09-30: select → multi_select로 변경됨
  학과: "multi_select",
  소속팀: "multi_select",
};

async function writeStructuredFields(
  notionPageId: string,
  structuredFields: Record<string, { before: unknown; after: unknown }>,
  approvedAt: Date,
) {
  const entries = Object.entries(structuredFields);

  const notion = getNotionClient();
  const properties: Record<string, unknown> = {
    // 어떤 변경이든 승인되면 항상 갱신(구조화 필드가 하나도 없고 본문만 바뀐 요청 포함).
    [RECENT_UPDATE_PROPERTY]: { select: { name: recentUpdateLabel(approvedAt) } },
  };

  for (const [key, { after }] of entries) {
    const type = PROPERTY_NAME_TO_TYPE[key];
    if (!type) continue; // 모르는 key는 무시(서버가 만든 diff라 원래 없어야 함)

    switch (type) {
      case "email":
        properties[key] = { email: after };
        break;
      case "url":
        properties[key] = { url: after };
        break;
      case "rich_text":
        properties[key] = { rich_text: after ? [{ text: { content: String(after) } }] : [] };
        break;
      case "select":
        // 기수는 숫자로 diff에 들어있지만 Notion select는 문자열 옵션이다.
        properties[key] = { select: after == null ? null : { name: String(after) } };
        break;
      case "multi_select": {
        // 직무 계열이 단일 값이던 시절에 제출된 대기 요청은 after가 문자열/null일 수
        // 있어서 배열로 맞춘다.
        const names = Array.isArray(after) ? (after as string[]) : after ? [String(after)] : [];
        properties[key] = { multi_select: names.map((name) => ({ name })) };
        break;
      }
    }
  }

  // Notion SDK의 update properties 타입은 각 속성 타입별로 엄격한 유니온이라,
  // key마다 다른 타입을 런타임에 조립하는 이 함수 구조와는 구조적으로 안
  // 맞다(사람이 수기로 매핑하지 않는 이상). 위 switch가 이미 각 타입에 맞는
  // 모양으로 만들어뒀으므로 여기서만 캐스팅한다.
  await callNotionRateLimited(() =>
    notion.pages.update({
      page_id: notionPageId,
      properties: properties as Parameters<typeof notion.pages.update>[0]["properties"],
    }),
  );
}

// heading_1(섹션 제목) 아래 기존 블록을 전부 지우고, newText(줄바꿈으로 구분,
// "- " 접두사는 bulleted_list_item, 그 외는 paragraph)로 다시 채운다 —
// peopleCache.ts의 fetchSections/blockToLine과 정확히 반대 방향 변환이다
// (DB_SCHEMA_HR.md §2.1 "불릿 표기 컨벤션" 참고, 같은 규칙을 반드시 유지).
async function replaceSectionBlocks(pageId: string, heading: string, newText: string) {
  const notion = getNotionClient();

  const headingBlockId = await findHeadingBlockId(pageId, heading);
  if (!headingBlockId) {
    // 이 heading 자체가 없는 페이지는 지금 데이터에 없는 것으로 확인됐다
    // (§12.2 전수 조사) — 있어야 할 게 없으면 조용히 넘어가지 않고 명확히 실패시킨다.
    throw new ApiError("INTERNAL_ERROR", `"${heading}" 섹션을 찾을 수 없습니다.`);
  }

  const oldChildIds = await collectSectionBlockIds(pageId, heading);
  for (const blockId of oldChildIds) {
    await callNotionRateLimited(() => notion.blocks.delete({ block_id: blockId }));
  }

  const newBlocks = newText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => lineToBlock(line));

  if (newBlocks.length === 0) return;
  await callNotionRateLimited(() =>
    notion.blocks.children.append({ block_id: pageId, after: headingBlockId, children: newBlocks }),
  );
}

function lineToBlock(line: string) {
  if (line.startsWith("- ")) {
    return {
      type: "bulleted_list_item" as const,
      bulleted_list_item: { rich_text: [{ text: { content: line.slice(2) } }] },
    };
  }
  return {
    type: "paragraph" as const,
    paragraph: { rich_text: [{ text: { content: line } }] },
  };
}

async function findHeadingBlockId(pageId: string, heading: string): Promise<string | null> {
  const notion = getNotionClient();
  let cursor: string | undefined;
  do {
    const page = await callNotionRateLimited(() =>
      notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 }),
    );
    for (const block of page.results) {
      if (!("type" in block) || block.type !== "heading_1") continue;
      const text = (block as { heading_1: { rich_text: Array<{ plain_text?: string }> } }).heading_1.rich_text
        .map((t) => t.plain_text ?? "")
        .join("");
      if (text === heading) return block.id;
    }
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return null;
}

// heading 블록 자신은 포함하지 않고, 그 바로 다음 heading_1(또는 끝)까지의
// 블록 id만 모은다 — fetchSections(peopleCache.ts)와 같은 섹션 경계 규칙.
async function collectSectionBlockIds(pageId: string, heading: string): Promise<string[]> {
  const notion = getNotionClient();
  const ids: string[] = [];
  let inSection = false;

  let cursor: string | undefined;
  do {
    const page = await callNotionRateLimited(() =>
      notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 }),
    );
    for (const block of page.results) {
      if (!("type" in block)) continue;
      if (block.type === "heading_1") {
        const text = (block as { heading_1: { rich_text: Array<{ plain_text?: string }> } }).heading_1.rich_text
          .map((t) => t.plain_text ?? "")
          .join("");
        inSection = text === heading;
        continue;
      }
      if (inSection) ids.push(block.id);
    }
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return ids;
}
