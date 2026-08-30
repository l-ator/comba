import { describe, expect, it, vi } from "vitest";

import { createApp } from "@worker/app";
import type { Env } from "@worker/env";
import { signedSlackRequest } from "../helpers/slack";

const env = {
  APP_ENV: "test",
  COMBA_CHANNEL_ID: "C123",
  SLACK_BOT_TOKEN: "xoxb-test",
  SLACK_SIGNING_SECRET: "test-secret",
} as Env;
const timestamp = String(Math.floor(Date.now() / 1000));
const combaCommand = vi.fn(async () =>
  Response.json({ response_type: "ephemeral", text: "handled" }),
);
const combaInteraction = vi.fn(async () => new Response(null, { status: 200 }));
const app = createApp({ combaCommand, combaInteraction });

describe("createApp", () => {
  it("reports its health", async () => {
    const response = await app.request("/health", undefined, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      environment: "test",
      status: "ok",
    });
  });

  it("rejects unsigned Slack requests", async () => {
    const response = await app.request(
      "/slack/commands",
      { body: "command=%2Fcomba", method: "POST" },
      env,
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Invalid Slack signature");
  });

  it("accepts and validates a signed /comba command", async () => {
    const body = new URLSearchParams({
      api_app_id: "A123",
      channel_id: "C123",
      channel_name: "comba-testing",
      command: "/comba",
      response_url: "https://hooks.slack.test/commands/123",
      team_domain: "personal-workspace",
      team_id: "T123",
      text: "",
      trigger_id: "123.456",
      user_id: "U123",
      user_name: "lorenzo",
    }).toString();
    const request = await signedSlackRequest({
      body,
      secret: env.SLACK_SIGNING_SECRET,
      timestamp,
    });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      response_type: "ephemeral",
    });
  });

  it("logs actionable diagnostics for an unhandled /comba error", async () => {
    const error = new Error("Durable Object unavailable", {
      cause: new Error("binding failed"),
    });
    const failingApp = createApp({
      combaCommand: vi.fn(async () => {
        throw error;
      }),
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const body = validCommandBody();
    const request = await signedSlackRequest({
      body,
      secret: env.SLACK_SIGNING_SECRET,
      timestamp,
    });

    const response = await failingApp.fetch(request, env);

    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledWith("Unhandled request error", {
      error: expect.objectContaining({
        cause: expect.objectContaining({ message: "binding failed" }),
        message: "Durable Object unavailable",
        name: "Error",
        stack: expect.any(String),
      }),
      method: "POST",
      path: "/slack/commands",
    });
  });

  it("rejects an authentic command with missing fields", async () => {
    const request = await signedSlackRequest({
      body: "command=%2Fcomba",
      secret: env.SLACK_SIGNING_SECRET,
      timestamp,
    });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid Slack payload",
    });
  });

  it("rejects an authentic interaction containing malformed JSON", async () => {
    const request = await signedSlackRequest({
      body: "payload=%7Bnot-json",
      path: "/slack/interactions",
      secret: env.SLACK_SIGNING_SECRET,
      timestamp,
    });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(400);
  });

  it("validates and dispatches a signed Ċomba interaction", async () => {
    const payload = {
      actions: [
        {
          action_id: "comba.join_team_a",
          action_ts: "123.456",
          block_id: "comba.lobby.join",
          value: "session-1",
        },
      ],
      channel: { id: "C123" },
      message: { ts: "123.456" },
      response_url: "https://hooks.slack.test/actions/123",
      team: { id: "T123" },
      trigger_id: "987.654",
      type: "block_actions",
      user: { id: "U123" },
    };
    const request = await signedSlackRequest({
      body: new URLSearchParams({
        payload: JSON.stringify(payload),
      }).toString(),
      path: "/slack/interactions",
      secret: env.SLACK_SIGNING_SECRET,
      timestamp,
    });

    const response = await app.fetch(request, env);

    expect(response.status).toBe(200);
    expect(combaInteraction).toHaveBeenCalledWith(payload, env);
  });

  it("returns 404 for unknown routes", async () => {
    const response = await app.request("/unknown", undefined, env);

    expect(response.status).toBe(404);
  });
});

function validCommandBody(): string {
  return new URLSearchParams({
    api_app_id: "A123",
    channel_id: "C123",
    channel_name: "comba-testing",
    command: "/comba",
    response_url: "https://hooks.slack.test/commands/123",
    team_domain: "personal-workspace",
    team_id: "T123",
    text: "",
    trigger_id: "123.456",
    user_id: "U123",
    user_name: "lorenzo",
  }).toString();
}
