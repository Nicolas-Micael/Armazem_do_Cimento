// Formato dos dados aceitos nas rotas de produtos.
import { z } from "zod";
import { moneySchema, optionalText } from "../../lib/schemas.js";

/** Preço de tabela: texto com até 2 casas decimais, maior que zero. */
const priceSchema = moneySchema.refine((value) => Number(value.replace(".", "")) > 0, {
  error: "O preço precisa ser maior que zero.",
});
// (A comparação acima só confere se o texto não é "0" ou "0.00"; nenhuma
// conta com o preço é feita em ponto flutuante.)

const productFields = {
  name: z
    .string({ error: "Informe o nome do produto." })
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres." })
    .max(150, { error: "O nome pode ter no máximo 150 caracteres." }),
  brand: optionalText(100, "Marca"),
  cementType: optionalText(50, "Tipo de cimento"),
  currentPrice: priceSchema,
};

export const createProductSchema = z.object(productFields);

export const updateProductSchema = z
  .object({
    ...productFields,
    name: productFields.name.optional(),
    currentPrice: priceSchema.optional(),
    active: z.boolean({ error: "Situação inválida." }).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    error: "Informe ao menos um campo para alterar.",
  });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
