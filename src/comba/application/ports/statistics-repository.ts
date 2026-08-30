export interface PlayerStatisticsRecord {
  gamesLost: number;
  gamesPlayed: number;
  gamesWon: number;
}

export interface LeaderboardRecord extends PlayerStatisticsRecord {
  playerId: string;
}

export interface HeadToHeadRecord {
  gamesAgainst: number;
  playerAWins: number;
  playerBWins: number;
}

export interface TeammateRecord {
  gamesLostTogether: number;
  gamesPlayedTogether: number;
  gamesWonTogether: number;
}

export interface BestTeammateRecord {
  gamesPlayedNeedle: number;
  gamesWonWith: number;
  partnerId: string;
}

export interface HeadToHeadNeedleRecord {
  count: number;
  opponentId: string;
}

export interface GameOutcomeRecord {
  sessionId: string;
  gameIndex: number;
  won: boolean;
  completedAt: string;
}

export interface RelationalLeaderboardEntry {
  bestTeammate: BestTeammateRecord | null;
  nemesis: HeadToHeadNeedleRecord | null;
  playerId: string;
  victim: HeadToHeadNeedleRecord | null;
}

export interface StatisticsRepository {
  getLeaderboard(workspaceId: string): Promise<LeaderboardRecord[]>;
  getHeadToHead(
    workspaceId: string,
    playerAId: string,
    playerBId: string,
  ): Promise<HeadToHeadRecord>;
  getPlayerStatistics(
    workspaceId: string,
    playerId: string,
  ): Promise<PlayerStatisticsRecord>;
  getRelationalLeaderboard(
    workspaceId: string,
  ): Promise<RelationalLeaderboardEntry[]>;
  getRecentGames(
    workspaceId: string,
    playerId: string,
    limit: number,
  ): Promise<GameOutcomeRecord[]>;
  getTeammateStatistics(
    workspaceId: string,
    playerAId: string,
    playerBId: string,
  ): Promise<TeammateRecord>;
}
