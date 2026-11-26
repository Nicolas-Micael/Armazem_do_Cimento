// Formato dos dados aceitos pelas rotas de usuários (validação com Zod).
import { z } from "zod";

/**
 * Nome de usuário: 3 a 30 caracteres, letras minúsculas sem acento,
 * números, ponto, hífen ou sublinhado. Espaços nas pontas são removidos
 * e letras maiúsculas viram minúsculas ("Joao.Silva " → "joao.silva").
 */
export const usernameSchema = z
  .string({ error: "Informe o nome de usuário." })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, {
    error: "Use de 3 a 30 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.",
  });

/**
 * Regra mínima de senha: 8 a 128 caracteres.
 * PROVISÓRIA: pode ser ajustada quando a empresa definir uma política.
 */
export const passwordSchema = z
  .string({ error: "Informe a senha." })
  .min(8, { error: "A senha precisa ter pelo menos 8 caracteres." })
  .max(128, { error: "A senha pode ter no máximo 128 caracteres." });

const nameSchema = z
  .string({ error: "Informe o nome." })
  .trim()
  .min(2, { error: "O nome precisa ter pelo menos 2 caracteres." })
  .max(100, { error: "O nome pode ter no máximo 100 caracteres." });

const roleSchema = z.enum(["ADMIN", "FINANCEIRO"], { error: "Perfil inválido. Use ADMIN ou FINANCEIRO." });

export const createUserSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  role: roleSchema,
  temporaryPassword: passwordSchema,
});

/** Na edição, todos os campos são opcionais, mas pelo menos um é obrigatório. */
export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    role: roleSchema.optional(),
    active: z.boolean({ error: "Situação inválida." }).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { error: "Informe ao menos um campo para alterar." });

export const resetPasswordSchema = z.object({
  temporaryPassword: passwordSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
