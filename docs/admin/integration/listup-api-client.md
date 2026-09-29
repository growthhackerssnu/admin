# 리스트업 API 연결

## 완료 범위

프론트 `src/listup/api`를 `LiveRoot`·`LiveWorkspace`에 연결했다. `/listup.html`은 Supabase 로그인 후 실제 API를 사용하며 기존 샘플 화면은 `?preview=1`로 분리했다. 로그인 토큰은 매 요청 세션에서 읽고 DB 비밀 정보는 백엔드에만 둔다.

- 후보 목록(필터·커서), 후보 상세·조사 근거, 적합성 이력, 조사된 연락처, 목표 분기 조회
- 컨택 상세와 발송 가능한 관계자 조회
- 컨택 시작, 수신자·채널 선택, 명시적 메시지 생성, 초안 저장·승인, 수신자·초안 재검토
- 두 목록 응답 형식 정규화, 인증·권한·템플릿·근거 부족 등 서버 오류 보존
- 매 요청 최신 세션 토큰 조회, AbortSignal, 요청 ID·필드 오류 보존
- 쓰기 작업별 멱등 키 필수. 자동 재시도 없음. 네트워크 실패 후 같은 논리 요청을 재시도할 때 같은 키와 같은 본문을 재사용

## 화면에 연결하는 방법

```ts
import { configureListupApi } from "./api/configure";
import { newOperationKey } from "./api/client";

const api = configureListupApi(async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
});
const page = await api.listCandidates({ limit: 20 });
const candidate = page.items[0];
if (!candidate) return;
const operation = { idempotencyKey: newOperationKey() };
const outreach = await api.startOutreach(candidate.id, candidate.revision, operation);
// 다음 변경에는 응답 outreach.version을 사용하고 새 operation key를 생성한다.
```

`supabase`는 실제 로그인 구성에서 제공할 클라이언트다. 위 예시는 실행 진입점이 아니다. VITE_API_BASE_URL에는 실제 백엔드 origin 또는 /api/v1까지 포함한 URL을 설정한다. 키·토큰은 저장소나 URL에 넣지 않는다.

## 화면 연결 시 지켜야 할 사항

1. candidate.id, company.id, outreach.id를 따로 보존한다. 임의로 같은 ID로 변환하지 않는다.
2. 연락처는 endpointId별로 유지한다. 같은 사람의 여러 메일·LinkedIn 경로를 덮어쓰지 않는다. 공용 메일은 person이 null일 수 있다.
3. 수신자 선택은 컨택용 목록의 selectable·excludedReason과 endpoint.valid를 표시해 사용한다.
4. 초안 편집은 subject/body뿐 아니라 서버 topic, draft.revision과 outreach.version을 함께 보낸다.
5. 요청 중 버튼을 잠그고 성공 응답으로만 화면 상태를 갱신한다. 실패 시 입력을 유지한다.
6. VERSION_CONFLICT/REVISION_CONFLICT는 최신 상세를 다시 조회하고 사용자가 재검토하게 한다. 최신 버전으로 자동 덮어쓰기하지 않는다.
7. 후보·연락처 목록의 hasMore/nextCursor를 처리한다. 페이지 이동·다른 대상 선택 시 이전 조회를 취소한다.
8. 부적합·템플릿 없음·근거 부족 등은 서버 오류를 표시한다. 샘플 생성으로 대체하지 않는다.

## 로컬 검증 및 남은 작업

2026-09-29 기준 원격 main과 백엔드·공유 DB·인증 코드가 동일함을 확인했다. 로컬 백엔드 실행, 공유 DB 읽기, 미인증 API의 401과 CORS preflight 응답을 확인했다. 실제 계정 로그인 후 후보 3건, 조사 상세, 컨택 목록 8건, 핀브릿지의 저장된 초안과 수신자·채널을 브라우저에서 확인했다. 표시된 자료에는 DB에 미리 들어 있던 시드 데이터가 포함된다. 프론트의 로컬 샘플로 대체한 결과가 아니다. 프론트 타입 검사·35개 테스트·배포 빌드가 통과했다. 쓰기 흐름의 실데이터 변경 검증은 남아 있다. 백엔드 AI 키가 없어 생성 성공은 아직 검증하지 않았다. 새 탐색 설정·접수(POST /search-runs), 탐색 내역(GET /search-runs), 탐색별 후보 조회를 연결했다. 목표 분기와 소스는 서버에서 조회하고, 접수 상태를 조사 완료로 표시하지 않는다. 작업 실행기·AI 키가 있어야 실제 수집이 진행된다. 실제 탐색 접수로 DB 작업을 생성하는 검증은 수행하지 않았다. 발송 완료 저장과 템플릿 정책 수정은 이번 연결 범위에 포함하지 않았다. 이번 연결 자체로 추가 Freeze 변경은 없다.
