-- Etapa D1: pagamentos, contas de recebimento, histórico e vencimentos.
-- Incremental: só cria tabelas novas. Nada existente é alterado ou apagado.

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'PIX', 'CHECK', 'DEPOSIT', 'DEBIT_CARD', 'CREDIT_CARD', 'TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'TO_CLEAR', 'CONFIRMED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReceivingAccountKind" AS ENUM ('BANK', 'CASH_BOX', 'CHECK_WALLET');

-- CreateTable
CREATE TABLE "receiving_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ReceivingAccountKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receiving_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "account_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "received_at" DATE NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "check_number" TEXT,
    "check_bank" TEXT,
    "check_expected_clearing" DATE,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_status_history" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "from_status" "PaymentStatus",
    "to_status" "PaymentStatus" NOT NULL,
    "from_account_id" TEXT,
    "to_account_id" TEXT,
    "changed_by_id" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "payment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_due_dates" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMPTZ(3),

    CONSTRAINT "order_due_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receiving_accounts_code_key" ON "receiving_accounts"("code");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_method_idx" ON "payments"("method");

-- CreateIndex
CREATE INDEX "payments_account_id_idx" ON "payments"("account_id");

-- CreateIndex
CREATE INDEX "payment_status_history_payment_id_idx" ON "payment_status_history"("payment_id");

-- CreateIndex
CREATE INDEX "order_due_dates_order_id_idx" ON "order_due_dates"("order_id");

-- CreateIndex
CREATE INDEX "order_due_dates_due_date_idx" ON "order_due_dates"("due_date");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "receiving_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_status_history" ADD CONSTRAINT "payment_status_history_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_status_history" ADD CONSTRAINT "payment_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_due_dates" ADD CONSTRAINT "order_due_dates_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_due_dates" ADD CONSTRAINT "order_due_dates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Regras de integridade que o Prisma não expressa.
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
-- Dados do cheque: obrigatórios no cheque e ausentes nos outros meios.
ALTER TABLE "payments" ADD CONSTRAINT "payments_check_fields_consistent" CHECK (
  (
    "method" = 'CHECK'
    AND "check_number" IS NOT NULL AND "check_bank" IS NOT NULL AND "check_expected_clearing" IS NOT NULL
  ) OR (
    "method" <> 'CHECK'
    AND "check_number" IS NULL AND "check_bank" IS NULL AND "check_expected_clearing" IS NULL
  )
);
-- Pagamento Confirmado sempre tem a data/hora da confirmação.
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_has_date" CHECK ("status" <> 'CONFIRMED' OR "confirmed_at" IS NOT NULL);
-- Estorno sempre tem motivo no histórico (coluna reason não nula quando to_status = REVERSED).
ALTER TABLE "payment_status_history" ADD CONSTRAINT "payment_history_reversal_has_reason" CHECK ("to_status" <> 'REVERSED' OR ("reason" IS NOT NULL AND length(trim("reason")) > 0));
ALTER TABLE "order_due_dates" ADD CONSTRAINT "order_due_dates_amount_positive" CHECK ("amount" > 0);

-- Contas de recebimento (cadastro de referência decidido em 25/11/2026; não são dados de teste).
INSERT INTO "receiving_accounts" ("id", "code", "name", "kind") VALUES
  (gen_random_uuid(), 'BRADESCO', 'Bradesco', 'BANK'),
  (gen_random_uuid(), 'CAIXA_ECONOMICA', 'Caixa Econômica Federal', 'BANK'),
  (gen_random_uuid(), 'CASH_BOX', 'Caixa físico da empresa', 'CASH_BOX'),
  (gen_random_uuid(), 'CHECK_WALLET', 'Carteira de cheques', 'CHECK_WALLET');

-- Saídas já confirmadas em prazo fixo (10/15/30 dias) ganham o vencimento calculado:
-- dia de registro (Brasília) + prazo. Só insere onde ainda não existe vencimento.
INSERT INTO "order_due_dates" ("id", "order_id", "sequence", "due_date", "amount", "created_by_id")
SELECT gen_random_uuid(), o."id", 1,
       ((o."created_at" AT TIME ZONE 'America/Sao_Paulo')::date +
         CASE o."payment_term" WHEN 'TERM_10_DAYS' THEN 10 WHEN 'TERM_15_DAYS' THEN 15 ELSE 30 END),
       o."total", o."created_by_id"
FROM "orders" o
WHERE o."status" IN ('CONFIRMED', 'PICKING', 'OUT_FOR_DELIVERY', 'COMPLETED')
  AND o."payment_term" IN ('TERM_10_DAYS', 'TERM_15_DAYS', 'TERM_30_DAYS')
  AND o."total" > 0
  AND NOT EXISTS (SELECT 1 FROM "order_due_dates" d WHERE d."order_id" = o."id");
