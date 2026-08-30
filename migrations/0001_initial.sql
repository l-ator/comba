CREATE TABLE games (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_ts TEXT,
  format_json TEXT NOT NULL CHECK (json_valid(format_json)),
  teams_json TEXT NOT NULL CHECK (json_valid(teams_json)),
  scores_json TEXT NOT NULL CHECK (json_valid(scores_json)),
  created_at TEXT NOT NULL,
  ready_at TEXT,
  completed_at TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX games_workspace_completed
  ON games (workspace_id, completed_at DESC);

CREATE TABLE game_participants (
  game_id TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  team_id TEXT NOT NULL CHECK (team_id IN ('A', 'B')),
  player_order INTEGER NOT NULL CHECK (player_order >= 0),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (game_id, user_id),
  UNIQUE (game_id, team_id, player_order)
);

CREATE INDEX game_participant_history
  ON game_participants (workspace_id, user_id, game_id);
