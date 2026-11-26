// Formato dos dados aceitos nas rotas de clientes.
import { z } from "zod";
import { isValidCpfOrCnpj, onlyDigits } from "../../lib/document.js";
import { optionalText } from "../../lib/schemas.js";

// ATENÇÃO nas transformações abaixo: "undefined" (campo não enviado) é
// mantido como undefined, para que uma edição parcial NÃO apague campos
// que não vieram na requisição. Já "" ou null apagam o valor.

/**
 * CPF/CNPJ: opcional por enquanto (pergunta P-CLI-2). Aceita com ou sem
 * pontuação e guarda só os números. Se informado, precisa ser válido.
 */
const documentSchema = z
  .string({ error: "CPF/CNPJ inválido." })
  .nullable()
  .optional()
  .transform((value) => (value === undefined ? undefined : value ? onlyDigits(value) : null))
  .refine((value) => value == null || isValidCpfOrCnpj(value), {
    error: "CPF ou CNPJ inválido. Confira os números.",
  });

const stateSchema = z
  .string({ error: "UF inválida." })
  .trim()
  .toUpperCase()
  .nullable()
  .optional()
  .transform((value) => (value === undefined ? undefined : value || null))
  .refine((value) => value == null || /^[A-Z]{2}$/.test(value), { error: "UF deve ter 2 letras, ex.: SP." });

const zipCodeSchema = z
  .string({ error: "CEP inválido." })
  .nullable()
  .optional()
  .transform((value) => (value === undefined ? undefined : value ? onlyDigits(value) : null))
  .refine((value) => value == null || value.length === 8, { error: "CEP deve ter 8 números." });

const phoneSchema = z
  .string({ error: "Telefone inválido." })
  .nullable()
  .optional()
  .transform((value) => (value === undefined ? undefined : value ? onlyDigits(value) : null))
  .refine((value) => value == null || (value.length >= 10 && value.length <= 11), {
    error: "Telefone deve ter DDD + número (10 ou 11 dígitos).",
  });

const customerFields = {
  name: z
    .string({ error: "Informe o nome ou razão social." })
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres." })
    .max(150, { error: "O nome pode ter no máximo 150 caracteres." }),
  document: documentSchema,
  phone: phoneSchema,
  street: optionalText(150, "Logradouro"),
  number: optionalText(20, "Número"),
  complement: optionalText(100, "Complemento"),
  district: optionalText(100, "Bairro"),
  city: optionalText(100, "Cidade"),
  state: stateSchema,
  zipCode: zipCodeSchema,
  notes: optionalText(1000, "Observações"),
};

export const createCustomerSchema = z.object(customerFields);

/** Na edição, todos os campos são opcionais; "active" ativa/desativa. */
export const updateCustomerSchema = z
  .object({
    ...customerFields,
    name: customerFields.name.optional(),
    active: z.boolean({ error: "Situação inválida." }).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: "Informe ao menos um campo para alterar.",
  });

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
