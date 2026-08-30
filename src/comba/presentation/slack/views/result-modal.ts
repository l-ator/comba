import type { SessionWithParticipants } from "@comba/application/models/session-view";
import type { SlackModalView } from "./types";

export const RESULT_MODAL = {
  callbackId: "comba.result",
  scoreActionId: "score",
  teamABlockId: "team_a_wins",
  teamBBlockId: "team_b_wins",
} as const;

export function renderResultModal(
  state: SessionWithParticipants,
): SlackModalView {
  return {
    blocks: [
      scoreInput(
        RESULT_MODAL.teamABlockId,
        "Team A wins",
        state.result?.teamAWins,
      ),
      scoreInput(
        RESULT_MODAL.teamBBlockId,
        "Team B wins",
        state.result?.teamBWins,
      ),
    ],
    callback_id: RESULT_MODAL.callbackId,
    close: plainText("Cancel"),
    private_metadata: JSON.stringify({
      channelId: state.session.channelId,
      sessionId: state.session.id,
    }),
    submit: plainText(state.result ? "Edit result" : "Record result"),
    title: plainText("Ċomba result"),
    type: "modal",
  };
}

function scoreInput(
  blockId: string,
  label: string,
  initialValue: number | undefined,
) {
  return {
    block_id: blockId,
    element: {
      action_id: RESULT_MODAL.scoreActionId,
      ...(initialValue === undefined
        ? {}
        : { initial_value: String(initialValue) }),
      type: "plain_text_input" as const,
    },
    label: plainText(label),
    type: "input" as const,
  };
}

function plainText(text: string) {
  return { emoji: true as const, text, type: "plain_text" as const };
}
