# @dhbot/db — DB 구조의 원본

`admin.ghsnu.com`의 세 앱(portal·dh·hr)이 공유하는 Supabase Postgres의 **스키마와 마이그레이션을 소유하는 패키지**입니다. 앱이 import하는 코드는 없습니다 — 개발자가 마이그레이션을 만들고 적용할 때만 쓰는 도구 패키지입니다.

**작업 전에 [DB 공유 규칙](../../docs/db/conventions.md)을 반드시 읽어주세요.** 어느 테이블이 어느 앱 소유이고, 테이블을 추가·변경할 때 어떤 절차를 밟는지가 거기 있습니다.

## 왜 앱 밖에 있나

이전에는 `apps/dh-backend/prisma/`가 DB 전체 구조를 갖고 있었습니다. 그래서 hr 담당자가 자기 테이블 하나를 추가하려면 dh 앱의 스키마 파일을 열어야 했습니다. 구조를 중립 지대로 빼서, 각 앱이 남의 앱 파일을 건드리지 않게 했습니다.

| | `packages/db` (여기) | 각 앱의 `prisma/` |
|---|---|---|
| 역할 | 물리 스키마의 원본 | "내가 쓰는 테이블 목록" |
| 실행하는 명령 | `migrate dev` / `migrate deploy` | `prisma generate`만 |
| 마이그레이션 파일 | 있음 | **없음** |

**앱 디렉토리에서 `prisma migrate`를 실행하지 마세요.** 앱 스키마는 DB 전체를 모르기 때문에, Prisma가 자기가 모르는 테이블을 "지워야 할 것"으로 판단해서 DB를 망가뜨립니다.

## 설정

```sh
cp .env.example .env.local   # 값은 각 백엔드의 .env.local과 같은 Supabase 프로젝트
npm install
```

## 명령

| 명령 | 용도 |
|---|---|
| `npm run db:status` | 어디까지 적용됐는지 확인 |
| `npm run db:migrate` | 새 마이그레이션 생성·적용. **로컬 리허설 전용** |
| `npm run db:deploy` | 기존 마이그레이션만 적용. **운영은 이것만** |
| `npm run db:validate` | 스키마 문법 검증 (DB 연결 불필요) |

`db:migrate`(= `migrate dev`)는 drift를 감지하면 DB를 초기화하려 듭니다. 운영 DB에는 절대 쓰지 마세요.

## 운영 DB를 바꾸기 전에

개발용 Supabase 프로젝트가 따로 없습니다(무료 플랜 한도). 즉 **운영 DB가 유일한 DB입니다.** 위험한 마이그레이션은 이 순서로 합니다.

1. `pg_dump`로 백업을 받는다
2. 로컬 Postgres에 복원해서 `db:migrate`로 리허설한다
3. 검증되면 운영에 `db:deploy`로만 적용한다

자세한 절차는 [conventions.md §12](../../docs/db/conventions.md)에 있습니다.

## Prisma가 모르는 것

RLS 정책, 뷰, 함수, 부분 유니크 인덱스는 Prisma 스키마 문법으로 표현할 수 없습니다. `prisma migrate dev --create-only`로 빈 마이그레이션을 만든 뒤 SQL을 직접 써넣으세요.

**대시보드에서 손으로 만들지 마세요.** 마이그레이션 파일에 안 남아서 DB를 다시 만들면 조용히 사라집니다.
