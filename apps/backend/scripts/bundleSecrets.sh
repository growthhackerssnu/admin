#!/bin/sh
# Secret Manager의 개별 시크릿들을 ADMIN_BACKEND_SECRETS({"이름": "값"} JSON) 하나로 묶는다.
# 값은 화면에 찍지 않고 gcloud끼리 파이프로만 넘긴다. 처음 한 번 옮길 때 쓴다(scripts/start.mjs 참고).
#
# 사용법: sh apps/backend/scripts/bundleSecrets.sh
set -eu

NAMES="DATABASE_URL DIRECT_URL GEMINI_API_KEY GHBOT_AUTH_SHARED_SECRET GHBOT_TOKEN_ENCRYPTION_KEY
INNGEST_EVENT_KEY INNGEST_SIGNING_KEY NOTION_API_KEY RESEND_API_KEY SLACK_EXPORT_CLIENT_SECRET
SLACK_GHEDIN_BOT_TOKEN SLACK_GHEDIN_SIGNING_SECRET SUPABASE_SERVICE_ROLE_KEY"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
for name in $NAMES; do
  gcloud secrets versions access latest --secret="$name" > "$TMP/$name"
done

python3 - "$TMP" $NAMES <<'PY' | gcloud secrets create ADMIN_BACKEND_SECRETS --replication-policy=automatic --data-file=-
import json, sys, pathlib
tmp, names = pathlib.Path(sys.argv[1]), sys.argv[2:]
sys.stdout.write(json.dumps({n: (tmp / n).read_text() for n in names}))
PY
echo "ADMIN_BACKEND_SECRETS: $(echo $NAMES | wc -w | tr -d ' ')개 묶음"
