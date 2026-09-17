import { z } from "zod";

import { adminAbilitiesSchema } from "@/contracts/admin/auth";

export const safeAdminSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  email: z.email(),
  role: z.string().trim().min(1),
  roleLabel: z.string().trim().min(1),
  abilities: adminAbilitiesSchema,
});

export type SafeAdmin = z.infer<typeof safeAdminSchema>;
