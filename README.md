# admin

대협 어드민을 새로 구현하기 위한 업무 설계, 클릭 목업, 프론트·백엔드 구현입니다. PR #3의 자료를 유지하고 이전 서비스 구현은 제거했습니다. `apps/dh-frontend/`에 샘플 어댑터를 쓰는 프론트, `apps/dh-backend/`에 API 계약 구현이 진행 중입니다(조회 API 완료, 쓰기·비동기 작업은 진행 중). 프론트-백엔드 실 연결(liveRepository)은 아직입니다.

`admin.ghsnu.com` 통합 어드민 포털(대협봇 `/dh`, 그핵드인 `/hr`, 회원 관리 `/admin`)을 목표로 모노레포 구조로 운영합니다. `apps/hr-frontend`·`apps/hr-backend`는 아직 빈 자리표시자이며, `gateway/`가 도메인을 소유하고 경로별로 각 앱 배포로 리라이트합니다. 앱 간 공유 디자인 토큰은 `packages/ui-shell`에 있습니다. 각 앱은 독립된 Vercel 프로젝트로 배포됩니다.

- [백엔드 API 실행·구조 안내](apps/dh-backend/README.md)
- [프론트 개발 실행·구조 안내](apps/dh-frontend/README.md)
- [공유 UI 패키지](packages/ui-shell/README.md)
- [게이트웨이(도메인·리라이트)](gateway/README.md)
- [설계·정책·연동 제안](docs/admin/README.md)
- [목업 실행 안내](prototypes/admin/README.md)

## 목업 실행

Python 3가 있는 환경에서 저장소 루트에서 실행합니다.

```sh
python -m http.server 8765 --bind 127.0.0.1 --directory prototypes/admin
```

http://127.0.0.1:8765/ 에 접속합니다. CDN을 불러오므로 인터넷 연결이 필요합니다. 가상 데이터와 브라우저 저장을 사용하는 시연이며 실제 조사·발송·DB 연동은 없습니다.

## 새 구현의 기준

확정 업무 정책과 미정 사항을 구분해 읽어주세요. 문서의 API·필드명은 제안입니다. 프레임워크와 데이터 구조는 새 구현 담당자가 결정하며, 기존 Next.js·Prisma 모델을 재사용해야 하는 제약은 없습니다.

[과거 구현](https://github.com/growthhackerssnu/dhbot/tree/ecccb287947b9c266d74f02b356463dc03dc4c21)은 Git 이력에 남아 있습니다. 코드 제거는 실제 DB·외부 서비스·배포를 삭제하거나 중단하지 않습니다.
