import { z } from "zod";

import { combaCommandSchema, type CombaCommand } from "../schemas/command";

import {
  combaInteractionSchema,
  type CombaInteraction,
} from "../schemas/interaction";

export class SlackPayloadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SlackPayloadError";
  }
}

export function parseCombaCommand(rawBody: string): CombaCommand {
  return combaCommandSchema.parse(formValues(rawBody));
}

export function parseCombaInteraction(rawBody: string): CombaInteraction {
  const payload = new URLSearchParams(rawBody).get("payload");
  if (!payload) {
    throw new SlackPayloadError("Missing interaction payload");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(payload);
  } catch (error) {
    throw new SlackPayloadError("Interaction payload is not valid JSON", {
      cause: error,
    });
  }

  return combaInteractionSchema.parse(decoded);
}

export function isSlackValidationError(error: unknown): boolean {
  return error instanceof z.ZodError || error instanceof SlackPayloadError;
}

function formValues(rawBody: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(rawBody));
}
