import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import {
  OpenSessionExistsError,
  SessionChannelNotAllowedError,
} from "@comba/application/session-errors";
import { SessionService } from "@comba/application/session-service";
import { errorDetails } from "@shared/observability/error-details";
import type {
  HeadToHeadStatistics,
  Leaderboard,
  PlayerStats,
  TeammateStatistics,
} from "@comba/domain/statistics/model";
import { StatisticsService } from "@comba/application/statistics-service";
import { LeaderboardListService } from "@comba/application/leaderboard-list-service";
import type { SlackClient, SlackMessageReference } from "./slack-client";
import type { CombaCommand } from "./schemas/command";
import { renderOpenLobby } from "./views/lobby";

@scoped(Lifecycle.ContainerScoped)
export class CombaCommandHandler {
  constructor(
    @inject(SessionService) private readonly sessionService: SessionService,
    @inject(StatisticsService)
    private readonly statisticsService: StatisticsService,
    @inject(TOKENS.slackClient) private readonly slackClient: SlackClient,
    @inject(LeaderboardListService)
    private readonly leaderboardLists: LeaderboardListService,
    @inject(TOKENS.adminUserIds)
    private readonly adminUserIds: Set<string>,
  ) {}

  async handle(command: CombaCommand): Promise<Response> {
    const subcommand = parseSubcommand(command.text);
    if (subcommand.type === "admin-list-sync") {
      if (!this.adminUserIds.has(command.user_id))
        return ephemeral(
          "Only a Ċomba administrator can synchronize the leaderboard List.",
        );
      const result = await this.leaderboardLists.sync(
        command.team_id,
        command.channel_id,
        command.channel_name,
      );
      return ephemeral(
        `${result.created ? "Created" : "Reused"} Ċomba Leaderboard ${result.listId}; wrote ${result.rows} rows at ${result.syncedAt}. Add/select the List in this channel's tabs if Slack does not show it automatically.`,
      );
    }
    if (subcommand.type === "leaderboard") {
      return ephemeral(
        renderLeaderboard(
          await this.statisticsService.getLeaderboard(command.team_id),
        ),
      );
    }
    if (subcommand.type === "stats") {
      const stats = await this.statisticsService.getPlayerStats(
        command.team_id,
        subcommand.playerId ?? command.user_id,
      );
      return ephemeral(
        renderPlayerStats(subcommand.playerId ?? command.user_id, stats),
      );
    }
    if (subcommand.type === "h2h") {
      const [playerAId, playerBId] =
        subcommand.playerIds.length === 1
          ? [command.user_id, subcommand.playerIds[0]]
          : subcommand.playerIds;
      if (playerAId === playerBId) {
        return ephemeral(
          "Choose two different players for a head-to-head comparison.",
        );
      }
      const [against, together] = await Promise.all([
        this.statisticsService.getHeadToHead(
          command.team_id,
          playerAId,
          playerBId,
        ),
        this.statisticsService.getTeammateStats(
          command.team_id,
          playerAId,
          playerBId,
        ),
      ]);
      return ephemeral(
        renderComparison(playerAId, playerBId, against, together),
      );
    }
    if (subcommand.type === "help") {
      return ephemeral(commandHelp());
    }

    let state;
    try {
      state = await this.sessionService.start({
        channelId: command.channel_id,
        creatorUserId: command.user_id,
        workspaceId: command.team_id,
      });
    } catch (error) {
      if (error instanceof SessionChannelNotAllowedError) {
        return ephemeral(
          `Ċomba games live in <#${this.sessionService.allowedChannelId}>. Start one there.`,
        );
      }
      if (error instanceof OpenSessionExistsError) {
        return ephemeral(error.message);
      }
      throw error;
    }

    let reference: SlackMessageReference | undefined;
    try {
      reference = await this.slackClient.postMessage(
        state.session.channelId,
        renderOpenLobby(state),
      );
      await this.sessionService.attachMessage(
        state.session.id,
        reference.timestamp,
        state.session.workspaceId,
        state.session.channelId,
      );
    } catch (error) {
      await this.cleanUpFailedPublication(
        state.session.id,
        state.session.workspaceId,
        state.session.channelId,
        reference,
      );
      console.error("Failed to publish Ċomba lobby", {
        error: errorDetails(error),
        sessionId: state.session.id,
        workspaceId: state.session.workspaceId,
      });
      return ephemeral("Ċomba couldn't create the lobby. Please try again.");
    }

    return new Response(null, { status: 200 });
  }

  private async cleanUpFailedPublication(
    sessionId: string,
    workspaceId: string,
    channelId: string,
    reference: SlackMessageReference | undefined,
  ): Promise<void> {
    if (reference) {
      try {
        await this.slackClient.deleteMessage(reference);
      } catch (error) {
        console.error("Failed to delete orphaned Ċomba message", {
          error: errorDetails(error),
          sessionId,
        });
      }
    }

    try {
      await this.sessionService.abandonUnpublished(
        sessionId,
        workspaceId,
        channelId,
      );
    } catch (error) {
      console.error("Failed to cancel unpublished Ċomba session", {
        error: errorDetails(error),
        sessionId,
      });
    }
  }
}

function ephemeral(text: string): Response {
  return Response.json({ response_type: "ephemeral", text });
}

type ParsedSubcommand =
  | { type: "h2h"; playerIds: [string] | [string, string] }
  | { playerId?: string; type: "stats" }
  | { type: "start" }
  | { type: "help" }
  | { type: "leaderboard" }
  | { type: "admin-list-sync" };

function parseSubcommand(text: string): ParsedSubcommand {
  const normalized = text.trim();
  if (normalized === "") {
    return { type: "start" };
  }

  const [name, ...arguments_] = normalized.split(/\s+/);
  if (name === "admin" && arguments_.join(" ") === "list sync")
    return { type: "admin-list-sync" };
  if (name === "leaderboard" && arguments_.length === 0) {
    return { type: "leaderboard" };
  }
  if (name === "stats" && arguments_.length <= 1) {
    const playerId = arguments_[0] ? slackMentionId(arguments_[0]) : undefined;
    return arguments_.length === 0 || playerId
      ? { ...(playerId ? { playerId } : {}), type: "stats" }
      : { type: "help" };
  }
  if (name === "h2h" && (arguments_.length === 1 || arguments_.length === 2)) {
    const playerIds = arguments_.map(slackMentionId);
    if (playerIds.every((playerId): playerId is string => playerId !== null)) {
      return {
        playerIds: playerIds as [string] | [string, string],
        type: "h2h",
      };
    }
  }

  return { type: "help" };
}

function slackMentionId(value: string): string | null {
  return /^<@([A-Z0-9]+)(?:\|[^>]+)?>$/.exec(value)?.[1] ?? null;
}

function renderPlayerStats(
  playerId: string,
  stats: PlayerStats,
): string {
  const lines = [
    `⚽ *<@${playerId}>*`,
    `Games: *${stats.gamesPlayed}* · Won: *${stats.gamesWon}* · Lost: *${stats.gamesLost}*`,
    `Game win rate: *${stats.gameWinRate.toFixed(1)}%*`,
  ];
  const rel = stats.relational;
  if (rel) {
    if (rel.bestTeammate) {
      lines.push(
        `🤝 Best teammate: <@${rel.bestTeammate}> (${rel.gamesPlayedTogether} games together)`,
      );
    }
    if (rel.nemesis) {
      lines.push(`😈 Nemesis: <@${rel.nemesis}> (lost ${rel.nemesisCount}×)`);
    }
    if (rel.victim) {
      lines.push(`🎯 Victim: <@${rel.victim}> (beaten ${rel.victimCount}×)`);
    }
  }
  return lines.join("\n");
}

function renderLeaderboard(leaderboard: Leaderboard): string {
  if (leaderboard.players.length === 0) {
    return "🏆 *Ċomba leaderboard*\nNo games have been recorded yet.";
  }
  const medals = ["🥇", "🥈", "🥉"];
  const rows = leaderboard.players.map(
    (player, index) =>
      `${medals[index] ?? `${index + 1}.`} <@${player.playerId}> — *${player.gamesPlayed}* played · *${player.gamesWon}* won · *${player.gamesLost}* lost`,
  );
  const fun = [
    leaderboard.biggestWinRatio
      ? `🔥 Best win ratio: <@${leaderboard.biggestWinRatio.playerId}> (${leaderboard.biggestWinRatio.gameWinRate.toFixed(1)}%)`
      : null,
    leaderboard.biggestLossRatio
      ? `🧊 Biggest loss ratio: <@${leaderboard.biggestLossRatio.playerId}> (${(100 - leaderboard.biggestLossRatio.gameWinRate).toFixed(1)}%)`
      : null,
    leaderboard.mostGames
      ? `🏃 Most games: <@${leaderboard.mostGames.playerId}> (${leaderboard.mostGames.gamesPlayed})`
      : null,
  ].filter((line): line is string => line !== null);
  return ["🏆 *Ċomba leaderboard*", ...rows, "", ...fun].join("\n");
}

function renderComparison(
  playerAId: string,
  playerBId: string,
  against: HeadToHeadStatistics,
  together: TeammateStatistics,
): string {
  return [
    `⚔️ *<@${playerAId}> vs <@${playerBId}>*`,
    `Games against: *${against.gamesAgainst}*`,
    `<@${playerAId}> wins: *${against.playerAWins}* · <@${playerBId}> wins: *${against.playerBWins}*`,
    `<@${playerAId}> win rate: *${against.playerAWinRate.toFixed(1)}%*`,
    "",
    `🤝 *As teammates*`,
    `Games: *${together.gamesPlayedTogether}* · Won: *${together.gamesWonTogether}* · Lost: *${together.gamesLostTogether}*`,
    `Win rate together: *${together.winRateTogether.toFixed(1)}%*`,
  ].join("\n");
}

function commandHelp(): string {
  return [
    "*Ċomba commands*",
    "`/comba` — start a lobby",
    "`/comba stats` — show your statistics",
    "`/comba stats @user` — show a player's statistics",
    "`/comba h2h @user` — compare yourself with a player",
    "`/comba h2h @user1 @user2` — compare two players",
    "`/comba leaderboard` — show the global leaderboard",
  ].join("\n");
}
