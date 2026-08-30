import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import { StatisticsService } from "./statistics-service";
import type {
  LeaderboardListRepository,
  StoredLeaderboardList,
} from "./ports/leaderboard-list-repository";
import {
  LeaderboardListNotFoundError,
  type LeaderboardListPort,
  type LeaderboardListRow,
} from "./ports/leaderboard-list";

export interface LeaderboardListSyncResult {
  created: boolean;
  listId: string;
  rows: number;
  syncedAt: string;
}

@scoped(Lifecycle.ContainerScoped)
export class LeaderboardListService {
  constructor(
    @inject(StatisticsService) private readonly statistics: StatisticsService,
    @inject(TOKENS.leaderboardList) private readonly lists: LeaderboardListPort,
    @inject(TOKENS.leaderboardListRepository)
    private readonly repository: LeaderboardListRepository,
    @inject(TOKENS.now) private readonly now: () => Date = () => new Date(),
  ) {}

  async sync(
    workspaceId: string,
    channelId: string,
    channelName?: string,
  ): Promise<LeaderboardListSyncResult> {
    let stored = await this.repository.find(workspaceId, channelId);
    let created = false;
    let rowIds: string[] = [];
    if (stored) {
      try {
        rowIds = await this.lists.listRowIds(stored.listId);
      } catch (error) {
        if (!(error instanceof LeaderboardListNotFoundError)) throw error;
        stored = null;
      }
    }
    if (!stored) {
      const definition = await this.lists.create(channelName);
      stored = {
        ...definition,
        channelId,
        createdAt: this.now().toISOString(),
        lastSyncedAt: null,
        workspaceId,
      };
      await this.repository.save(stored);
      created = true;
    }
    await this.lists.grantChannelReadAccess(stored.listId, channelId);

    const leaderboard = await this.statistics.getLeaderboard(workspaceId);
    const syncedAt = this.now().toISOString();
    const rows: LeaderboardListRow[] = await Promise.all(
      leaderboard.players.map(async (player, index) => {
        const recentOutcomes = await this.statistics.getRecentOutcomes(
          workspaceId,
          player.playerId,
        );
        return {
          ...player,
          rank: index + 1,
          recentOutcomes,
        };
      }),
    );
    if (rowIds.length) await this.lists.deleteRows(stored.listId, rowIds);
    if (rows.length) await this.lists.writeSnapshot(stored, rows);
    await this.repository.markSynced(workspaceId, channelId, syncedAt);
    return { created, listId: stored.listId, rows: rows.length, syncedAt };
  }

  async syncAll(): Promise<PromiseSettledResult<LeaderboardListSyncResult>[]> {
    const configured = await this.repository.listAll();
    return Promise.allSettled(
      configured.map((item) => this.sync(item.workspaceId, item.channelId)),
    );
  }
}
