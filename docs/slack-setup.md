# Personal Slack and Cloudflare setup

The application can be developed and tested locally without either account. Real Slack round trips require a stable HTTPS endpoint, so perform this setup when ready to deploy the development Worker.

## 1. Cloudflare account

Authenticate Wrangler:

```bash
npx wrangler login
```

Create the development D1 database:

```bash
npx wrangler d1 create comba-dev
```

Copy the returned database ID into the `database_id` placeholder in `wrangler.jsonc`, then apply migrations remotely:

```bash
npm run db:migrate:dev
```

Set the dedicated personal Slack channel ID in `COMBA_CHANNEL_ID`. Slack channel IDs are stable values such as `C012ABCDEF`, not channel names.

## 2. Initial Worker deployment

Deploy once to obtain the public Worker URL:

```bash
npm run deploy:dev
```

Replace both `REPLACE_WITH_WORKER_URL` placeholders in `../resources/slack/manifest.yaml` with that hostname.

## 3. Personal Slack app

At Slack's app management page, create an app from `../resources/slack/manifest.yaml` in the personal test workspace.

The manifest configures:

- App name: **Ċomba**
- Bot display name: **Ċombot 🤖**
- Slash command: `/comba`
- Interactivity request URL
- Bot scopes: `commands`, `chat:write`

No event subscriptions, channel-history access, private-message access, email access, user token, or admin scope is required.

Install the app into the personal workspace and invite Ċombot to the dedicated channel:

```text
/invite @Ċombot
```

## 4. Worker secrets

Copy the app's Signing Secret and Bot User OAuth Token from Slack, then store them as encrypted Worker secrets:

```bash
npx wrangler secret put SLACK_SIGNING_SECRET
npx wrangler secret put SLACK_BOT_TOKEN
```

Never put either value in `wrangler.jsonc`, `.dev.vars.example`, GitHub, logs, or documentation.

Deploy again after configuration changes:

```bash
npm run deploy:dev
```

## Prod environment

Prod has separate D1, Slack channel, Worker secrets, and Slack app placeholders under `env.prod` in `wrangler.jsonc`. Create the prod database and replace its ID and channel ID before running:

```bash
npm run db:migrate:prod
npm run deploy:prod
npx wrangler secret put SLACK_SIGNING_SECRET --env prod
npx wrangler secret put SLACK_BOT_TOKEN --env prod
npm run deploy:prod
```

Create the prod Slack app from `../resources/slack/manifest.prod.yaml` after replacing `REPLACE_WITH_PROD_WORKER_URL`. Development and prod credentials are intentionally independent.

## 5. Smoke test

In the configured Slack channel:

```text
/comba
```

Expected behavior:

1. Ċombot posts one lobby message.
2. The creator appears in Team A.
3. Other workspace users can join or leave from buttons.
4. A fourth player changes the same message to READY.
5. A participant can record and correct the aggregate result.
6. `/comba stats` reflects the latest corrected score.

## Local-only development

Use `.dev.vars` for local Slack credentials and never commit it:

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Slack cannot reach `localhost` directly. Either deploy the development Worker or temporarily expose port 8787 through an HTTPS tunnel and update the two Slack request URLs.
