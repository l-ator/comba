export class SessionError extends Error {}

export class SessionChannelNotAllowedError extends SessionError {
  constructor() {
    super("Ċomba can only be started in the configured channel.");
    this.name = "SessionChannelNotAllowedError";
  }
}

export class OpenSessionExistsError extends SessionError {
  constructor() {
    super("There is already an open Ċomba lobby in this channel.");
    this.name = "OpenSessionExistsError";
  }
}

export class DuplicateParticipantError extends SessionError {
  constructor() {
    super("You have already joined this Ċomba lobby.");
    this.name = "DuplicateParticipantError";
  }
}

export class SessionExpiredError extends SessionError {
  constructor() {
    super("This Ċomba lobby has expired.");
    this.name = "SessionExpiredError";
  }
}

export class SessionNotFoundError extends SessionError {
  constructor() {
    super("This Ċomba lobby no longer exists.");
    this.name = "SessionNotFoundError";
  }
}

export class SessionNotOpenError extends SessionError {
  constructor() {
    super("This Ċomba lobby is no longer open.");
    this.name = "SessionNotOpenError";
  }
}

export class SessionParticipantNotFoundError extends SessionError {
  constructor() {
    super("You have not joined this Ċomba lobby.");
    this.name = "SessionParticipantNotFoundError";
  }
}

export class TeamFullError extends SessionError {
  constructor() {
    super("That team is already full.");
    this.name = "TeamFullError";
  }
}

export class PositionOccupiedError extends SessionError {
  constructor() {
    super("That position has already been taken.");
    this.name = "PositionOccupiedError";
  }
}
