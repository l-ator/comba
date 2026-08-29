# Initial architecture

## Product identities

- Slack app: **Ċomba**
- Bot display name: **Ċombot 🤖**
- Package and internal identifiers: ASCII names such as `comba` and `combot`

## Runtime

Slack sends slash commands, button actions, and modal submissions to a Cloudflare Worker over HTTPS. The Worker validates every Slack signature before dispatching to a thin transport handler.

Cloudflare D1 is authoritative. Slack messages are projections of database state and may be repaired after transient Slack API failures. A Cron Trigger finds overdue open sessions and marks them expired. Every interaction also enforces `expires_at`, so the cron schedule is not an authorization boundary.

## Planned source tree

```text
src/
  index.ts                   Worker entry point and routing
  config.ts                  Typed environment bindings
  slack/
    verify-request.ts        Slack signature and replay validation
    commands/comba.ts        /comba command parsing
    actions/lobby.ts         Join, leave, and cancel actions
    actions/results.ts       Result modal actions
    views/lobby.ts           Block Kit lobby rendering
    views/result-modal.ts    Result entry/edit modal
    client.ts                Small Slack Web API client
  domain/
    sessions/service.ts      Session lifecycle and invariants
    results/service.ts       Submission, editing, and authorization
    statistics/service.ts    Historical aggregate queries
    errors.ts                Transport-independent domain failures
  persistence/
    schema.ts                Drizzle/D1 schema
    sessions.ts              Transactional session repository
    results.ts               Result repository
    statistics.ts            Read-only statistics queries
  jobs/
    expire-sessions.ts       Durable timeout sweep
    reconcile-messages.ts    Repair Slack views after API failures
migrations/                  D1 SQL migrations
test/
  domain/                    Fast business-rule tests
  persistence/               D1-backed constraint/concurrency tests
  slack/                     Signed request and interaction tests
docs/                        Architecture, decisions, and setup
```

The exact files will be introduced incrementally; directories are not created merely to make the repository look complete.

## Initial data model

### sessions

- `id`
- `workspace_id`
- `channel_id`
- `message_ts`
- `creator_user_id`
- `status`: `OPEN`, `READY`, `COMPLETED`, `CANCELLED`, `EXPIRED`
- `created_at`, `expires_at`, `ready_at`, `completed_at`
- message reconciliation metadata

### session_participants

- `session_id`
- `workspace_id`
- `user_id`
- `team`: `A` or `B`
- `position`: `1` or `2`
- `joined_at`

Unique constraints prevent duplicate participants and duplicate team positions. Assigning explicit positions makes team capacity enforceable by the database, including under concurrent clicks.

### results

- `session_id` (unique)
- `team_a_wins`, `team_b_wins`
- `submitted_by`, `updated_by`
- `created_at`, `updated_at`

Statistics are derived from these historical rows. Results can therefore be corrected without compensating player counters.

## Slack surface

- `/comba`: start a lobby in the configured channel
- Message actions: join Team A, join Team B, leave, cancel
- Result modal: record or correct the aggregate score
- `/comba history`: recent and unresolved sessions
- `/comba stats [@user]`
- `/comba h2h @user`
- `/comba leaderboard`

The app is installed at workspace level but v1 is restricted in application code to one configured channel. Ċombot is invited to that channel and does not request channel-history access.

## Important defaults

- Creator leaving cancels an open lobby.
- Only participants may submit or edit a result.
- Ties are valid; `0–0` is invalid.
- `READY` means four finalized participants and no result; no separate persisted `AWAITING_RESULT` state is needed.
- Official sessions-played statistics count completed sessions only.
- Streaks are session-based because aggregate scores cannot reconstruct game ordering.

