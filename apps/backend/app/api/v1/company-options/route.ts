import { z } from "zod";
import { withListupApiHandler } from "@/dh/lib/listup/apiHandler";
import { requireExternalReader } from "@/dh/lib/humanReview/access";
import { ApiError } from "@/dh/lib/errors";
import { decodeSortCursor, encodeSortCursor, parseLimit } from "@/dh/lib/pagination";
import { prisma } from "@/lib/prisma";

const cursorShape = z.object({ k: z.string(), id: z.string().min(1) });

// 프로젝트를 등록할 때 고를 기존 기업 검색. 연락 이력 유무와 상관없이 Company 전체에서 찾고,
// 같은 이름의 기업을 합치지 않고 그대로 나열한다.
export const GET = withListupApiHandler(async (req, { member }) => {
  requireExternalReader(member);
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query")?.trim();
  if (!query) throw new ApiError("VALIDATION_ERROR", "query가 필요합니다.", { fieldErrors: { query: "1자 이상" } });
  // Prisma의 contains는 %와 _를 와일드카드로 그대로 쓴다. 사용자가 입력한 문자 그대로 찾도록 이스케이프한다.
  const escaped = query.replace(/[\\%_]/g, "\\$&");
  const limit = parseLimit(searchParams);
  const cursorRaw = searchParams.get("cursor");
  const cursor = cursorRaw ? decodeSortCursor(cursorRaw, cursorShape) : null;

  const rows = await prisma.company.findMany({
    where: {
      AND: [
        { OR: [{ name: { contains: escaped, mode: "insensitive" } }, { product: { contains: escaped, mode: "insensitive" } }] },
        ...(cursor ? [{ OR: [{ name: { gt: cursor.k } }, { name: cursor.k, id: { gt: cursor.id } }] }] : []),
      ],
    },
    select: { id: true, name: true, product: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    body: {
      data: page.map((company) => ({ id: company.id, name: company.name, description: company.product })),
      page: { nextCursor: hasMore && last ? encodeSortCursor({ k: last.name, id: last.id }) : null, hasMore },
    },
  };
});
