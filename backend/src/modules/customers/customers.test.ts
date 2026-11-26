// Testes de clientes: validação, busca, permissões e histórico.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestUser, loginAs, resetDatabase } from "../../../tests/helpers.js";

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

// Dados fictícios. O CPF e o CNPJ são números de teste, válidos só no cálculo.
const construtora = {
  name: "Construtora Exemplo Ltda",
  document: "11.222.333/0001-81",
  phone: "(11) 98765-4321",
  street: "Rua das Obras",
  number: "100",
  district: "Centro",
  city: "São Paulo",
  state: "sp",
  zipCode: "01001-000",
};

async function setup() {
  await createTestUser({ username: "chefe", role: "ADMIN" });
  await createTestUser({ username: "caixa1", role: "FINANCEIRO" });
  return { admin: await loginAs(app, "chefe"), financeiro: await loginAs(app, "caixa1") };
}

describe("cadastro de clientes", () => {
  it("ADM cadastra e os dados são normalizados (só números, UF maiúscula)", async () => {
    const { admin } = await setup();
    const response = await admin.post("/api/customers").send(construtora);

    expect(response.status).toBe(201);
    expect(response.body.customer).toMatchObject({
      document: "11222333000181",
      phone: "11987654321",
      state: "SP",
      zipCode: "01001000",
      active: true,
    });
  });

  it("CPF/CNPJ é opcional (provisório, P-CLI-2)", async () => {
    const { admin } = await setup();
    const response = await admin.post("/api/customers").send({ name: "Cliente Balcão" });
    expect(response.status).toBe(201);
    expect(response.body.customer.document).toBeNull();
  });

  it("recusa CPF/CNPJ inválido, UF e CEP errados", async () => {
    const { admin } = await setup();
    const response = await admin
      .post("/api/customers")
      .send({ name: "Fulano", document: "123.456.789-00", state: "São Paulo", zipCode: "123" });

    expect(response.status).toBe(400);
    const fields = response.body.error.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(["document", "state", "zipCode"]);
  });

  it("recusa CPF/CNPJ repetido (409), mesmo digitado com outra pontuação", async () => {
    const { admin } = await setup();
    await admin.post("/api/customers").send(construtora);
    const response = await admin.post("/api/customers").send({ name: "Outra", document: "11222333000181" });
    expect(response.status).toBe(409);
  });
});

describe("edição e desativação", () => {
  it("edição parcial não apaga os campos que não foram enviados", async () => {
    const { admin } = await setup();
    const { body } = await admin.post("/api/customers").send(construtora);

    const response = await admin.patch(`/api/customers/${body.customer.id}`).send({ phone: "(11) 3333-4444" });

    expect(response.status).toBe(200);
    expect(response.body.customer).toMatchObject({
      phone: "1133334444",
      document: "11222333000181",
      street: "Rua das Obras",
    });
  });

  it("enviar texto vazio apaga um campo opcional", async () => {
    const { admin } = await setup();
    const { body } = await admin.post("/api/customers").send(construtora);
    const response = await admin.patch(`/api/customers/${body.customer.id}`).send({ complement: "", notes: null });
    expect(response.status).toBe(200);
    expect(response.body.customer.complement).toBeNull();
  });

  it("desativar não apaga o cliente e registra antes/depois na auditoria", async () => {
    const { admin } = await setup();
    const { body } = await admin.post("/api/customers").send(construtora);
    const id = body.customer.id;

    await admin.patch(`/api/customers/${id}`).send({ active: false });

    expect(await prisma.customer.count({ where: { id } })).toBe(1);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "customer.update", entityId: id } });
    expect(log.before).toMatchObject({ active: true });
    expect(log.after).toMatchObject({ active: false });
  });

  it("não existe rota para apagar cliente", async () => {
    const { admin } = await setup();
    const { body } = await admin.post("/api/customers").send(construtora);
    expect((await admin.delete(`/api/customers/${body.customer.id}`)).status).toBe(404);
  });
});

describe("busca e listagem", () => {
  it("busca por nome (sem diferenciar maiúsculas) e por CPF/CNPJ com pontuação", async () => {
    const { admin } = await setup();
    await admin.post("/api/customers").send(construtora);
    await admin.post("/api/customers").send({ name: "Maria Pedreira" });

    const byName = await admin.get("/api/customers").query({ search: "construtora" });
    const byDocument = await admin.get("/api/customers").query({ search: "11.222.333" });

    expect(byName.body.customers.map((c: { name: string }) => c.name)).toEqual(["Construtora Exemplo Ltda"]);
    expect(byDocument.body.total).toBe(1);
  });

  it("por padrão lista só ativos; status=all mostra todos", async () => {
    const { admin } = await setup();
    const { body } = await admin.post("/api/customers").send(construtora);
    await admin.post("/api/customers").send({ name: "Maria Pedreira" });
    await admin.patch(`/api/customers/${body.customer.id}`).send({ active: false });

    expect((await admin.get("/api/customers")).body.total).toBe(1);
    expect((await admin.get("/api/customers").query({ status: "inactive" })).body.total).toBe(1);
    expect((await admin.get("/api/customers").query({ status: "all" })).body.total).toBe(2);
  });

  it("pagina os resultados", async () => {
    const { admin } = await setup();
    for (const name of ["Ana", "Bruno", "Carla"]) await admin.post("/api/customers").send({ name: `${name} Silva` });

    const page2 = await admin.get("/api/customers").query({ pageSize: 2, page: 2 });
    expect(page2.body.total).toBe(3);
    expect(page2.body.customers.map((c: { name: string }) => c.name)).toEqual(["Carla Silva"]);
  });
});

describe("permissões (provisório, P-CLI-1)", () => {
  it("Financeiro consulta, mas não cadastra nem edita", async () => {
    const { admin, financeiro } = await setup();
    const { body } = await admin.post("/api/customers").send(construtora);

    expect((await financeiro.get("/api/customers")).status).toBe(200);
    expect((await financeiro.get(`/api/customers/${body.customer.id}`)).status).toBe(200);
    expect((await financeiro.post("/api/customers").send({ name: "Teste" })).status).toBe(403);
    expect((await financeiro.patch(`/api/customers/${body.customer.id}`).send({ active: false })).status).toBe(403);
  });
});
