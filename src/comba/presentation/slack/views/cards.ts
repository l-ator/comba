import type {
  SlackBlock,
  SlackContainerBlock,
  SlackMessageView,
} from "./types";

export function cardView(
  blocks: SlackBlock[],
  text: string,
): SlackMessageView {
  return { blocks, text };
}

export function cardContainer(
  title: string,
  options: {
    child_blocks: SlackBlock[];
    has_header_divider?: boolean;
    subtitle?: string;
  },
): SlackContainerBlock {
  return {
    child_blocks: options.child_blocks,
    ...(options.has_header_divider
      ? { has_header_divider: options.has_header_divider }
      : {}),
    ...(options.subtitle ? { subtitle: { text: options.subtitle, type: "mrkdwn" } } : {}),
    title: { emoji: true, text: title, type: "plain_text" },
    type: "container",
  };
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
