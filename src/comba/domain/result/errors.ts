export class ResultError extends Error {}

export class InvalidResultError extends ResultError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResultError";
  }
}

export class ResultPermissionError extends ResultError {
  constructor() {
    super("Only players from this Ċomba session can record its result.");
    this.name = "ResultPermissionError";
  }
}

export class ResultSessionNotEligibleError extends ResultError {
  constructor() {
    super("A result cannot be recorded for this Ċomba session.");
    this.name = "ResultSessionNotEligibleError";
  }
}
