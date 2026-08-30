import type {
  SessionParticipant,
  SessionWithParticipants,
  Team,
  TeamPosition,
} from "@comba/application/models/session-view";
import type { SlackMessageView } from "./types";
import { cardContainer } from "./cards";

export const COMBA_INTERACTION_IDS = {
  bench: "comba.bench",
  joinA1: "comba.join.A.1",
  joinA2: "comba.join.A.2",
  joinB1: "comba.join.B.1",
  joinB2: "comba.join.B.2",
  recordResult: "comba.record_result",
} as const;

const JOIN_TARGETS = new Map<string, { position: TeamPosition; team: Team }>([
  [COMBA_INTERACTION_IDS.joinA1, { position: 1, team: "A" }],
  [COMBA_INTERACTION_IDS.joinA2, { position: 2, team: "A" }],
  [COMBA_INTERACTION_IDS.joinB1, { position: 1, team: "B" }],
  [COMBA_INTERACTION_IDS.joinB2, { position: 2, team: "B" }],
]);

export function joinTargetForAction(
  actionId: string,
): { position: TeamPosition; team: Team } | null {
  return JOIN_TARGETS.get(actionId) ?? null;
}

export function sessionIdFromJoinValue(
  value: string,
  target: { position: TeamPosition; team: Team },
): string | null {
  const [sessionId, team, position, extra] = value.split("|");
  return sessionId &&
    !extra &&
    team === target.team &&
    Number(position) === target.position
    ? sessionId
    : null;
}

export function renderSession(
  state: SessionWithParticipants,
): SlackMessageView {
  switch (state.session.status) {
    case "OPEN":
      return renderOpenLobby(state);
    case "READY":
      return renderReadyLobby(state);
    case "CANCELLED":
      return terminalView(
        "❌ Ċomba cancelled",
        "The session leader benched themselves.",
      );
    case "EXPIRED":
      return terminalView(
        "⌛ Ċomba expired",
        "Not enough players joined within 5 minutes.",
      );
    case "COMPLETED":
      return renderCompletedSession(state);
  }
}

export function renderOpenLobby(
  state: SessionWithParticipants,
): SlackMessageView {
  const { participants, session } = state;
  const spotsRemaining = 4 - participants.length;

  return {
    blocks: [
      cardContainer("Ċomba?", {
        child_blocks: [
          ...teamBlocks("⚪", "TEAM A", "A", participants, session.id),
          ...teamBlocks("🔴", "TEAM B", "B", participants, session.id),
          {
            block_id: "comba.lobby.bench",
            elements: [
              button(
                "Bench me",
                COMBA_INTERACTION_IDS.bench,
                session.id,
                "primary",
              ),
            ],
            type: "actions",
          },
          {
            elements: [
              markdown(
                `${spotsRemaining} ${spotsRemaining === 1 ? "spot" : "spots"} remaining · ${closesInLabel(session.expiresAt)} · created by <@${session.creatorUserId}>`,
              ),
            ],
            type: "context",
          },
        ],
        has_header_divider: true,
        subtitle: lobbyTaunt(session.id),
      }),
    ],
    text: `⚽ Ċomba? ${spotsRemaining} ${spotsRemaining === 1 ? "spot" : "spots"} remaining.`,
  };
}

function teamBlocks(
  emoji: string,
  name: string,
  team: Team,
  participants: SessionParticipant[],
  sessionId: string,
): SlackMessageView["blocks"] {
  const members = participants
    .filter((participant) => participant.team === team)
    .sort((left, right) => left.position - right.position);
  const openPosition = ([1, 2] as const).find(
    (position) => !members.some((member) => member.position === position),
  );

  return [
    { text: plainText(`${emoji} ${name}`), type: "header" },
    {
      ...(openPosition
        ? {
            accessory: button(
              "Join",
              joinActionId(team, openPosition),
              `${sessionId}|${team}|${openPosition}`,
              team === "B" ? "danger" : undefined,
            ),
          }
        : {}),
      text: markdown(
        members.length > 0
          ? members.map((member) => `<@${member.userId}>`).join(" + ")
          : "_No players yet_",
      ),
      type: "section",
    },
  ];
}

function joinActionId(team: Team, position: TeamPosition): string {
  return COMBA_INTERACTION_IDS[`join${team}${position}`];
}

function renderReadyLobby(state: SessionWithParticipants): SlackMessageView {
  return {
    blocks: [
      cardContainer("Ċomba is on", {
        child_blocks: [
          ...teamBlocks("⚪", "TEAM A", "A", state.participants, state.session.id),
          ...teamBlocks("🔴", "TEAM B", "B", state.participants, state.session.id),
          {
            block_id: "comba.result.actions",
            elements: [
              button(
                "Record result",
                COMBA_INTERACTION_IDS.recordResult,
                state.session.id,
                "primary",
              ),
              button(
                "Bench me",
                COMBA_INTERACTION_IDS.bench,
                state.session.id,
                "primary",
              ),
            ],
            type: "actions",
          },
          {
            elements: [
              markdown(
                `Full lobby · hit *Record result* when the match is done`,
              ),
            ],
            type: "context",
          },
        ],
        has_header_divider: true,
        subtitle: `🔥 Full lobby`,
      }),
    ],
    text: `🔥 Ċomba is on: ${mentions(state.participants, "A")} vs ${mentions(state.participants, "B")}`,
  };
}

function renderCompletedSession(
  state: SessionWithParticipants,
): SlackMessageView {
  if (!state.result) {
    return terminalView("🏁 Ċomba completed", "The result was recorded.");
  }

  const { result } = state;
  return {
    blocks: [
      cardContainer("Final result", {
        child_blocks: [
          {
            text: markdown(
              `${mentions(state.participants, "A")}  *${result.teamAWins}*\n${mentions(state.participants, "B")}  *${result.teamBWins}*`,
            ),
            type: "section",
          },
          {
            block_id: "comba.result.actions",
            elements: [
              button(
                "Edit result",
                COMBA_INTERACTION_IDS.recordResult,
                state.session.id,
                "primary",
              ),
            ],
            type: "actions",
          }
        ],
        subtitle: `🏁 Ċomba over`,
      }),
    ],
    text: `🏁 Final result: ${mentions(state.participants, "A")} ${result.teamAWins}–${result.teamBWins} ${mentions(state.participants, "B")}`,
  };
}

function terminalView(title: string, detail: string): SlackMessageView {
  const emoji = title.match(/^(\p{Extended_Pictographic}\s*)/u)?.[1] ?? "";
  const plain = title.replace(/^\p{Extended_Pictographic}\s*/u, "");
  return {
    blocks: [
      cardContainer(plain, {
        child_blocks: [
          { text: markdown(`${emoji}${detail}`), type: "section" },
        ],
      }),
    ],
    text: `${title}. ${detail}`,
  };
}

const LOBBY_TAUNTS = [
  "🫵 Talk is cheap. Pick a side",
  "👻 Scared of the table?",
  "🧑‍🍳 Come get cooked",
  "😈 Pick a team and regret it",
  "⚔️ Grab a teammate – Find some rivals",
  "🏆 Someone has to carry",
  "💀 Careers will be ended",
  "🤡 Confidence check starts here",
  "🧂 Salt incoming",
  "🪦 Enter at your own risk",
  "🚑 Ego damage possible",
  "🎭 Big talk – tiny table",
  "🎰 No skill, only free spins",
  "💩 Winners talk shit"
];

function lobbyTaunt(sessionId: string): string {
  let hash = 0;
  for (const character of sessionId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return LOBBY_TAUNTS[hash % LOBBY_TAUNTS.length] ?? "";
}

function closesInLabel(expiresAt: string): string {
  const unix = Math.floor(new Date(expiresAt).getTime() / 1_000);
  return `closes <!date^${unix}^{time}|later today>`;
}

function mentions(participants: SessionParticipant[], team: Team): string {
  return participants
    .filter((participant) => participant.team === team)
    .sort((left, right) => left.position - right.position)
    .map((participant) => `<@${participant.userId}>`)
    .join(" + ");
}

function button(
  label: string,
  actionId: string,
  value: string,
  style?: "danger" | "primary",
) {
  return {
    action_id: actionId,
    ...(style ? { style } : {}),
    text: plainText(label),
    type: "button" as const,
    value,
  };
}

function markdown(text: string) {
  return { text, type: "mrkdwn" as const };
}

function plainText(text: string) {
  return { emoji: true as const, text, type: "plain_text" as const };
}
