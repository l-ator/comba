export interface SlackMessageView {
  blocks: SlackBlock[];
  text: string;
}

export interface SlackModalView {
  blocks: SlackInputBlock[];
  callback_id: string;
  close: SlackPlainText;
  private_metadata: string;
  submit: SlackPlainText;
  title: SlackPlainText;
  type: "modal";
}

export type SlackBlock =
  | SlackActionsBlock
  | SlackContainerBlock
  | SlackContextBlock
  | SlackDividerBlock
  | SlackHeaderBlock
  | SlackSectionBlock;

interface SlackActionsBlock {
  block_id: string;
  elements: SlackButtonElement[];
  type: "actions";
}

interface SlackButtonElement {
  action_id: string;
  style?: "danger" | "primary";
  text: SlackPlainText;
  type: "button";
  value: string;
}

interface SlackContextBlock {
  elements: SlackMarkdownText[];
  type: "context";
}

/** A Block Kit wrapper that groups child blocks into a visually distinct card. */
export interface SlackContainerBlock {
  child_blocks: SlackBlock[];
  has_header_divider?: boolean;
  subtitle?: SlackPlainText | SlackMarkdownText;
  title: SlackPlainText;
  type: "container";
}

interface SlackDividerBlock {
  type: "divider";
}

interface SlackHeaderBlock {
  text: SlackPlainText;
  type: "header";
}

interface SlackSectionBlock {
  accessory?: SlackButtonElement;
  fields?: SlackMarkdownText[];
  text: SlackMarkdownText;
  type: "section";
}

interface SlackMarkdownText {
  text: string;
  type: "mrkdwn";
}

interface SlackPlainText {
  emoji: true;
  text: string;
  type: "plain_text";
}

interface SlackInputBlock {
  block_id: string;
  element: {
    action_id: string;
    initial_value?: string;
    type: "plain_text_input";
  };
  label: SlackPlainText;
  type: "input";
}
