import { z } from "zod";

const slackIdentitySchema = z.object({
  id: z.string().min(1),
});

const blockInteractionSchema = z.object({
  actions: z
    .array(
      z.object({
        action_id: z.string().min(1),
        action_ts: z.string().min(1),
        block_id: z.string().min(1),
        value: z.string().optional(),
      }),
    )
    .min(1),
  channel: slackIdentitySchema,
  message: z.object({
    ts: z.string().min(1),
  }),
  response_url: z.url(),
  team: slackIdentitySchema,
  trigger_id: z.string().min(1),
  type: z.literal("block_actions"),
  user: slackIdentitySchema,
});

const viewSubmissionInteractionSchema = z.object({
  team: slackIdentitySchema,
  trigger_id: z.string().min(1),
  type: z.literal("view_submission"),
  user: slackIdentitySchema,
  view: z.object({
    callback_id: z.string().min(1),
    id: z.string().min(1),
    private_metadata: z.string(),
    state: z.object({
      values: z.record(z.string(), z.record(z.string(), z.unknown())),
    }),
  }),
});

export const combaInteractionSchema = z.discriminatedUnion("type", [
  blockInteractionSchema,
  viewSubmissionInteractionSchema,
]);

export type CombaInteraction = z.infer<typeof combaInteractionSchema>;
