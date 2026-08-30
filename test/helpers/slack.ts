const encoder = new TextEncoder();

export async function signedSlackRequest(options: {
  body: string;
  path?: string;
  secret: string;
  timestamp: string;
}): Promise<Request> {
  const { body, path = "/slack/commands", secret, timestamp } = options;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`v0:${timestamp}:${body}`),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return new Request(`https://example.test${path}`, {
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": `v0=${hex}`,
    },
    method: "POST",
  });
}
