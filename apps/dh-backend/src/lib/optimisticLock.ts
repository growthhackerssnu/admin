import { ApiError } from "./errors";

// UPDATE ... WHERE id = $1 AND version = $expected 패턴의 updateMany가 count=0을
// 반환했을 때, 행이 아예 없는 건지(NOT_FOUND) 버전이 어긋난 건지(VERSION_CONFLICT)
// 구분하기 위해 재조회 후 이 함수로 판정한다.
export function assertVersionMatch(
  current: { id: string; version: number } | null,
  expectedVersion: number,
): asserts current is { id: string; version: number } {
  if (!current) {
    throw new ApiError("NOT_FOUND", "대상을 찾을 수 없습니다.");
  }
  if (current.version !== expectedVersion) {
    throw new ApiError(
      "VERSION_CONFLICT",
      "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.",
      { retryable: false },
    );
  }
}

export function assertActiveCycle(currentCycleId: string, expectedActiveCycleId: string) {
  if (currentCycleId !== expectedActiveCycleId) {
    throw new ApiError(
      "ACTIVE_CYCLE_CHANGED",
      "차수가 바뀌었습니다. 현재 차수를 다시 확인해주세요.",
    );
  }
}
