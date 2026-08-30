import {
  SessionStatus,
  type LiveSession,
  type Player,
  type Team,
} from "./model";
import { failure, success, type SessionRoomResult } from "./room-result";

export function joinOrSwitch(
  session: LiveSession,
  userId: string,
  targetTeamId: string,
  targetPosition: number,
  at: string,
): SessionRoomResult<LiveSession> {
  const targetDefinition = session.format.teams.find(
    (team) => team.id === targetTeamId,
  );
  const target = session.teams.find((team) => team.id === targetTeamId);
  if (!targetDefinition || !target) {
    return failure("TEAM_NOT_FOUND", "That team does not exist.");
  }
  if (
    targetPosition < 1 ||
    targetPosition > targetDefinition.capacity ||
    target.players.some((player) => player.position === targetPosition)
  ) {
    return failure(
      "INVALID_POSITION",
      "That position has already changed. Please use the latest lobby.",
    );
  }

  const existing = findPlayer(session.teams, userId);
  if (existing?.team.id === targetTeamId) {
    return success(session);
  }
  if (target.players.length >= targetDefinition.capacity) {
    return failure("TEAM_FULL", "That team is already full.");
  }

  const player: Player = {
    joinedAt: existing?.player.joinedAt ?? at,
    position: targetPosition,
    userId,
  };
  const teams = session.teams.map((team) => ({
    ...team,
    players: team.players.filter((candidate) => candidate.userId !== userId),
  }));
  teams.find((team) => team.id === targetTeamId)!.players.push(player);
  teams
    .find((team) => team.id === targetTeamId)!
    .players.sort((left, right) => left.position - right.position);

  const ready = isReady({ ...session, teams });
  return success({
    ...session,
    readyAt: ready ? (session.readyAt ?? at) : undefined,
    revision: session.revision + 1,
    status: ready ? SessionStatus.READY : SessionStatus.OPEN,
    teams,
  });
}

export function bench(
  session: LiveSession,
  userId: string,
): SessionRoomResult<LiveSession | null> {
  if (!findPlayer(session.teams, userId)) {
    return failure("NOT_PARTICIPATING", "You are not playing in this Ċomba.");
  }
  if (userId === session.creatorUserId) {
    return success(null);
  }

  const teams = session.teams.map((team) => ({
    ...team,
    players: team.players.filter((player) => player.userId !== userId),
  }));
  return success({
    ...session,
    readyAt: undefined,
    revision: session.revision + 1,
    status: SessionStatus.OPEN,
    teams,
  });
}

export function isReady(session: LiveSession): boolean {
  return session.format.teams.every((definition) =>
    session.teams.some(
      (team) =>
        team.id === definition.id &&
        team.players.length === definition.capacity,
    ),
  );
}

export function hasPlayer(session: LiveSession, userId: string): boolean {
  return Boolean(findPlayer(session.teams, userId));
}

function findPlayer(teams: Team[], userId: string) {
  for (const team of teams) {
    const player = team.players.find(
      (candidate) => candidate.userId === userId,
    );
    if (player) return { player, team };
  }
  return null;
}
