-- Produto não tem peso do saco (decisão de Nicolas, 26/11/2026 — pergunta P-PRO-2).
-- A coluna é removida com segurança: ainda não existe banco de produção.

-- AlterTable
ALTER TABLE "products" DROP COLUMN "bag_weight_kg";

