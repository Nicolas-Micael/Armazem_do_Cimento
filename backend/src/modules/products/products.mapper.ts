import type { Product } from "../../generated/prisma/client.js";

/**
 * Formato do produto enviado pela API. Valores decimais viram TEXTO
 * ("38.90"), para o frontend nunca fazer contas com ponto flutuante.
 */
export function toPublicProduct(product: Product) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    cementType: product.cementType,
    bagWeightKg: product.bagWeightKg?.toString() ?? null,
    unit: product.unit,
    currentPrice: product.currentPrice.toFixed(2),
    active: product.active,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export function productAuditSnapshot(product: Product) {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = toPublicProduct(product);
  return rest;
}
