import { inject, Lifecycle, scoped } from "tsyringe";

import { TOKENS } from "@shared/di/tokens";
import type {
  LeaderboardListRepository,
  StoredLeaderboardList,
} from "@comba/application/ports/leaderboard-list-repository";

const KEY_PREFIX = "leaderboard:";

@scoped(Lifecycle.ContainerScoped)
export class KVLeaderboardListRepository
  implements LeaderboardListRepository
{
  constructor(
    @inject(TOKENS.leaderboardListStorage)
    private readonly storage: KVNamespace,
  ) {}

  async find(
    workspaceId: string,
    channelId: string,
  ): Promise<StoredLeaderboardList | null> {
    return this.storage.get(key(workspaceId, channelId), "json");
  }

  async listAll(): Promise<StoredLeaderboardList[]> {
    const pages = await this.storage.list({ prefix: KEY_PREFIX });
    const values = await Promise.all(
      pages.keys.map((entry) =>
        this.storage.get<StoredLeaderboardList>(entry.name, "json"),
      ),
    );
    return values.filter(
      (value): value is StoredLeaderboardList => value !== null,
    );
  }

  async save(value: StoredLeaderboardList): Promise<void> {
    await this.storage.put(key(value.workspaceId, value.channelId), JSON.stringify(value));
  }

  async markSynced(
    workspaceId: string,
    channelId: string,
    at: string,
  ): Promise<void> {
    const record = await this.find(workspaceId, channelId);
    if (!record) return;
    await this.storage.put(
      key(workspaceId, channelId),
      JSON.stringify({ ...record, lastSyncedAt: at }),
    );
  }
}

function key(workspaceId: string, channelId: string): string {
  return `${KEY_PREFIX}${workspaceId}:${channelId}`;
}
