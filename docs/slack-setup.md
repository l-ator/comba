# Slack and Cloudflare setup

The application can be developed and tested locally without either account. Real Slack round trips require a stable HTTPS endpoint, so perform this setup when ready to deploy a Worker.

## Cloudflare infrastructure

Authenticate Wrangler:

```bash
npx wrangler login
```

Each deployed environment uses three Cloudflare resources:

- **D1 (`DB`)** stores archived sessions and statistics data.
- **KV (`LEADERBOARD_LIST`)** stores the Slack leaderboard List ID used for reconciliation.
- **Durable Objects (`SESSION_ROOMS`)** own live session state, expiry alarms, and pending archives. Wrangler creates the `SessionRoom` class storage when the Worker is first deployed with its migration.

Development and production use separate D1 databases, KV namespaces, Worker deployments, Durable Object storage, variables, and secrets.

### Development resources

Create the D1 database and KV namespace:

```bash
npx wrangler d1 create comba-dev
npx wrangler kv namespace create LEADERBOARD_LIST_DEV
```

Copy the returned IDs into the `env.dev` D1 and KV entries in `wrangler.jsonc`, then apply the D1 migration:

```bash
npm run db:migrate:dev
```

Set the dedicated personal Slack channel ID in `COMBA_CHANNEL_ID`. Slack channel IDs are stable values such as `C012ABCDEF`, not channel names.
Set `COMBA_ADMIN_USER_IDS` to the comma-separated Slack user IDs allowed to run hidden maintenance commands.

Deploy once to provision the development Worker and its `SessionRoom` Durable Object migration:

```bash
npm run deploy:dev
```

### Production resources

The production D1 database and KV namespace are already provisioned and referenced by `env.prod` in `wrangler.jsonc`. Apply the D1 migration before the first production deployment:

```bash
npm run db:migrate:prod
```

Set the production `COMBA_CHANNEL_ID` and `COMBA_ADMIN_USER_IDS` values before deploying. The first deployment provisions the production Worker and its separate `SessionRoom` Durable Object storage:

```bash
npm run deploy:prod
```

Production Slack credentials and the production Slack manifest are intentionally deferred until the production Slack app is ready.

## Development Slack app

After the initial development deployment, replace both `REPLACE_WITH_WORKER_URL` placeholders in `../resources/slack/manifest-dev.yaml` with the development Worker hostname.

At Slack's app management page, create an app from `../resources/slack/manifest-dev.yaml` in the personal test workspace.

The manifest configures:

- App name: **Ċomba**
- Bot display name: **Ċombot 🤖**
- Slash command: `/comba`
- Interactivity request URL
- Bot scopes: `commands`, `chat:write`, `lists:read`, `lists:write`

No event subscriptions, channel-history access, private-message access, email access, user token, or admin scope is required.

Reinstall or reauthorize the app after adding the Lists scopes. Slack currently documents Lists API access as a paid-workspace feature even when the Lists UI is visible; Ċomba preserves actionable errors such as `lists_disabled_user_team` so availability can be verified in the target workspace.

An allowlisted administrator can create or refresh the native leaderboard List with `/comba admin list sync`. If Slack does not expose the shared List as a channel tab automatically, add or select it manually from the channel header.

Install the app into the personal workspace and invite Ċombot to the dedicated channel:

```text
/invite @Ċombot
```

## Development Worker secrets

Copy the app's Signing Secret and Bot User OAuth Token from Slack, then store them as encrypted Worker secrets:

```bash
npx wrangler secret put SLACK_SIGNING_SECRET --env dev
npx wrangler secret put SLACK_BOT_TOKEN --env dev
```

Never put either value in `wrangler.jsonc`, `.dev.vars.example`, GitHub, logs, or documentation.

Deploy again after configuration changes:

```bash
npm run deploy:dev
```

## Smoke test

In the configured Slack channel:

```text
/comba
```

Expected behavior:

1. Ċombot posts one lobby message.
2. The creator appears in Team A.
3. Other workspace users can join or leave from buttons.
4. A fourth player changes the same message to READY.
5. A participant can record and correct how many games each team won.
6. `/comba stats` reflects the latest corrected games.
7. `/comba admin list sync` creates the sortable leaderboard List for an allowlisted administrator.

## Local-only development

Use `.dev.vars` for local Slack credentials and never commit it:

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Slack cannot reach `localhost` directly. Either deploy the development Worker or temporarily expose port 8787 through an HTTPS tunnel and update the two Slack request URLs.
