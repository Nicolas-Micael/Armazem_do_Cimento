// Regras de negócio dos clientes.
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { onlyDigits } from "../../lib/document.js";
import type { ListQuery } from "../../lib/schemas.js";
import { recordAudit } from "../audit/audit.service.js";
import { customerAuditSnapshot, toPublicCustomer } from "./customers.mapper.js";
import type { CreateCustomerInput, UpdateCustomerInput } from "./customers.schemas.js";

/** Traduz o erro de "valor único repetido" do banco numa mensagem clara. */
function handleDuplicateDocument(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ConflictError("Já existe um cliente cadastrado com este CPF/CNPJ.");
  }
  throw error;
}

/**
 * Lista clientes com busca por nome, CPF/CNPJ ou telefone e paginação.
 * Retorna a página pedida e o total de resultados.
 */
export async function listCustomers(query: ListQuery) {
  const digits = onlyDigits(query.search);
  const where: Prisma.CustomerWhereInput = {
    ...(query.status === "active" && { active: true }),
    ...(query.status === "inactive" && { active: false }),
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ document: { contains: digits } }, { phone: { contains: digits } }] : []),
      ],
    }),
  };

  // As duas consultas rodam juntas: a página de resultados e a contagem total.
  const [customers, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return { customers: customers.map(toPublicCustomer), total, page: query.page, pageSize: query.pageSize };
}

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw new NotFoundError("Cliente não encontrado.");
  return toPublicCustomer(customer);
}

export async function createCustomer(actorId: string, input: CreateCustomerInput) {
  try {
    const customer = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({ data: input });
      await recordAudit(tx, {
        userId: actorId,
        action: "customer.create",
        entityType: "customer",
        entityId: created.id,
        after: customerAuditSnapshot(created),
      });
      return created;
    });
    return toPublicCustomer(customer);
  } catch (error) {
    handleDuplicateDocument(error);
  }
}

/**
 * Altera dados do cliente, inclusive ativar/desativar.
 * Clientes nunca são apagados (regra do projeto): desativar tira o
 * cliente das listas de novos pedidos, mas mantém o histórico.
 */
export async function updateCustomer(actorId: string, id: string, input: UpdateCustomerInput) {
  try {
    const customer = await prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({ where: { id } });
      if (!current) throw new NotFoundError("Cliente não encontrado.");

      const updated = await tx.customer.update({ where: { id }, data: input });
      await recordAudit(tx, {
        userId: actorId,
        action: "customer.update",
        entityType: "customer",
        entityId: id,
        before: customerAuditSnapshot(current),
        after: customerAuditSnapshot(updated),
      });
      return updated;
    });
    return toPublicCustomer(customer);
  } catch (error) {
    handleDuplicateDocument(error);
  }
}
