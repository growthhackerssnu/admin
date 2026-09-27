import type { ApiError } from "../errors";

// 리스트업 신규 경로의 응답 봉투(v0.4 §6.1). 기존 발송 경로와 **의도적으로 다르다** —
// §8.3이 "v0.1 응답 봉투와 기존 대협봇 응답 봉투를 표기법 변경에 편승해 통합하지
// 않는다"고 못박았다. 표기법 예외가 아니라 응답 구조의 호환 경계이고, 프론트 API
// 계층에서 정규화한다.
//
//   단건  { data }
//   목록  { data: [...], page: { nextCursor, hasMore } }
//   오류  { error: { code, message, details, requestId } }
//
// 차이 요약: 성공에 top-level requestId가 없고(오류 안에만 있다), 목록의 배열이
// data에 바로 있으며, 오류가 fieldErrors/retryable 대신 details를 싣는다.
//
// 오류 코드도 갈린다: 조사 계열의 낙관적 잠금 충돌은 REVISION_CONFLICT,
// 발송 계열은 VERSION_CONFLICT다(§6.13). 둘 다 errors.ts의 한 테이블에 있다.

export function successBody<T>(data: T) {
  return { data };
}

export function listBody<T>(items: T[], page: { nextCursor: string | null; hasMore: boolean }) {
  return { data: items, page };
}

export function errorBody(error: ApiError, requestId: string) {
  // 던지는 쪽이 fieldErrors로 줬으면 그대로 details에 싣는다. 리스트업 봉투에는
  // fieldErrors라는 자리가 없다.
  const details = error.details ?? error.fieldErrors;
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(details ? { details } : {}),
      requestId,
    },
  };
}
