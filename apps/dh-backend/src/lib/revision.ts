import { ApiError } from "./errors";

// UPDATE ... WHERE id = $1 AND <revision컬럼> = $expected 패턴의 updateMany가 count=0을
// 반환했을 때, 행이 아예 없는 건지(NOT_FOUND) 값이 어긋난 건지(REVISION_CONFLICT)
// 구분하기 위해 재조회 후 이 함수로 판정한다.
//
// 리비전 컬럼 이름이 리소스마다 다르다(후보는 revision, 컨택 건은 version). 그래서
// 행과 값을 따로 받는다. details 형식은 명세 §7의 예시 그대로다.
export function assertRevisionMatch<T extends { id: string }>(
  current: T | null,
  actualRevision: number | null | undefined,
  expectedRevision: number,
): asserts current is T {
  if (!current) {
    throw new ApiError("NOT_FOUND", "대상을 찾을 수 없습니다.");
  }
  if (actualRevision !== expectedRevision) {
    throw new ApiError("REVISION_CONFLICT", "다른 곳에서 먼저 변경됐습니다. 최신 내용을 다시 확인해주세요.", {
      expected_revision: expectedRevision,
      current_revision: actualRevision ?? null,
    });
  }
}
