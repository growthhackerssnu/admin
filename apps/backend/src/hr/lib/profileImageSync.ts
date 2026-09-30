// 프로필 사진 자동 동기화 — 신규 등록 + 교체.
//
// 흐름: 디렉토리 목록을 Notion에서 다시 만들 때(peopleCache.getPeopleList),
// 전원을 후보로 넘겨받아 "본문 첫 이미지 블록"을 확인해야 하는 사람만 골라 처리한다.
//   ① 사진 URL이 비어 있고 본문에 이미지가 있다 → Supabase Storage로 옮기고 그 URL을
//      Notion "Profile Image URL"에 써둔다(신규 학회원의 첫 사진).
//   ② 사진 URL이 비어 있고 본문에도 이미지가 없다 → 아직 사진을 안 찍은 신입. 아무것도
//      안 하고 목록엔 null로 남긴다(프론트가 기본 프로필을 그린다).
//   ③ 사진 URL이 이미 있고, 본문의 첫 이미지 블록이 지난번과 다르다 → 사진이 교체된 것.
//      다시 올리고 URL에 새 버전(?v=)을 붙인다.
//
// "확인 기록"(hr.people_cache의 "image-probe" 키, JSON이라 스키마 변경 없음)에는
// 사람별로 페이지 수정 시각·확인 시각·첫 이미지 블록의 id와 수정 시각을 남긴다.
// 사진 URL은 Notion이 조회 때마다 새로 서명해서 매번 달라지므로 비교에 쓸 수 없고,
// 그래서 "블록 id + 블록 수정 시각"으로 교체를 알아낸다.
//
// 사람마다 블록 조회가 필요해서(N+1) 매번 전원을 확인하면 안 된다. 다시 확인하는 경우:
//   - 확인 기록이 없다(처음. 이미 URL이 있는 사람은 이때 "기준선"만 기록하고 올리지
//     않는다 — 지금 사진을 현재 상태로 인정)
//   - Notion 페이지의 last_edited_time이 지난번과 다르다(본인이 사진을 올렸다면 바뀜)
//   - URL이 빈 사람에 한해, 마지막 확인이 RECHECK_AFTER_MS보다 오래됐다(안전망 —
//     Notion이 본문 수정을 페이지 수정 시각에 늦게 반영하는 경우 대비. URL이 있는
//     사람은 이 안전망을 안 쓴다: 전원을 매일 훑으면 Notion 호출 슬롯을 오래 잡아서
//     사용자 요청(승인 등)이 밀릴 수 있다)
//
// 응답을 느리게 만들지 않도록 목록 응답을 먼저 돌려준 뒤 백그라운드로 돌리고,
// 한 번에 처리하는 양을 제한한다(다 못 하면 다음 재구성 때 이어서).
import { prisma } from "@/lib/prisma";
import { memoryDelete } from "./memoryCache";
import { callNotionRateLimited, getNotionClient } from "./notion";
import {
  fetchFirstImage,
  getStorageAdminClient,
  PROFILE_IMAGE_PROPERTY,
  uploadProfileImage,
  type FirstImage,
} from "./profileImage";

export const PROBE_KEY = "image-probe";
const RECHECK_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_PROBES_PER_RUN = 15; // Notion 호출 슬롯(350ms 간격)을 오래 잡아 사용자 요청이 밀리지 않도록 작게 — 첫 배포 직후 기준선 기록은 여러 번에 나눠 끝난다
const MAX_UPLOADS_PER_RUN = 5;

export type ImageCandidate = {
  notionPageId: string;
  name: string;
  lastEditedTime: string;
  hasImageUrl: boolean;
};

export type ProbeRecord = {
  lastEditedTime: string; // 확인 당시 페이지 수정 시각
  checkedAt: number;
  hasImage: boolean; // 본문 첫 블록이 이미지였는가
  blockId?: string;
  blockEditedTime?: string;
  failed?: boolean;
};
type ProbeMap = Record<string, ProbeRecord>;

// 지금 이 사람의 첫 이미지 블록을 확인해야 하는가.
export function isProbeDue(c: ImageCandidate, record: ProbeRecord | undefined, now: number): boolean {
  if (!record) return true;
  if (record.lastEditedTime !== c.lastEditedTime) return true;
  // 안전망: URL이 비어 있는 사람, 그리고 지난 시도가 실패한 사람(교체 업로드 실패가
  // 다음 페이지 수정 때까지 영영 재시도 안 되는 걸 막는다).
  if ((!c.hasImageUrl || record.failed) && now - record.checkedAt > RECHECK_AFTER_MS) return true;
  return false;
}

export type ImageAction = "upload" | "record-only";

// 사진 일회성 이관(scripts/hr/migrateProfileImages.ts)을 한 날(2026-09-28 KST 0시).
// 확인 기록이 없는(기준선이 없는) 사람의 첫 이미지 블록이 이 시각 이후에 수정됐다면,
// 이관된 사진과 다른 사진일 가능성이 높다 — 기준선 기록만 하고 넘기면 그 사이에
// 일어난 교체를 놓치므로 이때는 올린다.
export const MIGRATION_CUTOFF = "2026-09-27T15:00:00.000Z";

// 확인해 보니 어떻게 할 것인가. 이미지가 없으면 호출하지 않는다("기록만").
export function decideImageAction(
  c: ImageCandidate,
  record: ProbeRecord | undefined,
  image: FirstImage,
): ImageAction {
  if (!c.hasImageUrl) return "upload"; // 신규 등록(URL 비어 있음)
  const hadBaseline = Boolean(record?.hasImage && record.blockId);
  if (!hadBaseline) {
    // 기준선이 없다: 이관 이후 수정된 블록이면 업로드, 아니면 기준선만 기록.
    return image.blockEditedTime >= MIGRATION_CUTOFF ? "upload" : "record-only";
  }
  const changed = record?.blockId !== image.blockId || record?.blockEditedTime !== image.blockEditedTime;
  return changed ? "upload" : "record-only";
}

let running = false;
let warnedNoStorageKey = false;

// 목록 응답 뒤에 호출한다. 기다리지 않는다(void) — 실패해도 목록엔 영향 없음.
export function scheduleProfileImageSync(candidates: ImageCandidate[]): void {
  if (candidates.length === 0 || running) return;
  running = true;
  void syncProfileImages(candidates)
    .catch((err) => console.error("[profile-image-sync] 실패", err))
    .finally(() => {
      running = false;
    });
}

async function syncProfileImages(candidates: ImageCandidate[]): Promise<void> {
  const row = await prisma.peopleCache.findUnique({ where: { key: PROBE_KEY } });
  const probes: ProbeMap = (row?.data as unknown as ProbeMap | undefined) ?? {};
  const now = Date.now();

  // 신규 등록(URL 없음)을 먼저 처리한다 — 교체·기준선 기록보다 급하다.
  const due = candidates
    .filter((c) => isProbeDue(c, probes[c.notionPageId], now))
    // 신규(URL 없음) 먼저, 그다음은 최근에 수정된 페이지부터(교체됐을 가능성이 더 높다).
    .sort(
      (a, b) =>
        Number(a.hasImageUrl) - Number(b.hasImageUrl) || b.lastEditedTime.localeCompare(a.lastEditedTime),
    )
    .slice(0, MAX_PROBES_PER_RUN);
  if (due.length === 0) return;

  const storage = getStorageAdminClient();
  const notion = getNotionClient();
  let uploads = 0;
  const changedPages: string[] = [];

  for (const c of due) {
    try {
      const image = await fetchFirstImage(c.notionPageId);
      const previous = probes[c.notionPageId];

      if (!image) {
        // 사진 없음 = 아직 촬영 전인 신입(또는 블록 삭제). 확인 사실만 기록.
        probes[c.notionPageId] = { lastEditedTime: c.lastEditedTime, checkedAt: Date.now(), hasImage: false };
        continue;
      }

      const action = decideImageAction(c, previous, image);
      const base: ProbeRecord = {
        lastEditedTime: c.lastEditedTime,
        checkedAt: Date.now(),
        hasImage: true,
        blockId: image.blockId,
        blockEditedTime: image.blockEditedTime,
      };

      if (action === "record-only") {
        probes[c.notionPageId] = base;
        continue;
      }

      if (!storage) {
        if (!warnedNoStorageKey) {
          warnedNoStorageKey = true;
          console.warn("[profile-image-sync] SUPABASE_SERVICE_ROLE_KEY가 없어 사진 업로드를 건너뜁니다.");
        }
        continue; // 기록하지 않는다 — 키가 생기면 바로 처리되도록
      }
      if (uploads >= MAX_UPLOADS_PER_RUN) continue; // 다음 재구성 때 이어서(기록 안 함)

      const { publicUrl, originalBytes, resizedBytes } = await uploadProfileImage(
        storage,
        c.notionPageId,
        image.url,
      );
      const updated = await callNotionRateLimited(() =>
        notion.pages.update({
          page_id: c.notionPageId,
          properties: { [PROFILE_IMAGE_PROPERTY]: { url: publicUrl } },
        }),
      );
      uploads++;
      changedPages.push(c.notionPageId);
      // 방금 우리가 속성을 써서 페이지 수정 시각이 바뀌었다. 응답의 새 수정 시각을
      // 기록해서, 다음 재구성 때 "수정됐네" 하고 헛되이 다시 확인하지 않게 한다.
      probes[c.notionPageId] = {
        ...base,
        lastEditedTime: "last_edited_time" in updated ? updated.last_edited_time : c.lastEditedTime,
      };
      console.log(
        `[profile-image-sync] ${c.name}: ${c.hasImageUrl ? "교체" : "신규"} ${(originalBytes / 1024).toFixed(0)}KB → ${(resizedBytes / 1024).toFixed(0)}KB`,
      );
    } catch (err) {
      // 실패한 사람은 (URL이 비어 있으면) 24시간 뒤, 또는 페이지가 수정되면 다시 시도한다.
      probes[c.notionPageId] = {
        ...probes[c.notionPageId],
        lastEditedTime: c.lastEditedTime,
        checkedAt: Date.now(),
        hasImage: true,
        failed: true,
      };
      console.error(`[profile-image-sync] ${c.name} 처리 실패`, err);
    }
  }

  await prisma.peopleCache.upsert({
    where: { key: PROBE_KEY },
    create: { key: PROBE_KEY, data: probes as unknown as object, fetchedAt: new Date() },
    update: { data: probes as unknown as object, fetchedAt: new Date() },
  });

  if (changedPages.length > 0) {
    // 새 URL이 다음 요청부터 보이도록 목록·개별 캐시를 비운다.
    const keys = ["list", ...changedPages];
    memoryDelete(...keys);
    await prisma.peopleCache.deleteMany({ where: { key: { in: keys } } });
  }
}
