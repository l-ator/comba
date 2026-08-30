import type { SlackBlock, SlackMessageView } from "./types";

export function cardView(
  blocks: SlackBlock[],
  text: string,
): SlackMessageView {
  return { blocks, text };
}

export function cardHeader(emoji: string, text: string): SlackBlock {
  return {
    text: { emoji: true, text: `${emoji} ${text}`, type: "plain_text" },
    type: "header",
  };
}

export function divider(): SlackBlock {
  return { type: "divider" };
}

export function cardContext(elements: string[]): SlackBlock {
  return {
    elements: elements.map((text) => ({ text, type: "mrkdwn" })),
    type: "context",
  };
}

export function cardSection(
  text: string,
  options?: { fields?: string[] },
): SlackBlock {
  const fields =
    options?.fields && options.fields.length > 0
      ? options.fields.map((field) => ({ text: field, type: "mrkdwn" }))
      : undefined;
  return {
    ...(text ? { text: { text, type: "mrkdwn" } } : {}),
    ...(fields ? { fields } : {}),
    type: "section",
  } as SlackBlock;
}
