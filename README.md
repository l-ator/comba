# Ċomba

Ċomba is a small internal Slack app for organizing office table-football sessions and recording results. Its Slack bot is **Ċombot 🤖**.

The current system shape is documented in [`docs/architecture.md`](./docs/architecture.md); the Durable Object migration rationale is recorded in [`docs/decisions/001-durable-session-room.md`](./docs/decisions/001-durable-session-room.md).

## Proposed stack

- TypeScript
- Cloudflare Workers
- Cloudflare D1
- Cloudflare Cron Triggers
- Slack HTTP APIs and interactive Block Kit surfaces
- D1 SQL migrations and repository adapters
- Vitest

This stack is intended to remain within free allowances for a small internal office bot. Hosting and the Slack installation should ultimately use accounts approved by Tipico.

## Implemented flow

- `/comba` creates one five-minute lobby per channel.
- The creator starts in Team A.
- Signed Slack interactions support joining either team, leaving, and creator cancellation.
- The fourth player atomically transitions the session to READY.
- Durable Object alarms expire overdue lobbies and retry pending D1 archives.
- Participants can record or correct aggregate scores through a modal.
- `/comba stats [@user]` shows individual statistics.
- `/comba h2h @user` shows opponent and teammate performance.
- `/comba leaderboard` ranks every player by games won and shows fun aggregate stats.
- `/comba admin list sync` creates or refreshes a native sortable Slack leaderboard List for configured administrators.
- An hourly Cron Trigger reconciles configured leaderboard Lists.

## Local development

Prerequisites: Node.js and npm.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

The local health endpoint is `http://localhost:8787/health`. Slack credentials in `.dev.vars` are never committed.

Useful checks:

```bash
npm run typecheck
npm test
npm run check
```

`npm run check` runs fast unit tests followed by integration tests inside Cloudflare's Workers runtime with an isolated local D1 database.

## External configuration placeholders

Before deployment, replace these values:

- `database_id` in `wrangler.jsonc`, after creating the development D1 database.
- `COMBA_CHANNEL_ID` in `wrangler.jsonc` with the personal Slack test channel ID.
- `COMBA_ADMIN_USER_IDS` in `wrangler.jsonc` with comma-separated Slack administrator user IDs.
- `REPLACE_WITH_WORKER_URL` in `resources/slack/manifest-dev.yaml` with the deployed Worker hostname.
- `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN` through Wrangler secrets.

See [`docs/slack-setup.md`](./docs/slack-setup.md) for the complete sequence.

## Current status

The core lobby, timeout, result correction, statistics, leaderboard command, and native leaderboard List projection are implemented. History and App Home remain future slices.
