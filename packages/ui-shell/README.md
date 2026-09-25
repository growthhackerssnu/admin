# @dhbot/ui-shell

admin.ghsnu.com 산하 여러 앱(대협봇, hr 등)이 공유하는 디자인 토큰·테마 패키지입니다. 빌드 없이 TypeScript 소스를 그대로 내보내며, 각 앱의 번들러(Vite 등)가 직접 트랜스파일합니다.

- `tokens`: 색상·폰트·간격 등 원시 토큰 값
- `theme`: Ant Design `ThemeConfig`
- `installTokens()`: 토큰 값을 CSS 변수(`--color-*`, `--space-*` 등)로 문서 루트에 주입
- `src/app.css`: 위 CSS 변수를 쓰는 공통 리셋 + 레이아웃 유틸리티 클래스(`.row`, `.surface`, `.stack`, `.actions`, `.auth-page`/`.auth-card` 등). 각 앱의 `main.tsx`에서 `import "@dhbot/ui-shell/src/app.css"`로 가져다 쓴다
