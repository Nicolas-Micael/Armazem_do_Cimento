// Utilitários para os testes que usam o banco de TESTE (armazem_test).
import request from "supertest";
import type { Express } from "express";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import type { Role } from "../src/generated/prisma/client.js";

/** Apaga todos os dados do banco de TESTE para cada teste começar do zero. */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "order_status_history", "order_items", "orders", "audit_logs", "sessions", "customers", "products", "users" RESTART IDENTITY CASCADE');
}

export const TEST_PASSWORD = "senha-de-teste-123";

/** Cria um usuário diretamente no banco (já com senha definitiva, por padrão). */
export async function createTestUser(options: {
  username: string;
  role: Role;
  password?: string;
  mustChangePassword?: boolean;
  active?: boolean;
}) {
  return prisma.user.create({
    data: {
      name: `Teste ${options.username}`,
      username: options.username,
      role: options.role,
      passwordHash: await hashPassword(options.password ?? TEST_PASSWORD),
      mustChangePassword: options.mustChangePassword ?? false,
      active: options.active ?? true,
    },
  });
}

/**
 * Faz login e devolve um "agent": um cliente HTTP que guarda o cookie
 * de sessão, como um navegador faria.
 */
export async function loginAs(app: Express, username: string, password = TEST_PASSWORD) {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({ username, password });
  if (response.status !== 200) {
    throw new Error(`Login de teste falhou (${response.status}): ${JSON.stringify(response.body)}`);
  }
  return agent;
}
