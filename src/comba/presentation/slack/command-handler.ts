import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import {
  OpenSessionExistsError,
  SessionChannelNotAllowedError,
  SessionNotFoundError,
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
import type { SlackMessageView } from "./views/types";
import {
  cardContext,
  cardHeader,
  cardSection,
  cardView,
  divider,
} from "./views/cards";

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
      return ephemeral(adminListSyncView(result));
    }
    if (subcommand.type === "admin-abort") {
      if (!this.adminUserIds.has(command.user_id))
        return ephemeral(
          "Only a Ċomba administrator can abort a running session.",
        );
      try {
        await this.sessionService.abortActive(
          command.team_id,
          command.channel_id,
        );
      } catch (error) {
        if (error instanceof SessionNotFoundError) {
          return ephemeral(error.message);
        }
        throw error;
      }
      return ephemeral("Cancelled the running Ċomba in this channel.");
    }
    if (subcommand.type === "leaderboard") {
      return ephemeral(
        renderLeaderboard(
          await this.statisticsService.getLeaderboard(command.team_id),
        ),
      );
    }
    if (subcommand.type === "stats") {
      const playerId = subcommand.playerId ?? command.user_id;
      const stats = await this.statisticsService.getPlayerStats(
        command.team_id,
        playerId,
      );
      return ephemeral(renderPlayerStats(playerId, stats));
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
      return ephemeral(renderComparison(playerAId, playerBId, against, together));
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

function ephemeral(message: SlackMessageView | string): Response {
  if (typeof message === "string") {
    return Response.json({ response_type: "ephemeral", text: message });
  }
  return Response.json({
    blocks: message.blocks,
    response_type: "ephemeral",
    text: message.text,
  });
}

type ParsedSubcommand =
  | { type: "h2h"; playerIds: [string] | [string, string] }
  | { playerId?: string; type: "stats" }
  | { type: "start" }
  | { type: "help" }
  | { type: "leaderboard" }
  | { type: "admin-abort" }
  | { type: "admin-list-sync" };

function parseSubcommand(text: string): ParsedSubcommand {
  const normalized = text.trim();
  if (normalized === "") {
    return { type: "start" };
  }

  const [name, ...arguments_] = normalized.split(/\s+/);
  if (name === "admin" && arguments_.join(" ") === "list sync")
    return { type: "admin-list-sync" };
  if (
    name === "admin" &&
    (arguments_.join(" ") === "cancel" || arguments_.join(" ") === "abort")
  ) {
    return { type: "admin-abort" };
  }
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

interface LeaderboardListSyncOutcome {
  created: boolean;
  listId: string;
  rows: number;
  syncedAt: string;
}

function adminListSyncView(outcome: LeaderboardListSyncOutcome): SlackMessageView {
  return cardView(
    [
      cardHeader(outcome.created ? "✨" : "♻️", "Ċomba Leaderboard"),
      cardSection(
        outcome.created
          ? "A fresh leaderboard List was created for this channel."
          : "Reused the existing leaderboard List for this channel.",
      ),
      divider(),
      cardSection("", {
        fields: [
          `*List*\n<@${outcome.listId}>`,
          `*Rows written*\n${outcome.rows}`,
          `*Synced at*\n${outcome.syncedAt}`,
        ],
      }),
      cardContext([
        "Add/select this List in the channel's tabs if Slack does not show it automatically.",
      ]),
    ],
    `${outcome.created ? "Created" : "Reused"} Ċomba Leaderboard ${outcome.listId}; wrote ${outcome.rows} rows.`,
  );
}

function renderPlayerStats(
  playerId: string,
  stats: PlayerStats,
): SlackMessageView {
  const blocks = [
    cardHeader("⚽", "Player stats"),
    cardSection(`<@${playerId}>`),
    divider(),
    cardSection("", {
      fields: [
        `*Games played*\n${stats.gamesPlayed}`,
        `*Games won*\n${stats.gamesWon}`,
        `*Games lost*\n${stats.gamesLost}`,
        `*Game win rate*\n${stats.gameWinRate.toFixed(1)}%`,
      ],
    }),
  ];

  const rel = stats.relational;
  const context: string[] = [];
  if (rel) {
    if (rel.bestTeammate) {
      context.push(
        `🤝 Best teammate: <@${rel.bestTeammate}> (${rel.gamesPlayedTogether} games together)`,
      );
    }
    if (rel.nemesis) {
      context.push(`😈 Nemesis: <@${rel.nemesis}> (lost ${rel.nemesisCount}×)`);
    }
    if (rel.victim) {
      context.push(`🎯 Victim: <@${rel.victim}> (beaten ${rel.victimCount}×)`);
    }
  }
  if (context.length > 0) {
    blocks.push(divider(), cardContext(context));
  }

  return cardView(
    blocks,
    `⚽ Stats for <@${playerId}>: ${stats.gamesWon}/${stats.gamesPlayed} wins (${stats.gameWinRate.toFixed(1)}%).`,
  );
}

function renderLeaderboard(leaderboard: Leaderboard): SlackMessageView {
  if (leaderboard.players.length === 0) {
    return cardView(
      [
        cardHeader("🏆", "Ċomba leaderboard"),
        cardSection("No games have been recorded yet."),
      ],
      "🏆 Ċomba leaderboard\nNo games have been recorded yet.",
    );
  }
  const medals = ["🥇", "🥈", "🥉"];
  const rows = leaderboard.players.map(
    (player, index) =>
      `${medals[index] ?? `${index + 1}.`} <@${player.playerId}> — ${player.gamesPlayed} played · ${player.gamesWon} won · ${player.gamesLost} lost`,
  );

  const fun: string[] = [];
  if (leaderboard.biggestWinRatio) {
    fun.push(
      `🔥 Best win ratio: <@${leaderboard.biggestWinRatio.playerId}> (${leaderboard.biggestWinRatio.gameWinRate.toFixed(1)}%)`,
    );
  }
  if (leaderboard.biggestLossRatio) {
    fun.push(
      `🧊 Biggest loss ratio: <@${leaderboard.biggestLossRatio.playerId}> (${(100 - leaderboard.biggestLossRatio.gameWinRate).toFixed(1)}%)`,
    );
  }
  if (leaderboard.mostGames) {
    fun.push(
      `🏃 Most games: <@${leaderboard.mostGames.playerId}> (${leaderboard.mostGames.gamesPlayed})`,
    );
  }

  return cardView(
    [
      cardHeader("🏆", "Ċomba leaderboard"),
      cardSection(rows.join("\n")),
      ...(fun.length > 0
        ? [divider(), cardContext(fun)]
        : []),
    ],
    `🏆 Ċomba leaderboard\n${rows.join("\n")}${fun.length ? `\n${fun.join("\n")}` : ""}`,
  );
}

function renderComparison(
  playerAId: string,
  playerBId: string,
  against: HeadToHeadStatistics,
  together: TeammateStatistics,
): SlackMessageView {
  return cardView(
    [
      cardHeader("⚔️", "Head to head"),
      cardSection(`<@${playerAId}> vs <@${playerBId}>`),
      divider(),
      cardSection("", {
        fields: [
          `*Games against*\n${against.gamesAgainst}`,
          `*Wins <@${playerAId}>*\n${against.playerAWins}`,
          `*Wins <@${playerBId}>*\n${against.playerBWins}`,
          `*Win rate <@${playerAId}>*\n${against.playerAWinRate.toFixed(1)}%`,
        ],
      }),
      divider(),
      cardHeader("🤝", "As teammates"),
      cardSection("", {
        fields: [
          `*Games together*\n${together.gamesPlayedTogether}`,
          `*Won together*\n${together.gamesWonTogether}`,
          `*Lost together*\n${together.gamesLostTogether}`,
          `*Win rate together*\n${together.winRateTogether.toFixed(1)}%`,
        ],
      }),
    ],
    `⚔️ <@${playerAId}> vs <@${playerBId}>: ${against.playerAWins}–${against.playerBWins} against (${against.playerAWinRate.toFixed(1)}% win rate); as teammates: ${together.winRateTogether.toFixed(1)}% win rate.`,
  );
}

function commandHelp(): SlackMessageView {
  return cardView(
    [
      cardHeader("⚽", "Ċomba commands"),
      cardSection("", {
        fields: [
          "`/comba` — start a lobby",
          "`/comba stats` — your statistics",
          "`/comba stats @user` — a player's stats",
          "`/comba h2h @user` — compare with a player",
          "`/comba h2h @user1 @user2` — compare two players",
          "`/comba leaderboard` — global leaderboard",
        ],
      }),
    ],
    "Ċomba commands: /comba, /comba stats, /comba h2h, /comba leaderboard.",
  );
}
