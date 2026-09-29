/** @type {import('next').NextConfig} */
const nextConfig = {
  // API-only app: no pages/UI are served from this project.
  reactStrictMode: true,
  // @dhbot/auth는 빌드 산출물 없이 TypeScript 소스를 그대로 내보낸다
  // (packages/ui-shell과 같은 방식). node_modules 안의 TS는 Next.js가 기본적으로
  // 트랜스파일하지 않으므로 명시해야 한다.
  transpilePackages: ["@dhbot/auth"],
};

export default nextConfig;
