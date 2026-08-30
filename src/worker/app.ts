import { Hono } from "hono";
import type { DependencyContainer } from "tsyringe";

import { createInvocationContainer } from "./container";
import type { Env } from "./env";
import { errorDetails } from "@shared/observability/error-details";
import { CombaCommandHandler } from "@comba/presentation/slack/command-handler";
import { CombaInteractionHandler } from "@comba/presentation/slack/interaction-handler";
import {
  isSlackValidationError,
  parseCombaCommand,
  parseCombaInteraction,
} from "@comba/presentation/slack/parsing/payloads";
import { verifySlackRequest } from "@comba/presentation/slack/request-verification";
import type { CombaCommand } from "@comba/presentation/slack/schemas/command";
import type { CombaInteraction } from "@comba/presentation/slack/schemas/interaction";

type Bindings = {
  Bindings: Env;
  Variables: {
    requestContainer: DependencyContainer;
    slackRawBody: string;
  };
};

export interface AppHandlers {
  combaCommand?: (command: CombaCommand, env: Env) => Promise<Response>;
  combaInteraction?: (
    interaction: CombaInteraction,
    env: Env,
  ) => Promise<Response> | Response;
}

export function createApp(handlers: AppHandlers = {}) {
  const app = new Hono<Bindings>();

  app.use("*", async (context, next) => {
    const requestContainer = createInvocationContainer(context.env);
    context.set("requestContainer", requestContainer);
    try {
      await next();
    } finally {
      await requestContainer.dispose();
    }
  });

  app.get("/health", (context) =>
    context.json({ environment: context.env.APP_ENV, status: "ok" }),
  );

  app.use("/slack/*", async (context, next) => {
    const rawBody = await context.req.text();
    const valid = await verifySlackRequest(
      context.req.raw,
      rawBody,
      context.env.SLACK_SIGNING_SECRET,
    );

    if (!valid) {
      return context.text("Invalid Slack signature", 401);
    }

    context.set("slackRawBody", rawBody);
    await next();
  });

  app.post("/slack/commands", (context) =>
    handlers.combaCommand
      ? handlers.combaCommand(
          parseCombaCommand(context.get("slackRawBody")),
          context.env,
        )
      : context
          .get("requestContainer")
          .resolve(CombaCommandHandler)
          .handle(parseCombaCommand(context.get("slackRawBody"))),
  );

  app.post("/slack/interactions", (context) =>
    handlers.combaInteraction
      ? handlers.combaInteraction(
          parseCombaInteraction(context.get("slackRawBody")),
          context.env,
        )
      : context
          .get("requestContainer")
          .resolve(CombaInteractionHandler)
          .handle(parseCombaInteraction(context.get("slackRawBody"))),
  );

  app.notFound((context) => context.text("Not found", 404));

  app.onError((error, context) => {
    if (isSlackValidationError(error)) {
      console.warn("Rejected invalid Slack payload", {
        error: error.name,
        issues: "issues" in error ? error.issues : undefined,
      });

      return context.json({ error: "Invalid Slack payload" }, 400);
    }

    console.error("Unhandled request error", {
      error: errorDetails(error),
      method: context.req.method,
      path: context.req.path,
    });
    return context.json({ error: "Internal server error" }, 500);
  });

  return app;
}

export const app = createApp();
