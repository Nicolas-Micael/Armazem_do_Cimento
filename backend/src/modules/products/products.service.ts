// Regras de negócio dos produtos.
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import type { ListQuery } from "../../lib/schemas.js";
import { recordAudit } from "../audit/audit.service.js";
import { productAuditSnapshot, toPublicProduct } from "./products.mapper.js";
import type { CreateProductInput, UpdateProductInput } from "./products.schemas.js";

/** Lista produtos com busca por nome, marca ou tipo, e paginação. */
export async function listProducts(query: ListQuery) {
  const where: Prisma.ProductWhereInput = {
    ...(query.status === "active" && { active: true }),
    ...(query.status === "inactive" && { active: false }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { brand: { contains: query.search, mode: "insensitive" } },
        { cementType: { contains: query.search, mode: "insensitive" } },
      ],
    }),
  };

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { products: products.map(toPublicProduct), total, page: query.page, pageSize: query.pageSize };
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new NotFoundError("Produto não encontrado.");
  return toPublicProduct(product);
}

/**
 * Cadastra um produto. O preço chega como texto ("38.90") e o Prisma o
 * grava na coluna DECIMAL sem passar por ponto flutuante.
 */
export async function createProduct(actorId: string, input: CreateProductInput) {
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({ data: input });
    await recordAudit(tx, {
      userId: actorId,
      action: "product.create",
      entityType: "product",
      entityId: created.id,
      after: productAuditSnapshot(created),
    });
    return created;
  });
  return toPublicProduct(product);
}

/**
 * Altera um produto, inclusive o preço e a situação.
 *
 * Mudar o preço aqui NÃO altera pedidos já feitos: cada pedido guarda
 * a própria cópia do preço (etapa 5). Cada mudança de preço também gera
 * um registro "product.price_change" na auditoria, que forma o
 * histórico de preços do produto.
 */
export async function updateProduct(actorId: string, id: string, input: UpdateProductInput) {
  const product = await prisma.$transaction(async (tx) => {
    const current = await tx.product.findUnique({ where: { id } });
    if (!current) throw new NotFoundError("Produto não encontrado.");

    const updated = await tx.product.update({ where: { id }, data: input });

    await recordAudit(tx, {
      userId: actorId,
      action: "product.update",
      entityType: "product",
      entityId: id,
      before: productAuditSnapshot(current),
      after: productAuditSnapshot(updated),
    });

    // .equals compara os decimais exatamente (38.9 é igual a 38.90).
    if (!current.currentPrice.equals(updated.currentPrice)) {
      await recordAudit(tx, {
        userId: actorId,
        action: "product.price_change",
        entityType: "product",
        entityId: id,
        before: { currentPrice: current.currentPrice.toFixed(2) },
        after: { currentPrice: updated.currentPrice.toFixed(2) },
      });
    }

    return updated;
  });
  return toPublicProduct(product);
}

/** Histórico de preços do produto, do mais recente para o mais antigo. */
export async function getPriceHistory(id: string) {
  const exists = await prisma.product.count({ where: { id } });
  if (!exists) throw new NotFoundError("Produto não encontrado.");

  const logs = await prisma.auditLog.findMany({
    where: { entityType: "product", entityId: id, action: { in: ["product.create", "product.price_change"] } },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  });

  return logs.map((log) => ({
    changedAt: log.createdAt.toISOString(),
    changedBy: log.user.name,
    previousPrice: (log.before as { currentPrice?: string } | null)?.currentPrice ?? null,
    newPrice: (log.after as { currentPrice?: string } | null)?.currentPrice ?? null,
  }));
}
