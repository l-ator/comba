# Implementation plan

## Phase 0 — approvals and ownership

1. Confirm Tipico's internal Slack-app approval route.
2. Confirm whether hosting may live in a personal Cloudflare account or must be company-owned.
3. Agree on the dedicated Slack channel and obtain its stable channel ID.
4. Create the private GitHub repository under the intended personal or company owner.

## Phase 1 — deployable foundation

1. Add TypeScript, Wrangler, linting, formatting, and Vitest.
2. Add environment binding validation and structured logging.
3. Add a health endpoint and a signed Slack request endpoint.
4. Create development and production configuration without committing secrets.

Exit criterion: a Worker can be tested locally and deployed, and invalid Slack signatures are rejected.

## Phase 2 — persistence and domain

1. Create D1 migrations for sessions, participants, and results.
2. Implement lifecycle invariants independently of Slack rendering.
3. Use explicit team positions and atomic database operations to resolve competing joins.
4. Cover session creation, duplicate joins, full teams, cancellation, and READY transition.

Exit criterion: database-backed tests prove that invalid membership states cannot be committed.

## Phase 3 — Slack lobby

1. Add `/comba` and channel restriction.
2. Render and post the initial lobby.
3. Implement join, leave, and creator cancellation.
4. Update one Slack message after every accepted transition.
5. Return ephemeral explanations for stale or rejected actions.

Exit criterion: four users can organize a session entirely from one Slack message.

## Phase 4 — expiration and reconciliation

1. Add a Cron Trigger that expires overdue open sessions.
2. Enforce the exact deadline inside all writes.
3. Track failed Slack projections and retry reconciliation.
4. Test repeated cron runs and deadline races.

Exit criterion: expiration survives restarts and duplicate workers.

## Phase 5 — results and history

1. Add result-entry and correction modals.
2. Validate non-negative integers and reject `0–0`.
3. Authorize all four participants to submit or edit.
4. Add recent/unresolved history and retrospective result entry.

Exit criterion: correcting a score changes the source-of-truth result safely.

## Phase 6 — statistics

1. Add individual totals and game win percentage.
2. Add session results and session-based streaks.
3. Add leaderboards with configurable participation thresholds.
4. Add opponent head-to-head and teammate statistics.

Exit criterion: fixtures and corrected results produce exact expected aggregates.

## Phase 7 — operational finish

1. Add a Slack app manifest with minimal scopes.
2. Document local development, Slack configuration, migrations, deployment, rollback, and secret rotation.
3. Add observability for transitions, rejections, expiry, and Slack API failures.
4. Add App Home only after the core interaction loop is stable.

