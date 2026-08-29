# Ċomba

Ċomba is a small internal Slack app for organizing office table-football sessions and recording results. Its Slack bot is **Ċombot 🤖**.

The product requirements live in [`comba.md`](./comba.md). The initial technical direction and delivery plan live in [`docs/architecture.md`](./docs/architecture.md) and [`docs/implementation-plan.md`](./docs/implementation-plan.md).

## Proposed stack

- TypeScript
- Cloudflare Workers
- Cloudflare D1
- Cloudflare Cron Triggers
- Slack HTTP APIs and interactive Block Kit surfaces
- Drizzle ORM and migrations
- Vitest

This stack is intended to remain within free allowances for a small internal office bot. Hosting and the Slack installation should ultimately use accounts approved by Tipico.

## Status

Planning and repository setup. No Slack credentials or deployable application code have been added yet.

