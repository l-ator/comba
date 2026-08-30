import type { SessionResult } from "@comba/domain/result/model";
import type { SessionWithParticipants } from "./session-view";

export interface ResultMutation {
  previousResult: SessionResult | null;
  state: SessionWithParticipants;
}
