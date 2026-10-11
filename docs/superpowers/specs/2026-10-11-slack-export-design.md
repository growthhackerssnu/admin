# Slack export (/slack) — design

## Goal

Any admin/acting GH member can back up every Slack message they can see — public channels, private
channels, DMs, group DMs, thread replies, files, avatars, custom emoji — into a folder on their own
computer, then browse it read-only in a Slack-like viewer on the same page. Alumni never see the page.

GH is on Slack Pro (built-in export = public channels only), so this uses a user token (`xoxp-`)
from a new internal Slack app.

## Decisions

| Topic | Decision |
|---|---|
| Token | "Sign in with Slack" (OAuth v2, user scopes). Backend swaps code → token, never stores it. Token lives in page memory only. |
| Where Slack calls run | Browser, directly against `slack.com/api` (verified: `Access-Control-Allow-Origin: *`; token must be sent as a form field, `Authorization` is not an allowed header). |
| Files | Downloaded through a backend proxy (verified: `files.slack.com` has no CORS). |
| Storage | File System Access API folder (Chromium browsers only). |
| Date range | None. Every export covers all history; later runs resume or sync new. |
| Access | New `slack` app key for admin/acting in `roleNav.ts`; backend routes use `withApiHandler`, which already denies alumni. |
| Viewer extras | Search, jump to date, reactions, "(edited)". |

## Slack app

New internal app `GH Export` — `apps/backend/slack-app-export/manifest.json`.

- User scopes only: `channels:history channels:read groups:history groups:read im:history im:read
  mpim:history mpim:read users:read files:read emoji:read`. No bot, no write scopes.
- Redirect URL: `https://admin.ghsnu.com/slack/callback` (+ `http://localhost:5173/slack/callback`).
- Internal app ⇒ Tier 3 limits (~50/min) for `conversations.history`/`replies`, not the
  1/min limit for non-Marketplace distributed apps.
- Backend env: `SLACK_EXPORT_CLIENT_ID`, `SLACK_EXPORT_CLIENT_SECRET`. Frontend env:
  `VITE_SLACK_EXPORT_CLIENT_ID`.

## Architecture

```
/slack (RequireApp app="slack")
 ├─ Sign in: popup → slack.com/oauth/v2/authorize?user_scope=…&state=…
 │            → /slack/callback (popup) postMessage({code,state}) to opener, closes
 │            → POST /api/v1/slack-export/oauth {code, redirectUri} → {token, teamId, userId}
 ├─ Exporter (browser): users.list, emoji.list, conversations.list(types=public_channel,
 │    private_channel,im,mpim) → per conversation: conversations.history → conversations.replies
 │    per thread → files/avatars/emoji via POST /api/v1/slack-export/file
 └─ Viewer (browser): reads the folder
```

A popup keeps the main page's folder handle and viewer state intact during sign-in. `state` is a
random value checked on return.

### Backend routes (`apps/backend/app/api/v1/slack-export/`)

- `oauth/route.ts` — `POST {code, redirectUri}`. `redirectUri` must be in an allowlist. Calls
  `oauth.v2.access`, returns `authed_user.access_token`, team id/name, user id. Never logs the token.
- `file/route.ts` — `POST {url}` with header `X-Slack-Token`. URL host must be `files.slack.com`
  or `avatars.slack-edge.com`/`emoji.slack-edge.com` (https only, else 400). Streams the body back
  with its content type. Token only forwarded to `files.slack.com`.

Both: `withApiHandler(..., { allow: () => true, message: "" })` — logged-in admin/acting only.

## Folder format

```
manifest.json        { version: 1, team: {id,name}, exportedBy, startedAt, finishedAt|null,
                       lastSyncTs, conversations: { [id]: { done, latestTs, error? } } }
users.json           raw users.list members
conversations.json   raw conversations.list items (+ members for mpim)
emoji.json           name → local path or alias
emoji/<name>.<ext>
avatars/<userId>.<ext>
messages/<convId>/<YYYY-MM>.json   raw messages, sorted by ts; parent.replies = [raw replies]
files/<fileId>/<name>
```

Message months use the message's `ts` in Asia/Seoul.

## Export / sync algorithm

1. Fetch users, emoji, conversations; write their files.
2. For each conversation not `done` in this run:
   - `oldest` = first export: none. Re-sync: `latestTs − 30 days`.
   - Page `conversations.history` (limit 200). For each parent with `reply_count`, fetch
     `conversations.replies` and nest them under the parent.
   - Merge into month files: replace by `ts`, keeping old messages outside the fetched window.
     Messages inside the window that no longer exist are dropped (deleted in Slack).
   - Download new files/avatars (skip existing paths).
   - Mark `done`, set `latestTs`, write manifest.
3. A run that finishes resets all `done` flags and sets `finishedAt`/`lastSyncTs`.

Resume: an unfinished run (`finishedAt` null) skips conversations already `done`; the interrupted one
restarts. Re-sync limit: a new reply on a thread older than 30 days is missed; "Full re-sync"
(oldest = none) covers it — marked with a `ponytail:` comment.

Rate limits: one serial request queue. On HTTP 429 wait `Retry-After` seconds and retry.

## Errors

- `invalid_auth`/`token_revoked`: stop, show "Sign in again". Progress is already saved.
- Per-conversation errors (`channel_not_found`, `missing_scope`, …): record in manifest, skip, list at end.
- File download failure: keep metadata; viewer shows "파일을 불러올 수 없음".
- Folder permission lost: ask to re-pick the folder.

## Page & viewer

States: no folder (New export / Open export) → viewer with header button (Resume export / Sync new /
Full re-sync) → progress panel during export (conversation N/M, messages, rate-limit wait).

Viewer (read-only):
- Sidebar: Channels / Private channels / DMs (incl. group DMs), sorted by latest activity; archived collapsed.
- Messages: day dividers, same author within 5 min grouped, mrkdwn rendered (bold, italic, strike,
  code, code blocks, quotes, links, `<@U>`, `<#C>`, `<!here>`), images inline, other files as cards,
  reactions (standard emoji via `emojibase-data`, custom from `emoji/`), "(edited)", "N replies" →
  thread panel. One month loaded at a time; scrolling up loads the previous month.
- Jump to date: `<input type="date">` in the channel header.
- Search: on open, all messages load into memory in the background; case-insensitive substring
  match, filter by conversation and person; click jumps to the message. Ceiling: memory ~ workspace
  size — marked `ponytail:`.

## Code layout

- `packages/ui-shell/src/roleNav.ts`: `slack` app key, label "슬랙 백업", path `/slack`, admin+acting.
- `apps/frontend/src/slack/`: `slackClient.ts` (queue + 429), `folder.ts` (FS Access read/write),
  `exporter.ts` (algorithm over injected client + folder), `mrkdwn.tsx`, `SlackPage.tsx`,
  `Viewer*.tsx`, `index.tsx`.
- `apps/frontend/src/main.tsx`: `/slack` and `/slack/callback` routes.
- `apps/backend/app/api/v1/slack-export/{oauth,file}/route.ts`, `apps/backend/slack-app-export/manifest.json`.

## Testing

- Vitest, exporter with a fake client + in-memory folder: resume skips `done`; re-sync uses
  30-day overlap and drops deleted messages in window; 429 waits `Retry-After`; failing
  conversation recorded and skipped.
- Vitest: mrkdwn rendering; file proxy rejects non-Slack hosts; oauth rejects unknown redirectUri.
- Manual: export our workspace with a real token and browse it.
