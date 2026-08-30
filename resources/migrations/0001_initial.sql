CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_ts TEXT,
  format_json TEXT NOT NULL CHECK (json_valid(format_json)),
  teams_json TEXT NOT NULL CHECK (json_valid(teams_json)),
  game_scores TEXT NOT NULL CHECK (
    json_valid(game_scores)
    AND json_type(game_scores) = 'array'
  ),
  created_at TEXT NOT NULL,
  ready_at TEXT,
  completed_at TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX sessions_workspace_completed
  ON sessions (workspace_id, completed_at DESC);
