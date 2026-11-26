import { describe, expect, it } from "vitest";
import { resolveLocation, visibleGroups } from "./navigation";

describe("visibleGroups", () => {
  it("esconde Usuários e Permissões para o Financeiro e mostra para o ADM", () => {
    const labels = (role: "ADMIN" | "FINANCEIRO") =>
      visibleGroups(role).flatMap((group) => group.items.map((item) => item.label));
    expect(labels("FINANCEIRO")).not.toContain("Usuários e Permissões");
    expect(labels("ADMIN")).toContain("Usuários e Permissões");
  });
});

describe("resolveLocation", () => {
  it("dashboard", () => {
    expect(resolveLocation("/")).toEqual({ title: "Dashboard", crumbs: [{ label: "Início" }] });
  });

  it("lista de saídas", () => {
    const { title, crumbs } = resolveLocation("/pedidos");
    expect(title).toBe("Saídas de Cimento");
    expect(crumbs.map((c) => c.label)).toEqual(["Início", "Comercial", "Saídas de Cimento"]);
  });

  it("nova saída e edição", () => {
    expect(resolveLocation("/pedidos/novo").crumbs.map((c) => c.label)).toEqual([
      "Início", "Comercial", "Saídas de Cimento", "Nova saída",
    ]);
    const edit = resolveLocation("/pedidos/abc-123/editar");
    expect(edit.title).toBe("Editar");
    expect(edit.crumbs.map((c) => c.label)).toEqual(["Início", "Comercial", "Saídas de Cimento", "Detalhe", "Editar"]);
    expect(edit.crumbs[3]?.to).toBe("/pedidos/abc-123");
  });

  it("endereço desconhecido cai no título padrão", () => {
    expect(resolveLocation("/nada").title).toBe("Armazém do Cimento");
  });
});
