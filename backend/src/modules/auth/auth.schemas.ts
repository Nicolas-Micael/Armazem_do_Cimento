import { z } from "zod";
import { passwordSchema } from "../users/users.schemas.js";

export const loginSchema = z.object({
  // No login não aplicamos as regras de formato: basta não estar vazio.
  // Assim a mensagem de erro é sempre a mesma ("usuário ou senha inválidos").
  username: z.string({ error: "Informe o nome de usuário." }).trim().toLowerCase().min(1, { error: "Informe o nome de usuário." }),
  password: z.string({ error: "Informe a senha." }).min(1, { error: "Informe a senha." }),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ error: "Informe a senha atual." }).min(1, { error: "Informe a senha atual." }),
    newPassword: passwordSchema,
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    error: "A nova senha precisa ser diferente da atual.",
    path: ["newPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
