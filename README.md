# Ċomba

Ċomba is an internal Slack app for organizing office table-soccer (Ċomba) sessions and recording/displaying game outcomes.

The app is built in Typescript and runs in a Cloudflare native environment (workers).

## Implemented flow

#### Commands
- `/comba` creates a session within the channel - the creator automatically joins one of the teams.
  - Slack interactions allow other users to join. Once the lobby is full, the session transition to READY.
  - Once the game/s are played, participants input the results manually - results are stored for history and stats.
- `/comba stats [@user]` shows individual player statistics.
- `/comba h2h @user1 [@user2]` shows head-to-head player performance and comparisons.
- `/comba leaderboard` ranks every player by games won aggregate stats.

#### Views
- On every result submission, a Leaderboard _Slack List_ is generated. The list can be displayed in the related channel as an extra tab. 

## Local development

Prerequisites: 
- Node.js and npm.
- Cloudflare/Wrangler account
- Any slack workspace

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

The local health endpoint is `http://localhost:8787/health`. 
For most functionality, the app requires to be installed in a Slack workspace and wired up in config (`.dev.vars`)

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

CI and deployment behavior is documented in [`docs/deployment.md`](./docs/deployment.md).
