// Registro de auditoria: guarda quem fez cada alteração importante.
//
// Recebe "db", que pode ser o prisma normal OU uma transação em andamento.
// Assim, a alteração e o seu registro de auditoria são gravados juntos:
// se um falhar, o outro também não é gravado.
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  /** Quem fez a ação. */
  userId: string;
  /** O que foi feito, ex.: "user.create". */
  action: string;
  entityType: string;
  entityId: string;
  /** Situação antes da alteração (NUNCA incluir senhas ou hashes). */
  before?: Prisma.InputJsonValue;
  /** Situação depois da alteração (NUNCA incluir senhas ou hashes). */
  after?: Prisma.InputJsonValue;
}

export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({ data: entry });
}
