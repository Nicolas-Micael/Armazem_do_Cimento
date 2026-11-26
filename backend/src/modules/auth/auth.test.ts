// Testes de login, sessão e troca de senha obrigatória.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestUser, loginAs, resetDatabase, TEST_PASSWORD } from "../../../tests/helpers.js";

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("POST /api/auth/login", () => {
  it("entra com usuário e senha certos e recebe cookie httpOnly", async () => {
    await createTestUser({ username: "maria", role: "FINANCEIRO" });
    const response = await request(app).post("/api/auth/login").send({ username: "maria", password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ username: "maria", role: "FINANCEIRO" });
    expect(response.body.user.passwordHash).toBeUndefined();
    const cookie = String(response.headers["set-cookie"]);
    expect(cookie).toContain("armazem_sessao=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("aceita o nome de usuário com maiúsculas e espaços", async () => {
    await createTestUser({ username: "maria", role: "FINANCEIRO" });
    const response = await request(app).post("/api/auth/login").send({ username: "  Maria ", password: TEST_PASSWORD });
    expect(response.status).toBe(200);
  });

  it("dá a mesma mensagem para senha errada e usuário inexistente", async () => {
    await createTestUser({ username: "maria", role: "FINANCEIRO" });
    const wrongPassword = await request(app).post("/api/auth/login").send({ username: "maria", password: "errada-123" });
    const unknownUser = await request(app).post("/api/auth/login").send({ username: "ninguem", password: "errada-123" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error.message).toBe("Usuário ou senha inválidos.");
    expect(unknownUser.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it("recusa usuário desativado", async () => {
    await createTestUser({ username: "maria", role: "FINANCEIRO", active: false });
    const response = await request(app).post("/api/auth/login").send({ username: "maria", password: TEST_PASSWORD });
    expect(response.status).toBe(401);
  });

  it("bloqueia depois de 10 tentativas erradas", async () => {
    await createTestUser({ username: "alvo", role: "FINANCEIRO" });
    for (let i = 0; i < 10; i++) {
      await request(app).post("/api/auth/login").send({ username: "alvo", password: "errada-123" });
    }
    const blocked = await request(app).post("/api/auth/login").send({ username: "alvo", password: TEST_PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("valida os campos obrigatórios", async () => {
    const response = await request(app).post("/api/auth/login").send({});
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("sessão", () => {
  it("GET /me responde 401 sem login", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
  });

  it("GET /me devolve o usuário logado", async () => {
    await createTestUser({ username: "maria", role: "FINANCEIRO" });
    const agent = await loginAs(app, "maria");
    const response = await agent.get("/api/auth/me");
    expect(response.status).toBe(200);
    expect(response.body.user.username).toBe("maria");
  });

  it("logout encerra a sessão", async () => {
    await createTestUser({ username: "maria", role: "FINANCEIRO" });
    const agent = await loginAs(app, "maria");
    expect((await agent.post("/api/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("sessão expirada não vale mais", async () => {
    await createTestUser({ username: "maria", role: "FINANCEIRO" });
    const agent = await loginAs(app, "maria");
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("guarda só o hash do código da sessão no banco", async () => {
    await createTestUser({ username: "maria", role: "FINANCEIRO" });
    const response = await request(app).post("/api/auth/login").send({ username: "maria", password: TEST_PASSWORD });
    const token = /armazem_sessao=([^;]+)/.exec(String(response.headers["set-cookie"]))?.[1];
    const session = await prisma.session.findFirstOrThrow();
    expect(token).toBeTruthy();
    expect(session.tokenHash).not.toBe(token);
  });
});

describe("troca de senha obrigatória", () => {
  it("usuário com senha temporária só acessa /me, troca de senha e logout", async () => {
    await createTestUser({ username: "novo", role: "ADMIN", mustChangePassword: true });
    const agent = await loginAs(app, "novo");

    expect((await agent.get("/api/auth/me")).body.user.mustChangePassword).toBe(true);
    const blocked = await agent.get("/api/users");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("depois de trocar a senha, o acesso é liberado", async () => {
    await createTestUser({ username: "novo", role: "ADMIN", mustChangePassword: true });
    const agent = await loginAs(app, "novo");

    const change = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: TEST_PASSWORD, newPassword: "nova-senha-456" });
    expect(change.status).toBe(200);
    expect(change.body.user.mustChangePassword).toBe(false);
    expect((await agent.get("/api/users")).status).toBe(200);

    // A senha nova funciona e a antiga não.
    expect((await request(app).post("/api/auth/login").send({ username: "novo", password: "nova-senha-456" })).status).toBe(200);
    expect((await request(app).post("/api/auth/login").send({ username: "novo", password: TEST_PASSWORD })).status).toBe(401);
  });

  it("recusa senha atual errada, senha nova curta ou igual à atual", async () => {
    await createTestUser({ username: "novo", role: "FINANCEIRO", mustChangePassword: true });
    const agent = await loginAs(app, "novo");

    const wrong = await agent.post("/api/auth/change-password").send({ currentPassword: "errada", newPassword: "nova-senha-456" });
    const short = await agent.post("/api/auth/change-password").send({ currentPassword: TEST_PASSWORD, newPassword: "curta" });
    const same = await agent.post("/api/auth/change-password").send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD });

    expect([wrong.status, short.status, same.status]).toEqual([400, 400, 400]);
  });

  it("trocar a senha encerra as sessões em outros aparelhos, mas mantém a atual", async () => {
    await createTestUser({ username: "maria", role: "FINANCEIRO" });
    const computer = await loginAs(app, "maria");
    const phone = await loginAs(app, "maria");

    await computer.post("/api/auth/change-password").send({ currentPassword: TEST_PASSWORD, newPassword: "nova-senha-456" });

    expect((await computer.get("/api/auth/me")).status).toBe(200);
    expect((await phone.get("/api/auth/me")).status).toBe(401);
  });

  it("registra a troca na auditoria, sem a senha", async () => {
    const user = await createTestUser({ username: "maria", role: "FINANCEIRO", mustChangePassword: true });
    const agent = await loginAs(app, "maria");
    await agent.post("/api/auth/change-password").send({ currentPassword: TEST_PASSWORD, newPassword: "nova-senha-456" });

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "user.change_password" } });
    expect(log.entityId).toBe(user.id);
    expect(JSON.stringify(log)).not.toContain("nova-senha-456");
  });
});
