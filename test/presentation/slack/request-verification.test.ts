import { describe, expect, it } from "vitest";

import { verifySlackRequest } from "@comba/presentation/slack/request-verification";
import { signedSlackRequest } from "../../helpers/slack";

const now = new Date("2026-08-29T12:00:00.000Z");
const timestamp = String(Math.floor(now.getTime() / 1000));
const secret = "test-signing-secret";

describe("verifySlackRequest", () => {
  it("accepts a correctly signed request", async () => {
    const body = "command=%2Fcomba&user_id=U123";
    const request = await signedRequest(body);

    await expect(
      verifySlackRequest(request, body, secret, { now }),
    ).resolves.toBe(true);
  });

  it("rejects a changed body", async () => {
    const request = await signedRequest("command=%2Fcomba");

    await expect(
      verifySlackRequest(request, "command=%2Fother", secret, { now }),
    ).resolves.toBe(false);
  });

  it("rejects requests older than five minutes", async () => {
    const body = "command=%2Fcomba";
    const request = await signedRequest(body);
    const later = new Date(now.getTime() + 5 * 60 * 1000 + 1_000);

    await expect(
      verifySlackRequest(request, body, secret, { now: later }),
    ).resolves.toBe(false);
  });
});

async function signedRequest(body: string): Promise<Request> {
  return signedSlackRequest({
    body,
    secret,
    timestamp,
  });
}
