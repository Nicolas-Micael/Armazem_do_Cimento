// Formato dos dados aceitos nas rotas de pagamentos.
import { z } from "zod";
import { moneySchema, optionalText } from "../../lib/schemas.js";

export const PAYMENT_METHODS = ["CASH", "PIX", "CHECK", "DEPOSIT", "DEBIT_CARD", "CREDIT_CARD", "TRANSFER"] as const;

const dateSchema = z
  .string({ error: "Data inválida." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use o formato AAAA-MM-DD." })
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), { error: "Data inválida." });

const requiredText = (max: number, label: string) =>
  z
    .string({ error: `${label}: informe o texto.` })
    .trim()
    .min(1, { error: `${label}: campo obrigatório.` })
    .max(max, { error: `${label}: no máximo ${max} caracteres.` });

/** Registrar um pagamento. A situação inicial NÃO vem do cliente: o backend decide pelo meio (decisão 3). */
export const createPaymentSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS, { error: "Escolha o meio de pagamento." }),
    amount: moneySchema,
    /** Opcional para dinheiro (Caixa físico) e cheque (Carteira de cheques); obrigatória nos demais. */
    accountId: z.string().min(1).optional(),
    /** Padrão: hoje (Brasília). */
    receivedAt: dateSchema.optional(),
    notes: optionalText(500, "Observações"),
    check: z
      .object({
        number: requiredText(30, "Número do cheque"),
        bank: requiredText(60, "Banco do cheque"),
        expectedClearingDate: dateSchema,
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.method === "CHECK" && !value.check) {
      context.addIssue({ code: "custom", path: ["check"], message: "Informe número, banco e data prevista de compensação do cheque." });
    }
    if (value.method !== "CHECK" && value.check) {
      context.addIssue({ code: "custom", path: ["check"], message: "Dados de cheque só podem ser enviados para pagamento em cheque." });
    }
  });

export const confirmPaymentSchema = z.object({ note: optionalText(500, "Observação") });

/** Compensar cheque: a conta de destino é obrigatória (decisão 5). */
export const clearCheckSchema = z.object({
  accountId: z.string({ error: "Informe a conta de destino." }).min(1, { error: "Informe a conta de destino." }),
  note: optionalText(500, "Observação"),
});

/** Estorno: motivo obrigatório (decisão 6). */
export const reversePaymentSchema = z.object({
  reason: z
    .string({ error: "Informe o motivo do estorno." })
    .trim()
    .min(3, { error: "Informe o motivo do estorno (mínimo 3 caracteres)." })
    .max(500, { error: "Motivo: no máximo 500 caracteres." }),
});

/** Define os vencimentos de uma saída a prazo. */
export const setDueDatesSchema = z.object({
  dueDates: z
    .array(z.object({ dueDate: dateSchema, amount: moneySchema }), { error: "Informe os vencimentos." })
    .min(1, { error: "Informe pelo menos um vencimento." })
    .max(24, { error: "No máximo 24 vencimentos." }),
});

export const orderPaymentsParamsSchema = z.object({ id: z.string().min(1) });

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
export type ClearCheckInput = z.infer<typeof clearCheckSchema>;
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;
export type SetDueDatesInput = z.infer<typeof setDueDatesSchema>;
