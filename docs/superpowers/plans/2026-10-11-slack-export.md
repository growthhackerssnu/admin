# Slack export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/slack` page where admin/acting members export all their Slack messages into a local folder and browse them read-only.

**Architecture:** Browser calls `slack.com/api` directly with a user token from OAuth; backend only swaps the OAuth code and proxies file downloads. Data is written via the File System Access API; the viewer reads the same folder. Spec: `docs/superpowers/specs/2026-10-11-slack-export-design.md`.

**Tech Stack:** React 18 + Vite + antd (frontend), Next.js route handlers (backend), Vitest, `emojibase-data`.

## Global Constraints

- Token is never stored server-side or in browser storage; sent to `slack.com/api` as a form field.
- Backend routes go through `withApiHandler` (denies alumni).
- File proxy hosts: `files.slack.com`, `avatars.slack-edge.com`, `emoji.slack-edge.com`, `secure.gravatar.com`, https only.
- UI copy in Korean, matching existing pages.

---

### Task 1: Backend routes + Slack app manifest

**Files:** Create `apps/backend/app/api/v1/slack-export/oauth/route.ts`, `apps/backend/app/api/v1/slack-export/file/route.ts`, `apps/backend/src/slackExport/proxy.ts` (+ `proxy.test.ts`), `apps/backend/slack-app-export/manifest.json`; modify `apps/backend/.env.example`.

**Produces:** `POST /api/v1/slack-export/oauth {code, redirectUri}` → `{data:{token, teamId, teamName, userId}}`; `POST /api/v1/slack-export/file {url}` + `X-Slack-Token` → file bytes. `isAllowedFileUrl(url): boolean`, `isAllowedRedirect(uri): boolean`.

- [ ] Test: `isAllowedFileUrl` accepts the 4 hosts over https, rejects http, other hosts, `files.slack.com.evil.com`; `isAllowedRedirect` accepts the two callback URLs only.
- [ ] Implement, run `npx vitest run src/slackExport`, commit.

### Task 2: Nav key + routes + page shell

**Files:** Modify `packages/ui-shell/src/roleNav.ts`, `apps/frontend/src/main.tsx`; create `apps/frontend/src/slack/index.tsx`, `apps/frontend/src/slack/OAuthCallback.tsx`.

- [ ] Add `slack` AppKey (label `슬랙 백업`, path `/slack`) to admin/acting; add `/slack` (RequireApp) and `/slack/callback` routes. Typecheck, commit.

### Task 3: Slack client + folder + exporter (core, TDD)

**Files:** Create `apps/frontend/src/slack/slackClient.ts`, `folder.ts`, `exporter.ts`, `exporter.test.ts`, `types.ts`.

**Produces:**
- `createSlackClient(token, {fetch?, sleep?}) => { call(method, params): Promise<any>, paginate(method, params, key): AsyncGenerator<any[]> }` — 429 waits `Retry-After`; `ok:false` throws `SlackError(code)`.
- `Folder = { read(path): Promise<string|null>, write(path, data: string|Blob): Promise<void>, exists(path): Promise<boolean> }`; `fsFolder(handle)`, `memoryFolder()`.
- `runExport({client, folder, downloadFile, full?, onProgress, signal?}) => Promise<Manifest>`; `monthKey(ts)`; `mergeWindow(existing, fetched, oldestTs)`.

- [ ] Tests: first export writes users/conversations/month files with nested replies; resume skips `done`; re-sync uses `oldest = latestTs − 30d` and drops in-window deleted messages but keeps older; 429 retried after Retry-After; conversation error recorded and skipped; `invalid_auth` aborts with manifest saved.
- [ ] Implement, run `npx vitest run src/slack`, commit.

### Task 4: Export UI (sign-in popup, folder pick, progress)

**Files:** Create `apps/frontend/src/slack/SlackPage.tsx`, `oauth.ts`, `slack.css`.

- [ ] Popup OAuth with `state`; New export / Open export; Resume/Sync/Full re-sync; progress + error list. Typecheck, commit.

### Task 5: Viewer

**Files:** Create `apps/frontend/src/slack/viewer/{Viewer.tsx, MessageList.tsx, Message.tsx, ThreadPanel.tsx, SearchPanel.tsx, mrkdwn.tsx, mrkdwn.test.tsx, emoji.ts, useExport.ts}`.

- [ ] Test mrkdwn: bold/italic/strike/code/pre/quote/link/user/channel mentions, HTML entities.
- [ ] Sidebar, month-paged messages, thread panel, reactions, edited, files, jump-to-date, search. Typecheck + tests, commit.

### Task 6: Verify

- [ ] `npm run typecheck` + tests in both apps; frontend build; manual check in browser with dev server.
