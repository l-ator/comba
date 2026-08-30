# Ċomba architecture

This is the technical deep dive for the Ċomba Slack app; see [`README.md`](../README.md) for the high-level picture.

## Runtime and ownership

Every invocation (a slash command or an interaction) is served by a Hono application running in a Cloudflare Worker. The Worker creates and disposes a request-scoped TSyringe container holding that invocation's `Env` and all required dependencies.

One `DoSessionRoom` CF Durable Object (DO), named by `workspaceId:channelId`, is authoritative for a channel's live lobby. It serializes joins, switches, bench actions, result submission, and expiry. 
A D1 database (CF's native SQLite) holds only completed games and participants; all derived statistics and historical edits query those immutable-history tables. Slack messages are projections — never authoritative state.

## How Slack invokes the app

Slack posts `application/x-www-form-urlencoded` payloads to two Worker routes (`src/worker/app.ts`):

- `POST /slack/commands` — slash commands (e.g. `/comba`, `/comba stats`, `/comba admin list sync`).
- `POST /slack/interactions` — block actions and modal submissions (join/switch/bench buttons, result-modal submit/amend).

All inbound requests paylods are sanitized (`Zod`) and authenticated (`X-Slack-Signature` header) by a shared middleware on `/slack/*`

## Outbound to the Slack API

The only Slack client is `HttpSlackClient` - wrapping the Slack Web API over `fetch`

- **Chat messages** — `postMessage` / `updateMessage` / `deleteMessage` manage user-bound projections (i.e. Lobby card)
- **Modals** — `openView` submits Block Kit modal views (i.e. recording/editing game results).
- **Ephemeral responses** — `sendEphemeralResponse` for message-origin feedback (e.g. "you are not a player").
- **Slack Lists** — implement native List projections (i.e. Leaderboard list widget).

## Cloudflare primitives (and how each is used)

- **Workers** — hosts the Hono HTTP app (commands + interactions)
- **Durable Objects** — Used for Session management
  - Actor model — Ensures concurrent operations are serialized (e.g., users joining a team at the same time).
  - Alarms — Handle time-bound triggers such as session expiry and reconciliation.
- **D1** — relational store for completed-game history and participants only (immutable-history oriented). Migrations live in `resources/migrations/`;
- **KV** — stores non-relational metadata for quick access (i.e. slack list ids)
- **Cron Trigger** — for scheduled recurring tasks (i.e. Orphaned sessions / leaderboard list reconciliation)

## Source boundaries

```text
src/
  worker/                          # Worker entry (index.ts/app.ts), Hono routes, request
                                   # verification, DI composition root, Env, hourly Cron
  comba/
    domain/                        # Session, result, and statistics rules/models
    application/                   # Use cases, ports, and presentation models
    infrastructure/
      cloudflare/                  # Cloudflare bindings with DO, D1, and KV adapters
      slack/                       # Slack Web API adapter
    presentation/slack/            # Commands, interactions, schemas, and Block Kit views
  shared/                          # Cross-cutting DI and observability utilities
resources/
  migrations/                      # D1 schema migrations
  slack/                           # Slack app manifests (dev + prod)
test/                              # Unit and Integration tests
```

Dependencies point inward:
- **Presentation** and **Infrastructure** depend on **Application** ports and **Domain** types;
- **Application** depends on **Domain** and its own ports;
- **Domain** has no adapter or worker dependencies.