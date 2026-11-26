-- Etapa C1: prazo de 30 dias, tipo de operação, desconto por item e logística.
-- Incremental: só acrescenta valores e colunas (com padrão), não apaga nada.

-- CreateEnum
CREATE TYPE "OrderOperationType" AS ENUM ('SALE');

-- AlterEnum
ALTER TYPE "PaymentTerm" ADD VALUE 'TERM_30_DAYS';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discount_type" "DiscountType",
ADD COLUMN     "discount_value" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "driver_name" TEXT,
ADD COLUMN     "helper_name" TEXT,
ADD COLUMN     "license_plate" TEXT,
ADD COLUMN     "loaded_bags" INTEGER,
ADD COLUMN     "operation_type" "OrderOperationType" NOT NULL DEFAULT 'SALE',
ADD COLUMN     "vehicle" TEXT;


-- Integridade (manual: o Prisma não gera CHECK).
-- O desconto do item não é negativo nem passa do valor bruto do item, e o total do item
-- é sempre bruto − desconto. Pedidos antigos têm desconto 0 e já satisfazem a regra.
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_discount_valid"
  CHECK ("discount_amount" >= 0 AND "discount_amount" <= "quantity" * "unit_price");
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_line_total_consistent"
  CHECK ("line_total" = ROUND("quantity" * "unit_price", 2) - "discount_amount");
ALTER TABLE "orders" ADD CONSTRAINT "orders_loaded_bags_non_negative"
  CHECK ("loaded_bags" IS NULL OR "loaded_bags" >= 0);
