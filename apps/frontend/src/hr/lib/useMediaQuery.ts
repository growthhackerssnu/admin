import { useEffect, useState } from "react";

// hr 화면의 반응형 기준. theme.css의 @media와 같은 값을 쓴다.
//  - COMPACT: 태블릿 이하(≤999px) — 왼쪽 레일이 사라지고 필터는 서랍으로, 공용 side pane은 위쪽 바로
//  - PHONE:   휴대폰(≤599px) — 제목·입력 크기를 줄이고 폼 버튼을 가득 채움
export const COMPACT_QUERY = "(max-width: 999px)";
export const PHONE_QUERY = "(max-width: 599px)";

// 화면 폭이 조건에 맞는지 알려주는 훅. 첫 렌더부터 실제 값을 쓴다(처음에 데스크톱
// 레이아웃이 잠깐 번쩍이는 걸 막으려고 useState 초기값에서 바로 계산).
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
