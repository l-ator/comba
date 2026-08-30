import type { SessionResult } from "@comba/domain/result/model";
import type { SessionWithParticipants } from "@comba/application/models/session-view";
import type { SlackMessageView } from "./types";

export function renderResultAmendment(
  state: SessionWithParticipants,
  previous: SessionResult,
  amendedBy: string,
): SlackMessageView {
  if (!state.result) {
    throw new Error("Cannot render an amendment without a current result");
  }

  const scoreChange = `${previous.teamAWins}–${previous.teamBWins} → ${state.result.teamAWins}–${state.result.teamBWins}`;
  const participants = state.participants
    .map((participant) => `<@${participant.userId}>`)
    .join(" ");
  const text = `⚠️ <@${amendedBy}> amended this session's result: *${scoreChange}*\nParticipants: ${participants}`;

  return {
    blocks: [{ text: { text, type: "mrkdwn" }, type: "section" }],
    text,
  };
}
