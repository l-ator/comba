import type { LeaderboardListDefinition } from "./leaderboard-list";

export interface StoredLeaderboardList extends LeaderboardListDefinition {
  channelId: string;
  createdAt: string;
  lastSyncedAt: string | null;
  workspaceId: string;
}

export interface LeaderboardListRepository {
  find(
    workspaceId: string,
    channelId: string,
  ): Promise<StoredLeaderboardList | null>;
  listAll(): Promise<StoredLeaderboardList[]>;
  save(value: StoredLeaderboardList): Promise<void>;
  markSynced(workspaceId: string, channelId: string, at: string): Promise<void>;
}
