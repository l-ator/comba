export interface PlayerStatistics {
  gamesLost: number;
  gamesPlayed: number;
  gamesWon: number;
  gameWinRate: number;
}

export interface LeaderboardEntry extends PlayerStatistics {
  playerId: string;
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
