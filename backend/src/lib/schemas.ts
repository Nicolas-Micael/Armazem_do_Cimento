// Peças de validação (Zod) reaproveitadas por vários módulos.
import { z } from "zod";

/**
 * Texto opcional: remove espaços das pontas e transforma texto vazio em
 * null. Na edição, enviar null (ou "") apaga o valor do campo.
 */
export function optionalText(maxLength: number, label: string) {
  return z
    .string({ error: `${label}: texto inválido.` })
    .trim()
    .max(maxLength, { error: `${label}: no máximo ${maxLength} caracteres.` })
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value)); // undefined continua undefined
}

/**
 * Dinheiro como TEXTO, com até 2 casas decimais e ponto: "38.90".
 * Nunca como número, para não haver erro de ponto flutuante.
 */
export const moneySchema = z
  .string({ error: "Informe o valor como texto, ex.: \"38.90\"." })
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, { error: "Valor inválido. Use números com até 2 casas decimais, ex.: 38.90." });

/** Filtro de situação usado nas listagens. */
export const statusFilterSchema = z.enum(["active", "inactive", "all"]).default("active");

/** Parâmetros de busca e paginação vindos da URL (?search=...&page=2). */
export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  status: statusFilterSchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
