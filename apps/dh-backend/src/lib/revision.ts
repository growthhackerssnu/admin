import { ApiError, type ErrorCodeName } from "./errors";

// UPDATE ... WHERE id = $1 AND <버전컬럼> = $expected 패턴의 updateMany가 count=0을
// 반환했을 때, 행이 아예 없는 건지(NOT_FOUND) 값이 어긋난 건지 구분하기 위해 재조회 후
// 이 함수로 판정한다.
//
// 계열마다 코드가 다르다(v0.4 §6.13). 조사 기록은 revision을 쓰고 REVISION_CONFLICT를,
// 컨택 건·기업은 version을 쓰고 VERSION_CONFLICT를 던진다. 클라이언트가 코드만 보고
// 어느 리소스를 다시 읽어야 하는지 알 수 있게 하려는 구분이다.
//
// 충돌 시 기대/현재 값을 구조화해 싣지 않는다 — v0.4 §12는 최신 상세를 다시 읽게 한다.
function assertMatch<T extends { id: string }>(
  current: T | null,
  actual: number | null | undefined,
  expected: number,
  code: ErrorCodeName,
): asserts current is T {
  if (!current) {
    throw new ApiError("NOT_FOUND", "대상을 찾을 수 없습니다.");
  }
  if (actual !== expected) {
    throw new ApiError(code, "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.");
  }
}

// 리스트업 조사 기록(Candidate.revision)용.
export function assertRevisionMatch<T extends { id: string }>(
  current: T | null,
  actualRevision: number | null | undefined,
  expectedRevision: number,
): asserts current is T {
  assertMatch(current, actualRevision, expectedRevision, "REVISION_CONFLICT");
}

// 발송 쪽 컨택 건·기업(version)용.
export function assertVersionMatch<T extends { id: string }>(
  current: T | null,
  actualVersion: number | null | undefined,
  expectedVersion: number,
): asserts current is T {
  assertMatch(current, actualVersion, expectedVersion, "VERSION_CONFLICT");
}

export function assertActiveQuarter(currentQuarterId: string, expectedQuarterId: string) {
  if (currentQuarterId !== expectedQuarterId) {
    throw new ApiError("INVALID_STATE", "이 컨택 건의 분기가 아닙니다. 최신 내용을 다시 확인해주세요.");
  }
}
