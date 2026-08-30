import type { LeaderboardEntry } from "@comba/domain/statistics/model";

export interface LeaderboardListColumns {
  record: string;
  player: string;
  rank: string;
  winRate: string;
  form: string;
  teammate: string;
  nemesis: string;
  victim: string;
}

export interface LeaderboardListDefinition {
  columns: LeaderboardListColumns;
  listId: string;
}

export interface LeaderboardListRow extends LeaderboardEntry {
  form: string;
  nemesis: string;
  rank: number;
  playerCount: number;
  record: string;
  teammate: string;
  victim: string;
}
export class LeaderboardListNotFoundError extends Error {
  constructor() {
    super("The configured Slack leaderboard List no longer exists.");
    this.name = "LeaderboardListNotFoundError";
  }
}

export interface LeaderboardListPort {
  create(name: string): Promise<LeaderboardListDefinition>;
  deleteRows(listId: string, rowIds: string[]): Promise<void>;
  grantChannelReadAccess(listId: string, channelId: string): Promise<void>;
  listRowIds(listId: string): Promise<string[]>;
  writeSnapshot(
    definition: LeaderboardListDefinition,
    rows: LeaderboardListRow[],
  ): Promise<void>;
}
