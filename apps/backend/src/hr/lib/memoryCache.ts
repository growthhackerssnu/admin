// hr.people_cache(DB)의 앞단에 두는 "서버 프로세스 메모리" 캐시.
//
// 왜: DB 캐시를 읽는 것도 서버→DB 왕복 1번이다. API 서버(Railway)와 DB
// (Supabase 서울)가 멀면 이 왕복만 수백 ms라, 자주 읽는 목록은 서버 메모리에서
// 바로 준다. TTL은 DB 캐시와 같은 5분 — 그래서 "최대 5분 늦게 반영"이라는
// 기존 약속은 그대로다. (Railway 서비스가 1개 인스턴스라는 전제. 여러 개로
// 늘리면 인스턴스마다 따로 갖게 되므로, 그땐 이 계층을 다시 봐야 한다.)
//
// singleFlight: 캐시가 막 만료된 순간 여러 요청이 동시에 오면 전부 Notion을
// 다시 부르는 낭비(그리고 Notion 속도 제한 압박)가 생긴다. 같은 키의 재구성이
// 이미 진행 중이면 그 결과를 같이 기다린다.
export const CACHE_TTL_MS = 5 * 60 * 1000;

type Entry = { data: unknown; fetchedAt: number };
const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export function memoryGet<T>(key: string, ttlMs = CACHE_TTL_MS): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt >= ttlMs) return null;
  return entry.data as T;
}

export function memorySet(key: string, data: unknown, fetchedAt = Date.now()): void {
  store.set(key, { data, fetchedAt });
}

export function memoryDelete(...keys: string[]): void {
  for (const key of keys) store.delete(key);
}

export async function singleFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = run().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}
