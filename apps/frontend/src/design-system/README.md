# 대협봇 디자인 시스템 기초

## 사용

새 화면의 진입점에서 `@/design-system/globals.css`를 가져온다. 이 파일은 기존 Ant Design 화면에 자동 적용하지 않는다. 기본 컴포넌트는 `@/components/ui`에서 개별 파일을 가져온다. 컴포넌트를 추가할 때는 `apps/frontend`에서 `npx shadcn@latest add <component> --yes`를 실행한다.

개발 서버에서 `/design-system.html`을 열면 색상, 글씨 위계, 설치한 컴포넌트를 확인할 수 있다. 이 페이지는 작업용 미리보기이며 기본 앱 경로에 연결하지 않았다.

미리보기 왼쪽에는 설치된 shadcn Sidebar를 표시한다. `SidebarProvider`·`SidebarHeader`·`SidebarContent`·`SidebarMenu`·`SidebarInset`·`SidebarTrigger`를 조합하며 그핵드인·NUT·대협 링크와 대협 선택 상태를 보여준다. 상단 토글로 아이콘 접힘을 확인하고 좁은 화면에서는 Sheet로 연다. 메뉴 간격과 선택·hover 처리는 shadcn 기본 규칙과 sidebar 색상 토큰을 사용한다.

## 색상

- Brand/Action 기준: `#001136` (`--ds-brand-100`, shadcn `--primary`). 이미지의 브랜드 스케일은 `--ds-brand-0`부터 `--ds-brand-900`까지 기록했다. 숫자가 커질수록 밝아진다.
- 검토 화면의 승인 버튼은 `--ds-action-approval: #0042D1`을 사용한다. 다른 기본 Primary 버튼은 브랜드 컬러를 유지한다.
- `fit 부적합`처럼 명시적인 거절 행동은 `--ds-action-reject: #C52A2A`와 흰 글씨를 사용한다. 오류 표시용 원색 `--ds-danger`와 구분한다.
- Neutral: 푸른 회색 계열이다. Gray 100 `#F4F6FB`는 중립적인 강조 배경, Gray 200 `#E1E7F3`은 구분선, Gray 300은 입력 선, Gray 700–900은 보조·본문 글씨에 사용한다. 기본 작업 표면은 흰색이다.
- 검토 화면 표면: 목록 `--ds-surface-canvas: #F8FAFE`, 가운데 작업 영역과 기업 정보는 흰색, 선택 행 `--ds-surface-selected: #EEF3FF`를 사용한다. 선택 행 경계선은 `#C5D4F1`이다. 표면 색은 정보 영역을 구분하는 데 사용하고, 승인 행동은 `#0042D1`을 유지한다.
- 사이드바: 배경은 `--sidebar: #E1E7F3`, 선택·hover 메뉴 배경은 `--sidebar-accent: #F8FAFE`, 글씨·아이콘은 `#001136`이다. 선택은 shadcn 기본 굵기로 함께 구분한다. 작업 공간과 맞닿는 세로 경계선은 두지 않으며, 데스크톱과 모바일 Sidebar 모두 공통 컴포넌트에서 제거한다.
- Semantic 원색: success `#7EFF38`, danger `#FF3838`, warning `#F8FF38`, info `#3877FF`. 상태 의미는 화면 문맥에 따라 적용한다. 원색 위에 문자를 올릴 때는 어두운 글씨를 사용한다.
- `--background`, `--foreground`, `--primary` 등 shadcn/ui 토큰은 위 색상에 연결했다. Primary action에는 브랜드 컬러를 쓴다.

## 글씨

영문은 Open Sans Variable, 한글은 Noto Sans KR Variable이다. 순서대로 폰트 스택을 선언했으므로 브라우저가 문자의 글리프에 따라 대체한다. 두 폰트는 Fontsource 패키지로 자체 제공한다.

MDC에서 전달받은 크기는 `--ds-type-*` 토큰과 `.ds-*` 클래스로 정의했다. Headline 1–6은 96/60/48/34/24/20px, Body 1–2와 Subtitle 1–2는 16/14px, Button 14px, Overline 10px, Caption 12px이다. **굵기와 행간은 시작값**이며 화면을 만들면서 검토한다.

## 컴포넌트

공식 shadcn/ui CLI로 Button, Badge, Input, Textarea, Label, Separator, Select, Sidebar, Navigation Menu, Input Group, Field, Empty, Resizable, Skeleton, Spinner를 `src/components/ui`에 생성했다. Sidebar의 의존 컴포넌트인 Sheet·Tooltip과 목록 필터에 사용하는 Dropdown Menu도 설치되어 있다. 색상은 CSS 토큰을 통해 맞춘다. 이 파일들은 프로젝트 소유 코드이므로 필요할 때 직접 수정할 수 있다. 새 컴포넌트를 추가한 뒤에는 `npm run typecheck -w apps/frontend`로 누락된 의존성을 확인한다.

### 공용 컴포넌트가 관리하는 범위

| 위치 | 관리하는 내용 |
|---|---|
| `design-system/globals.css` | 색상·폰트·글자 크기·모서리의 기준 토큰. |
| `components/ui/button.tsx` | Button의 variant, 크기, 여백, 아이콘 배치, hover·focus·disabled·invalid 스타일. 기본 Button은 `--primary` 배경과 `--primary-foreground` 글씨를 사용한다. |
| `components/ui/button.css` | 기존 전역 form reset이 단색 버튼의 글자색을 덮지 않도록 default·destructive·secondary 글자색을 보장한다. 색상 값은 토큰을 참조한다. |
| 화면 컴포넌트·화면 CSS | 버튼의 위치, 표시 여부, 라벨, 동작, 비활성 조건과 승인 버튼 같은 명시적인 화면 예외. |

shadcn 컴포넌트는 일반 DOM과 CSS를 사용하므로 외부 스타일로부터 자동 격리되지 않는다. `className`이나 화면 CSS도 공용 스타일을 덮을 수 있다. 같은 종류의 버튼에 공통으로 필요한 수정은 `components/ui`에 적용하고, 화면 예외는 디자인 토큰을 참조하는 화면 범위의 규칙으로 기록한다. 데이터 저장·승인 같은 업무 동작은 Button에 저장되지 않으며 부모 화면의 이벤트 처리로 전달된다.

### 연락 업무 화면 적용

| 컴포넌트 | 적용 위치와 규칙 |
|---|---|
| Sidebar | 그핵드인(`/hr`)·NUT(`/nut`)·대협(`/dh`)을 오가는 앱 탐색. shadcn 기본 배치를 유지하며 `#E1E7F3` 배경, `#F8FAFE` 선택 메뉴, `#001136` 글씨·아이콘을 사용한다. 좁은 화면에서는 Sheet로 열린다. |
| ListFilter + Dropdown Menu | 기업 목록의 담당·상태 선택 메뉴. 클릭 또는 Enter·Space·방향키로 열고, 선택·Escape·바깥 클릭으로 닫는다. hover로 열리지 않는다. 메뉴 너비는 버튼 너비와 같으며 배경은 투명하고 윤곽선 없이 얕은 그림자로 구분한다. 실제 화면과 미리보기는 `components/ui/list-filter.tsx`·`list-filter.css`를 함께 사용한다. 버튼은 최소 96px이고 가장 긴 옵션에 맞춰 너비를 유지한다. |
| Input Group | 돋보기로 여는 기업명·설명 검색. |
| Field | 관계자 입력, 판단 메모, 메시지 제목·본문, 목표 분기. 라벨을 입력과 연결한다. |
| Empty | 관계자 정보가 없는 상태. 기본 아이콘·제목·행동 구성으로 보여주고, 추가를 누르면 Field 입력을 연다. |
| Badge | 기업 목록과 판단 결과의 상태 표시. 테두리·배경·글자는 중립색을 유지하고 작은 점에만 semantic 색을 사용한다. 이미 판단한 기업에서는 Empty 대신 배지와 판단 변경 행동을 바로 보여준다. |
| Resizable | 데스크톱의 목록·현재 작업·기업 정보 3칸. 가로로만 조절하고 폭에 하한을 둔다. 좁은 화면은 한 칸씩 표시한다. |
| Skeleton | React 검토 화면 첫 로딩 시 각 칸의 자리 표시. |
| Spinner | 저장·조사 진행 중 버튼과 상태 표시. |
| Button + Lucide | `workspace-icon-button.tsx`에서 햄버거, 검색, 좌우 칸 열기·닫기, 닫기 아이콘을 같은 크기·포커스 규칙으로 제공한다. |

관계자 입력 필드는 흰 배경, neutral 선, 낮은 그림자를 사용한다. `--ds-brand-100`을 제목·강조 텍스트의 기준색으로 사용한다. 관계자 입력 그룹에는 별도 카드 배경과 외곽선을 두지 않는다.

필수 입력은 `<FieldLabel required>`로 라벨 뒤에 `--destructive` 색상의 `*`를 표시하고, 연결된 입력에 `aria-required="true"`를 지정한다. 표시 컴포넌트는 검증 로직을 수행하지 않는다. 관계자 폼에서는 이름과 프로필 링크·이메일 주소에 적용한다. 직함은 선택이며 채널은 기본값이 있어 별도 필수 표시를 두지 않는다.

연락 업무 화면은 전역 사이드바의 ‘대협’ 선택으로 위치를 알려준다. 목록 위의 중복 제목은 두지 않는다. 본문·기업명은 14px, 상태·보조 정보는 12px을 기준으로 하고, 10–11px의 상시 노출 글씨는 피한다.

검토 화면에는 별도 전역 상단 바를 두지 않는다. 새로고침 버튼은 표시하지 않는다. 세 칸은 맨 위에서 시작하며, 왼쪽 목록의 66px 헤더에 햄버거 버튼을 둔다. 가운데·기업 정보 헤더의 하단 선과 같은 높이로 맞춘다. 목록을 닫은 상태에서는 가운데 헤더에 햄버거 버튼을 표시한다. 목록과 기업 정보의 내용·가로 구분선은 패널 가장자리에서 20px 안쪽을 기준으로 정렬한다.

가운데 칸의 제목·관계자 상태·입력 폼·판단 메모는 같은 가변 너비를 사용한다. 칸이 620px 이하로 좁아지면 관계자 입력을 한 열로 배치한다. 목록 필터도 목록 칸 자체가 320px 이하일 때 두 줄로 배치한다.

구현은 `src/dh/listup/review/UnifiedReviewPanel.tsx`와 `unified-review.css`에 있다. `/dh`는 인증된 앱의 React 검토 화면이며 현재 샘플 데이터를 사용한다. 기존 `/dh/listup` 주소는 `/dh`로 이동한다. `/review-workspace-dev.html?view=review`는 로그인 없이 같은 React 코드를 검사하는 로컬 개발 진입점이다. 정적 HTML 시안은 별도로 남아 있다. 실데이터 연결은 새 API 작업에서 진행한다.

이 단계에서는 기존 화면의 정보 구조나 업무 정책을 변경하지 않는다. 간격, 버튼 크기, 세부 컴포넌트 스타일은 실제 검토 화면을 적용하면서 고정한다.

`public/human-review-unified-workspace.html`은 이 토큰과 `unified-workspace.css`를 불러오는 정적 시안이다. 뉴트럴 표면을 중심으로 브랜드 컬러를 탐색·선택 상태에 쓰고, 승인 행동에 `--ds-action-approval`을 쓴다. 해당 HTML은 Vite 개발 서버에서 확인한다.
