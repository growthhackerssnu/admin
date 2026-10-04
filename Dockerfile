# apps/backend(Next.js API) Cloud Run 이미지. 빌드는 .github/workflows/deploy-backend.yml이 한다.
# ponytail: devDependencies까지 든 단일 스테이지라 이미지가 크다. 콜드 스타트가
# 문제 되면 next standalone 출력 + 멀티 스테이지로 줄인다.
FROM node:24-slim
WORKDIR /app

# Prisma 엔진이 openssl을 찾는다.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1

# 의존성 레이어. backend postinstall이 schema.prisma로 Prisma Client를 생성한다.
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/auth/package.json packages/auth/
COPY packages/db/package.json packages/db/schema.prisma packages/db/
RUN npm ci -w apps/backend -w packages/auth --include-workspace-root

COPY packages/auth packages/auth
COPY apps/backend apps/backend
RUN npm run build -w apps/backend

ENV NODE_ENV=production
# Cloud Run이 PORT(기본 8080)를 넣어주고 next start가 그대로 쓴다.
CMD ["npm", "run", "start", "-w", "apps/backend"]
