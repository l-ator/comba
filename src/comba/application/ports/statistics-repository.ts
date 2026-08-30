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
  getTeammateStatistics(
    workspaceId: string,
    playerAId: string,
    playerBId: string,
  ): Promise<TeammateRecord>;
}
