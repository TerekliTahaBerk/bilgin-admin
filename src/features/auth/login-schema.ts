import { z } from "zod";

export const loginFormSchema = z.object({
  email: z
    .string()
    .min(1, "E-posta zorunludur.")
    .pipe(z.email("Geçerli bir e-posta adresi girin.")),
  password: z.string().min(1, "Şifre zorunludur."),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
