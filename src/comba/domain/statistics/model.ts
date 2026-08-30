export interface PlayerStatistics {
  gamesLost: number;
  gamesPlayed: number;
  gamesWon: number;
  gameWinRate: number;
}

export enum GameOutcome {
  LOST = "LOST",
  WON = "WON",
}

export interface PlayerStats extends PlayerStatistics {
  relational?: RelationalStats;
}

export interface RelationalStats {
  bestTeammate: string | null;
  gamesPlayedTogether: number;
  nemesis: string | null;
  nemesisCount: number;
  victim: string | null;
  victimCount: number;
}

export interface LeaderboardEntry extends PlayerStatistics {
  playerId: string;
  relational?: RelationalStats;
}

export interface Leaderboard {
  biggestLossRatio: LeaderboardEntry | null;
  biggestWinRatio: LeaderboardEntry | null;
  mostGames: LeaderboardEntry | null;
  players: LeaderboardEntry[];
}

export interface HeadToHeadStatistics {
  gamesAgainst: number;
  playerAWins: number;
  playerAWinRate: number;
  playerBWins: number;
}

export interface TeammateStatistics {
  gamesLostTogether: number;
  gamesPlayedTogether: number;
  gamesWonTogether: number;
  winRateTogether: number;
}
