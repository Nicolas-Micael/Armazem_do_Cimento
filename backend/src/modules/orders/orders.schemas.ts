// Formato dos dados aceitos nas rotas de pedidos.
import { z } from "zod";
import { moneySchema, optionalText } from "../../lib/schemas.js";

const discountSchema = z
  .object({
    type: z.enum(["FIXED", "PERCENTAGE"], { error: "Tipo de desconto inválido." }),
    value: moneySchema,
  })
  .nullable()
  .optional();

const itemSchema = z.object({
  productId: z.string({ error: "Escolha o produto." }).min(1, { error: "Escolha o produto." }),
  // Sacos inteiros (provisório, P-PED-4).
  quantity: z
    .number({ error: "Informe a quantidade." })
    .int({ error: "A quantidade deve ser um número inteiro de sacos." })
    .min(1, { error: "A quantidade deve ser maior que zero." })
    .max(1_000_000, { error: "Quantidade muito alta." }),
  // Opcional: se não vier, usa o preço de tabela do produto.
  // ADM e Financeiro podem informar outro valor, sem limite (decisão de 26/11/2026).
  unitPrice: moneySchema.optional(),
  // Desconto só deste item (R$ ou %). Sem desconto: null ou ausente.
  discount: discountSchema,
});

/** Data no formato AAAA-MM-DD (ex.: 2026-11-30). */
const dateSchema = z
  .string({ error: "Data inválida." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use o formato AAAA-MM-DD." })
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), { error: "Data inválida." })
  .nullable()
  .optional();

/** Partes que entram no cálculo (usadas também na pré-visualização). */
const calculationFields = {
  items: z
    .array(itemSchema, { error: "Informe os itens do pedido." })
    .min(1, { error: "O pedido precisa ter pelo menos um item." })
    .max(100, { error: "O pedido pode ter no máximo 100 itens." }),
  freightAmount: moneySchema.optional().default("0"),
  discount: discountSchema,
};

const orderFields = {
  customerId: z.string({ error: "Escolha o cliente." }).min(1, { error: "Escolha o cliente." }),
  ...calculationFields,
  paymentTerm: z.enum(["IMMEDIATE", "TERM_10_DAYS", "TERM_15_DAYS", "TERM_30_DAYS", "NEGOTIATED"], {
    error: "Escolha a condição de pagamento.",
  }),
  deliveryMode: z.enum(["DELIVERY", "PICKUP"], { error: "Escolha entrega ou retirada." }),
  deliveryAddress: optionalText(300, "Endereço de entrega"),
  /** Tipo de operação: só "Venda" por enquanto (a lista cresce quando houver novos tipos). */
  operationType: z.enum(["SALE"], { error: "Tipo de operação inválido." }).optional().default("SALE"),
  deliveryResponsible: optionalText(100, "Responsável pelo transporte"),
  driverName: optionalText(100, "Motorista"),
  helperName: optionalText(100, "Ajudante"),
  vehicle: optionalText(100, "Veículo"),
  // Placa em maiúsculas; sem validação de formato (decisão provisória P-C-3).
  licensePlate: optionalText(10, "Placa").transform((value) => (value ? value.toUpperCase() : value)),
  loadedBags: z
    .number({ error: "Sacos carregados: informe um número." })
    .int({ error: "Sacos carregados: use um número inteiro." })
    .min(0, { error: "Sacos carregados não pode ser negativo." })
    .max(1_000_000, { error: "Sacos carregados: valor muito alto." })
    .nullable()
    .optional(),
  expectedDeliveryDate: dateSchema,
  deliveryNotes: optionalText(1000, "Observações da entrega"),
  notes: optionalText(1000, "Observações"),
};

export const previewOrderSchema = z.object(calculationFields);
export const createOrderSchema = z.object(orderFields);

/** Edição: os mesmos campos + a versão que a pessoa estava vendo. */
export const updateOrderSchema = z.object({
  ...orderFields,
  version: z.number({ error: "Versão do pedido ausente." }).int(),
});

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use a data no formato AAAA-MM-DD." })
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()), { error: "Data inválida." })
  .optional();

export const ORDER_SORT_FIELDS = ["number", "createdAt", "customer", "total", "status"] as const;

/** Filtros, ordenação e paginação da lista de saídas (?status=&from=&to=&customerId=&productId=&paymentTerm=&sortBy=&sortDir=). */
export const orderListQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional().default(""),
    status: z
      .enum(["PENDING", "CONFIRMED", "PICKING", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED", "all"])
      .default("all"),
    // Período pela data de registro, em dias inteiros no horário de Brasília (P-DASH-1).
    from: optionalDate,
    to: optionalDate,
    customerId: z.string().trim().min(1).optional(),
    productId: z.string().trim().min(1).optional(),
    paymentTerm: z.enum(["IMMEDIATE", "TERM_10_DAYS", "TERM_15_DAYS", "TERM_30_DAYS", "NEGOTIATED", "all"]).default("all"),
    paymentMethod: z.enum(["CASH", "PIX", "CHECK", "DEPOSIT", "DEBIT_CARD", "CREDIT_CARD", "TRANSFER", "all"]).default("all"),
    sortBy: z.enum(ORDER_SORT_FIELDS).default("number"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    error: "A data inicial não pode ser depois da data final.",
    path: ["from"],
  });

export type PreviewOrderInput = z.infer<typeof previewOrderSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/**
 * Confirmar uma saída. A `version` é a que a pessoa estava vendo na tela: se o pedido
 * foi editado depois disso, a confirmação é recusada (ninguém confirma valores que não viu).
 */
export const confirmOrderSchema = z.object({
  version: z.number({ error: "Informe a versão do pedido." }).int().min(1),
  note: optionalText(500, "Observação"),
});

export type ConfirmOrderInput = z.infer<typeof confirmOrderSchema>;
