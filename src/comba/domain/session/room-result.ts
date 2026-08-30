export type SessionRoomErrorCode =
  | "ACTIVE_SESSION_EXISTS"
  | "INVALID_POSITION"
  | "NOT_PARTICIPATING"
  | "SESSION_NOT_FOUND"
  | "SESSION_NOT_READY"
  | "TEAM_FULL"
  | "TEAM_NOT_FOUND";

export interface SessionRoomFailure {
  error: { code: SessionRoomErrorCode; message: string };
  ok: false;
}

export interface SessionRoomSuccess<T> {
  ok: true;
  value: T;
}

export type SessionRoomResult<T> = SessionRoomFailure | SessionRoomSuccess<T>;

export function failure(
  code: SessionRoomErrorCode,
  message: string,
): SessionRoomFailure {
  return { error: { code, message }, ok: false };
}

export function success<T>(value: T): SessionRoomSuccess<T> {
  return { ok: true, value };
}
