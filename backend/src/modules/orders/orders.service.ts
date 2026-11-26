// Regras de negócio dos pedidos (etapa 5: criar, consultar e editar pendentes).
import type { Prisma, Product } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { Decimal } from "../../lib/money.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { recordAudit } from "../audit/audit.service.js";
import { startOfBusinessDay, startOfNextBusinessDay } from "../../lib/businessDate.js";
import { EFFECTIVE_STATUSES } from "../dashboard/dashboard.service.js";
import { createFixedTermDueDate } from "../payments/dueDates.service.js";
import { calculateOrderTotals } from "./orders.calculations.js";
import { orderAuditSnapshot, orderInclude, toPublicOrder } from "./orders.mapper.js";
import type { ConfirmOrderInput, CreateOrderInput, OrderListQuery, PreviewOrderInput, UpdateOrderInput } from "./orders.schemas.js";

type Tx = Prisma.TransactionClient;

/** "2026-11-30" → Date à meia-noite UTC (o banco guarda só a data). */
function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00Z`) : null;
}

/**
 * Busca os produtos dos itens e confere se podem ser usados.
 * Produto inativo não entra em pedido novo; na edição, só é aceito se já
 * estava no pedido (para não obrigar a remover um item antigo).
 */
async function loadProducts(db: Tx | typeof prisma, productIds: string[], alreadyInOrder: Set<string> = new Set()) {
  const unique = [...new Set(productIds)];
  const products = await db.product.findMany({ where: { id: { in: unique } } });
  const byId = new Map(products.map((product) => [product.id, product]));

  const details: { field: string; message: string }[] = [];
  productIds.forEach((id, index) => {
    const product = byId.get(id);
    if (!product) {
      details.push({ field: `items.${index}.productId`, message: "Produto não encontrado." });
    } else if (!product.active && !alreadyInOrder.has(id)) {
      details.push({ field: `items.${index}.productId`, message: `O produto "${product.name}" está inativo.` });
    }
  });
  if (details.length > 0) throw new ValidationError("Há itens com produtos inválidos.", details);

  return byId;
}

/**
 * Monta os itens com os preços e calcula os valores do pedido.
 * Se o preço praticado não for informado, usa o preço de tabela.
 */
function buildItemsAndTotals(input: PreviewOrderInput, products: Map<string, Product>) {
  const items = input.items.map((item, index) => {
    const product = products.get(item.productId)!;
    return {
      position: index + 1,
      product,
      quantity: item.quantity,
      catalogUnitPrice: product.currentPrice,
      unitPrice: item.unitPrice !== undefined ? new Decimal(item.unitPrice) : new Decimal(product.currentPrice.toString()),
      discount: item.discount ? { type: item.discount.type, value: new Decimal(item.discount.value) } : null,
    };
  });

  const totals = calculateOrderTotals({
    items,
    freightAmount: new Decimal(input.freightAmount),
    discount: input.discount ? { type: input.discount.type, value: new Decimal(input.discount.value) } : null,
  });

  return { items, totals };
}

/** Dados do pedido (sem os itens) prontos para gravar. */
function orderData(input: CreateOrderInput, totals: ReturnType<typeof buildItemsAndTotals>["totals"]) {
  return {
    subtotal: totals.subtotal.toFixed(2),
    freightAmount: totals.freightAmount.toFixed(2),
    discountType: input.discount?.type ?? null,
    discountValue: input.discount?.value ?? null,
    discountAmount: totals.discountAmount.toFixed(2),
    total: totals.total.toFixed(2),
    operationType: input.operationType,
    paymentTerm: input.paymentTerm,
    deliveryMode: input.deliveryMode,
    deliveryAddress: input.deliveryAddress ?? null,
    deliveryResponsible: input.deliveryResponsible ?? null,
    driverName: input.driverName ?? null,
    helperName: input.helperName ?? null,
    vehicle: input.vehicle ?? null,
    licensePlate: input.licensePlate ?? null,
    loadedBags: input.loadedBags ?? null,
    expectedDeliveryDate: toDate(input.expectedDeliveryDate),
    deliveryNotes: input.deliveryNotes ?? null,
    notes: input.notes ?? null,
  };
}

function itemRows(built: ReturnType<typeof buildItemsAndTotals>) {
  return built.items.map((item, index) => ({
    position: item.position,
    productId: item.product.id,
    productNameSnapshot: item.product.name,
    unit: item.product.unit,
    quantity: item.quantity,
    catalogUnitPrice: item.catalogUnitPrice.toFixed(2),
    unitPrice: item.unitPrice.toFixed(2),
    discountType: item.discount?.type ?? null,
    discountValue: item.discount ? item.discount.value.toFixed(2) : null,
    discountAmount: built.totals.lineDiscounts[index]!.toFixed(2),
    lineTotal: built.totals.lineTotals[index]!.toFixed(2),
  }));
}

async function loadCustomer(db: Tx, customerId: string, allowInactive: boolean) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw new ValidationError("Cliente não encontrado.", [{ field: "customerId", message: "Cliente não encontrado." }]);
  }
  if (!customer.active && !allowInactive) {
    throw new ValidationError("Este cliente está inativo.", [
      { field: "customerId", message: `O cliente "${customer.name}" está inativo.` },
    ]);
  }
  return customer;
}

/** Calcula os valores sem salvar nada (a tela usa enquanto a pessoa digita). */
export async function previewOrder(input: PreviewOrderInput) {
  const products = await loadProducts(prisma, input.items.map((item) => item.productId));
  const { items, totals } = buildItemsAndTotals(input, products);
  return {
    items: items.map((item, index) => ({
      productId: item.product.id,
      catalogUnitPrice: item.catalogUnitPrice.toFixed(2),
      unitPrice: item.unitPrice.toFixed(2),
      grossTotal: totals.lineGrossTotals[index]!.toFixed(2),
      discountAmount: totals.lineDiscounts[index]!.toFixed(2),
      lineTotal: totals.lineTotals[index]!.toFixed(2),
    })),
    grossSubtotal: totals.grossSubtotal.toFixed(2),
    itemDiscountsTotal: totals.itemDiscountsTotal.toFixed(2),
    subtotal: totals.subtotal.toFixed(2),
    freightAmount: totals.freightAmount.toFixed(2),
    discountAmount: totals.discountAmount.toFixed(2),
    totalDiscounts: totals.totalDiscounts.toFixed(2),
    total: totals.total.toFixed(2),
  };
}

/**
 * Cria um pedido "Pendente". Tudo numa transação: pedido, itens, primeiro
 * registro do histórico de status e auditoria. Se algo falhar, nada fica gravado.
 */
export async function createOrder(actorId: string, input: CreateOrderInput) {
  const order = await prisma.$transaction(async (tx) => {
    const customer = await loadCustomer(tx, input.customerId, false);
    const products = await loadProducts(tx, input.items.map((item) => item.productId));
    const built = buildItemsAndTotals(input, products);

    const created = await tx.order.create({
      data: {
        ...orderData(input, built.totals),
        customerId: customer.id,
        customerNameSnapshot: customer.name,
        customerDocumentSnapshot: customer.document,
        createdById: actorId,
        items: { create: itemRows(built) },
        statusHistory: { create: { toStatus: "PENDING", changedById: actorId } },
      },
      include: orderInclude,
    });

    await recordAudit(tx, {
      userId: actorId,
      action: "order.create",
      entityType: "order",
      entityId: created.id,
      after: orderAuditSnapshot(created),
    });
    return created;
  });
  return toPublicOrder(order);
}

/**
 * Edita um pedido. Nesta etapa só pedidos "Pendente" podem ser editados
 * (a edição em outros status depende das regras da etapa 6).
 *
 * Usa a "versão" do pedido: se outra pessoa salvou o pedido depois que
 * você o abriu, a sua gravação é recusada para não apagar a alteração dela.
 */
export async function updateOrder(actorId: string, id: string, input: UpdateOrderInput) {
  const order = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id }, include: orderInclude });
    if (!current) throw new NotFoundError("Pedido não encontrado.");
    if (current.status !== "PENDING") {
      throw new ConflictError("Só pedidos pendentes podem ser editados.");
    }
    if (current.version !== input.version) {
      throw new ConflictError("Este pedido foi alterado por outra pessoa. Recarregue a página e confira antes de salvar.");
    }

    const sameCustomer = current.customerId === input.customerId;
    const customer = await loadCustomer(tx, input.customerId, sameCustomer);
    const products = await loadProducts(
      tx,
      input.items.map((item) => item.productId),
      new Set(current.items.map((item) => item.productId)),
    );
    const built = buildItemsAndTotals(input, products);

    // Grava só se a versão ainda for a mesma E o pedido ainda estiver Pendente (proteção contra
    // duas gravações simultâneas, inclusive uma confirmação no meio da edição).
    const { count } = await tx.order.updateMany({
      where: { id, version: input.version, status: "PENDING" },
      data: {
        ...orderData(input, built.totals),
        customerId: customer.id,
        customerNameSnapshot: customer.name,
        customerDocumentSnapshot: customer.document,
        version: { increment: 1 },
      },
    });
    if (count === 0) {
      throw new ConflictError("Este pedido foi alterado por outra pessoa. Recarregue a página e confira antes de salvar.");
    }

    // Os itens de um pedido pendente são substituídos pelos novos. O
    // conteúdo anterior completo fica guardado na auditoria ("before").
    await tx.orderItem.deleteMany({ where: { orderId: id } });
    await tx.orderItem.createMany({ data: itemRows(built).map((row) => ({ ...row, orderId: id })) });

    const updated = await tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
    await recordAudit(tx, {
      userId: actorId,
      action: "order.update",
      entityType: "order",
      entityId: id,
      before: orderAuditSnapshot(current),
      after: orderAuditSnapshot(updated),
    });
    return updated;
  });
  return toPublicOrder(order);
}

export async function getOrder(id: string) {
  const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) throw new NotFoundError("Pedido não encontrado.");
  return toPublicOrder(order);
}

/**
 * Lista pedidos, do mais recente para o mais antigo.
 * A busca aceita o número ("123" ou "PED-000123") ou parte do nome do cliente.
 */
/** Ordenação permitida na lista (lista fixa: nunca montamos "orderBy" com texto vindo da URL). */
function listOrderBy(query: OrderListQuery): Prisma.OrderOrderByWithRelationInput[] {
  const field: Record<OrderListQuery["sortBy"], Prisma.OrderOrderByWithRelationInput> = {
    number: { number: query.sortDir },
    createdAt: { createdAt: query.sortDir },
    customer: { customerNameSnapshot: query.sortDir },
    total: { total: query.sortDir },
    status: { status: query.sortDir },
  };
  // Desempate pelo número, para a ordem não "pular" entre páginas.
  return query.sortBy === "number" ? [field.number] : [field[query.sortBy], { number: "desc" }];
}

/** Soma de um conjunto de saídas: quantidade, sacos e valor (calculado no banco, sobre o filtro inteiro). */
async function summarize(where: Prisma.OrderWhereInput) {
  const [orders, items] = await Promise.all([
    prisma.order.aggregate({ where, _count: true, _sum: { total: true } }),
    prisma.orderItem.aggregate({ where: { order: where }, _sum: { quantity: true } }),
  ]);
  return {
    ordersCount: orders._count,
    bagsSold: items._sum.quantity ?? 0,
    total: new Decimal(orders._sum.total?.toString() ?? "0").toFixed(2),
  };
}

/**
 * Lista saídas com filtros, ordenação e paginação. Os totalizadores valem para o
 * filtro INTEIRO (não só para a página atual) e separam as saídas efetivadas das pendentes;
 * canceladas não entram em nenhum dos dois grupos.
 */
export async function listOrders(query: OrderListQuery) {
  const numberMatch = /^(?:ped-?)?0*(\d{1,9})$/i.exec(query.search);
  const where: Prisma.OrderWhereInput = {
    ...(query.status !== "all" && { status: query.status }),
    ...(query.paymentTerm !== "all" && { paymentTerm: query.paymentTerm }),
    // Forma de pagamento: saídas com pelo menos um pagamento ativo (não estornado) desse meio.
    ...(query.paymentMethod !== "all" && { payments: { some: { method: query.paymentMethod, status: { not: "REVERSED" as const } } } }),
    ...(query.customerId && { customerId: query.customerId }),
    ...(query.productId && { items: { some: { productId: query.productId } } }),
    ...((query.from || query.to) && {
      createdAt: {
        ...(query.from && { gte: startOfBusinessDay(query.from) }),
        ...(query.to && { lt: startOfNextBusinessDay(query.to) }),
      },
    }),
    ...(query.search && {
      OR: [
        { customerNameSnapshot: { contains: query.search, mode: "insensitive" } },
        ...(numberMatch ? [{ number: Number(numberMatch[1]) }] : []),
      ],
    }),
  };

  const [orders, total, effective, pending] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: listOrderBy(query),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: orderInclude,
    }),
    prisma.order.count({ where }),
    summarize({ AND: [where, { status: { in: [...EFFECTIVE_STATUSES] } }] }),
    summarize({ AND: [where, { status: "PENDING" }] }),
  ]);

  // Recebido (só pagamentos Confirmados) e saldo a receber de cada saída da página.
  const confirmed = await prisma.payment.groupBy({
    by: ["orderId"],
    where: { orderId: { in: orders.map((order) => order.id) }, status: "CONFIRMED" },
    _sum: { amount: true },
  });
  const receivedByOrder = new Map(confirmed.map((row) => [row.orderId, new Decimal(row._sum.amount?.toString() ?? "0")]));

  return {
    orders: orders.map((order) => {
      const received = receivedByOrder.get(order.id) ?? new Decimal(0);
      const effective = (EFFECTIVE_STATUSES as readonly string[]).includes(order.status);
      return {
        ...toPublicOrder(order),
        received: received.toFixed(2),
        // Pendente e Cancelada não têm saldo a receber.
        balance: effective ? new Decimal(order.total.toString()).minus(received).toFixed(2) : null,
      };
    }),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totals: { effective, pending },
  };
}

/**
 * Confirma uma saída: Pendente → Confirmado (só ADM; a rota já barra os outros perfis).
 *
 * Garantias:
 * - só pedido Pendente pode ser confirmado (não confirma duas vezes nem um cancelado);
 * - a `version` enviada precisa ser a atual: os valores confirmados são os que a pessoa viu;
 * - a mudança, o registro no histórico de status e a auditoria acontecem juntos (transação);
 * - os valores do pedido NÃO são alterados aqui. Depois de confirmado o pedido não é mais
 *   editável (updateOrder só aceita Pendente), então nenhum valor muda sem deixar registro.
 */
export async function confirmOrder(actorId: string, id: string, input: ConfirmOrderInput) {
  const order = await prisma.$transaction(async (tx) => {
    const current = await tx.order.findUnique({ where: { id }, include: orderInclude });
    if (!current) throw new NotFoundError("Pedido não encontrado.");
    if (current.status !== "PENDING") {
      throw new ConflictError("Só pedidos pendentes podem ser confirmados.");
    }
    if (current.version !== input.version) {
      throw new ConflictError("Este pedido foi alterado por outra pessoa. Recarregue a página e confira antes de confirmar.");
    }

    // O "where" com status e versão faz a troca só acontecer se nada mudou desde a leitura.
    const { count } = await tx.order.updateMany({
      where: { id, version: input.version, status: "PENDING" },
      data: { status: "CONFIRMED", version: { increment: 1 } },
    });
    if (count === 0) {
      throw new ConflictError("Este pedido foi alterado por outra pessoa. Recarregue a página e confira antes de confirmar.");
    }

    await tx.orderStatusHistory.create({
      data: { orderId: id, fromStatus: "PENDING", toStatus: "CONFIRMED", changedById: actorId, note: input.note ?? null },
    });

    // Prazo de 10/15/30 dias: o vencimento nasce junto com a confirmação (decisão 11 da etapa D).
    await createFixedTermDueDate(tx, current, actorId);

    const confirmed = await tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude });
    await recordAudit(tx, {
      userId: actorId,
      action: "order.confirm",
      entityType: "order",
      entityId: id,
      before: orderAuditSnapshot(current),
      after: orderAuditSnapshot(confirmed),
    });
    return confirmed;
  });
  return toPublicOrder(order);
}
