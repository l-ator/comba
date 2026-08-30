# Ċomba business rules

The domain and behavioral rules that govern Ċomba sessions, results, and statistics. These are the invariants application and domain code enforce; see [`architecture.md`](./architecture.md) for how they are implemented.

## Sessions and teams

- A channel may have at most **one live session** at a time. 
- A session is considered live until completed (score submitted) or canceled/expired
- A session will expire after a configurable amount of time, if the required number of players is not met.
- 2v2 table soccer is the hardcoded format today - teams (A & B) each have two fixed player slots.
  - _this might change in the future with the introduction of different game formats_

## Resulting

- **Only participants** may submit or amend results after the session is completed.
- A session may hold  **at most 10 individual games** 
- Aggregates are entered through the result modal and can be edited in case of required correction
  - corrections are announced in the lobby message's thread and mention every participant to prevent sneaky edits.