import { z } from "zod";

export const combaCommandSchema = z.object({
  api_app_id: z.string().min(1),
  channel_id: z.string().min(1),
  channel_name: z.string().min(1),
  command: z.literal("/comba"),
  response_url: z.url(),
  team_domain: z.string().min(1),
  team_id: z.string().min(1),
  text: z.string(),
  trigger_id: z.string().min(1),
  user_id: z.string().min(1),
  user_name: z.string().min(1),
});

export type CombaCommand = z.infer<typeof combaCommandSchema>;
