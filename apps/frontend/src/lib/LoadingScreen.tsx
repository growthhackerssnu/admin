import "./loadingScreen.css";

// 그핵드인(hr)·회원 관리 화면의 로딩 화면: hr 배경색 위에 파란 점 세 개(로그인→index 로딩의
// 어두운 배경 + 연한 점의 반전). 화면 코드를 불러오는 단계(main.tsx의 RouteFallback)와 데이터를
// 불러오는 단계(각 화면)가 **같은 컴포넌트**를 써서, 단계가 넘어가도 모양이 바뀌지 않고 하나의
// 로딩처럼 이어진다.
//
// (2026-10-02) 한때 여기에 "첫 로딩은 오래 걸릴 수 있어요"·기능 팁을 띄우는 기능을 넣었다가
// 롤백했다 — 실제 배포 환경의 로딩이 충분히 빨랐고, 팁 내용 대부분이 이미 각 화면의 안내 문구
// (예: 직무 계열·학과 입력칸 아래 설명)에 있어서 중복이었기 때문이다.
export function LoadingScreen() {
  return (
    <div className="app-loading" role="status" aria-label="불러오는 중">
      <div className="app-loading-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
