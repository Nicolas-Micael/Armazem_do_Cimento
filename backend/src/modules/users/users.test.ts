// Testes da gestão de usuários e das permissões por perfil.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestUser, loginAs, resetDatabase } from "../../../tests/helpers.js";

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function setup() {
  const admin = await createTestUser({ username: "chefe", role: "ADMIN" });
  const financeiro = await createTestUser({ username: "caixa1", role: "FINANCEIRO" });
  return { admin, financeiro, adminAgent: await loginAs(app, "chefe"), financeiroAgent: await loginAs(app, "caixa1") };
}

const newUser = { name: "João da Silva", username: "Joao.Silva", role: "FINANCEIRO", temporaryPassword: "temporaria-123" };

describe("permissões: só o ADM gerencia usuários", () => {
  it("Financeiro recebe 403 em todas as rotas de usuários, mesmo chamando a API direto", async () => {
    const { admin, financeiroAgent } = await setup();

    const responses = await Promise.all([
      financeiroAgent.get("/api/users"),
      financeiroAgent.post("/api/users").send(newUser),
      financeiroAgent.patch(`/api/users/${admin.id}`).send({ active: false }),
      financeiroAgent.post(`/api/users/${admin.id}/reset-password`).send({ temporaryPassword: "invasao-123" }),
    ]);

    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403]);
    // Nada mudou no banco.
    expect(await prisma.user.count()).toBe(2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).active).toBe(true);
  });

  it("sem login, responde 401", async () => {
    expect((await request(app).get("/api/users")).status).toBe(401);
  });
});

describe("ADM cria usuários", () => {
  it("cria com senha temporária, nome de usuário em minúsculas e registra auditoria", async () => {
    const { admin, adminAgent } = await setup();
    const response = await adminAgent.post("/api/users").send(newUser);

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ username: "joao.silva", role: "FINANCEIRO", mustChangePassword: true });
    expect(response.body.user.passwordHash).toBeUndefined();

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "user.create" } });
    expect(log.userId).toBe(admin.id);
    expect(JSON.stringify(log)).not.toContain("temporaria-123");
  });

  it("o usuário novo entra com a senha temporária e é obrigado a trocá-la", async () => {
    const { adminAgent } = await setup();
    await adminAgent.post("/api/users").send(newUser);

    const agent = await loginAs(app, "joao.silva", "temporaria-123");
    expect((await agent.get("/api/auth/me")).body.user.mustChangePassword).toBe(true);
  });

  it("recusa nome de usuário repetido (409)", async () => {
    const { adminAgent } = await setup();
    const response = await adminAgent.post("/api/users").send({ ...newUser, username: "CAIXA1" });
    expect(response.status).toBe(409);
  });

  it("recusa dados inválidos (400) com a lista de campos", async () => {
    const { adminAgent } = await setup();
    const response = await adminAgent
      .post("/api/users")
      .send({ name: "J", username: "joão silva", role: "VENDEDOR", temporaryPassword: "123" });

    expect(response.status).toBe(400);
    const fields = response.body.error.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(["name", "role", "temporaryPassword", "username"]);
  });
});

describe("ADM edita, desativa e redefine senha", () => {
  it("desativar um usuário encerra as sessões dele", async () => {
    const { financeiro, adminAgent, financeiroAgent } = await setup();
    const response = await adminAgent.patch(`/api/users/${financeiro.id}`).send({ active: false });

    expect(response.status).toBe(200);
    expect(response.body.user.active).toBe(false);
    expect((await financeiroAgent.get("/api/auth/me")).status).toBe(401);
  });

  it("redefinir a senha desconecta a pessoa e exige troca no próximo acesso", async () => {
    const { financeiro, adminAgent, financeiroAgent } = await setup();
    const response = await adminAgent
      .post(`/api/users/${financeiro.id}/reset-password`)
      .send({ temporaryPassword: "provisoria-789" });

    expect(response.status).toBe(200);
    expect((await financeiroAgent.get("/api/auth/me")).status).toBe(401);

    const agent = await loginAs(app, "caixa1", "provisoria-789");
    expect((await agent.get("/api/auth/me")).body.user.mustChangePassword).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "user.reset_password", entityId: financeiro.id } })).toBe(1);
  });

  it("ADM não pode desativar a si mesmo nem tirar o próprio perfil de ADM", async () => {
    const { admin, adminAgent } = await setup();
    expect((await adminAgent.patch(`/api/users/${admin.id}`).send({ active: false })).status).toBe(409);
    expect((await adminAgent.patch(`/api/users/${admin.id}`).send({ role: "FINANCEIRO" })).status).toBe(409);
  });

  it("ADM pode rebaixar outro ADM", async () => {
    const { adminAgent } = await setup();
    const second = await createTestUser({ username: "chefe2", role: "ADMIN" });
    const response = await adminAgent.patch(`/api/users/${second.id}`).send({ role: "FINANCEIRO" });
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("FINANCEIRO");
  });

  it("registra antes e depois na auditoria", async () => {
    const { financeiro, adminAgent } = await setup();
    await adminAgent.patch(`/api/users/${financeiro.id}`).send({ name: "Caixa Principal" });

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "user.update" } });
    expect(log.before).toMatchObject({ name: "Teste caixa1" });
    expect(log.after).toMatchObject({ name: "Caixa Principal" });
  });

  it("responde 404 para usuário inexistente", async () => {
    const { adminAgent } = await setup();
    expect((await adminAgent.patch("/api/users/nao-existe").send({ name: "Fulano" })).status).toBe(404);
  });
});
