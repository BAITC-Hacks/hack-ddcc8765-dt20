import { z } from "zod";

const webUrl = z
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
  .nullable();
export const teamProfileSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  interests: z.array(z.string()),
  skills: z.array(z.string()),
  technologies: z.array(z.string()),
});
export const teamSchema = teamProfileSchema.extend({
  xp: z.number().int().nonnegative(),
});
export type TeamProfile = z.infer<typeof teamProfileSchema>;
export type Team = z.infer<typeof teamSchema>;
export const proposalSchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  teamId: z.uuid(),
  idea: z.string().trim().min(1).max(4000),
  plan: z.string().trim().min(1).max(8000),
  deadline: z.string().trim().min(1).max(1000),
  prototypeUrl: webUrl,
  status: z.enum(["pending", "accepted", "rejected"]),
  resultDescription: z.string().max(8000).nullable(),
  resultUrl: webUrl,
  stageConfirmedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Proposal = z.infer<typeof proposalSchema>;
