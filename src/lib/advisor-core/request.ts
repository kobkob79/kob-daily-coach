import { z } from "zod";
import { ADVISOR_IDS } from "./types";

export const advisorChatRequestSchema = z.object({
  advisor_id: z.enum(ADVISOR_IDS),
  message: z.string().trim().min(1).max(4_000),
  conversation_id: z.string().trim().min(1).max(128).optional(),
});

export type AdvisorChatRequest = z.infer<typeof advisorChatRequestSchema>;
