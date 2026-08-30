# Ċomba architecture

## Runtime and ownership

Slack sends signed commands, block actions, and modal submissions to a Hono application in a Cloudflare Worker. Every invocation creates and disposes a TSyringe child container containing that invocation's `Env`, bindings, clients, repositories, services, and handlers. Only the Worker/composition boundary resolves from the container; application code uses constructor injection.

One `DoSessionRoom` Durable Object, named by `workspaceId:channelId`, is authoritative for the channel's live lobby. It serializes joins, switches, bench actions, result submission, and expiry. Its alarm expires live state and retries its archive outbox.

D1 contains completed games and participants only. Statistics, head-to-head comparisons, leaderboards, and historical result edits query these immutable-history-oriented tables. Initial result submission snapshots the live session into the DO outbox and immediately frees the channel; historical edits use D1 after archival. An edit that arrives while archival is pending updates the outbox snapshot instead.

Slack messages are projections. Every accepted join or bench action updates the original lobby message. Expired lobby projections are retained in a Durable Object outbox and retried by its alarm after transient Slack failures. Result amendments are announced in that message's thread and mention every participant.

The native Slack leaderboard List is another projection of the existing application leaderboard query. Result flows attempt an immediate full snapshot replacement, while an hourly Cron Trigger reconciles every configured List after transient failures.

## Source boundaries

```text
src/
  worker/                          Worker entry point and DI composition root
  comba/
    domain/                        Session, result, and statistics rules/models
    application/                   Use cases, ports, and presentation models
    infrastructure/
      cloudflare/                  Cloudflare bindings with D1 and DO adapters
      slack/                       Slack Web API adapters
    presentation/slack/            Commands, interactions, schemas, and views
  shared/                          Cross-cutting DI and observability utilities
resources/migrations/              D1 schema migrations
test/                              Unit and Cloudflare integration tests
```

Dependencies point inward: presentation and infrastructure depend on application ports and domain types; application depends on domain and its own ports; domain has no adapter or Worker dependencies. `worker/container.ts` is the HTTP invocation composition root. The Durable Object constructor is a second Cloudflare-managed composition boundary for its alarm/outbox collaborators.

## Behavioral rules

- A channel has at most one live session.
- Teams A and B each have two stable positions.
- Users may switch directly into an available position on the other team.
- `Bench me` removes the caller; a non-player receives an ephemeral response.
- Benching the creator ends the lobby; there is no explicit cancel interaction.
- Only participants may submit or amend results.
- A session holds at most ten individual games; `0–0` is invalid.
- Statistics count individual games only. A session is merely their container.
