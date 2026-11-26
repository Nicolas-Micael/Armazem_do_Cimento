import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("hash de senha", () => {
  it("não guarda a senha em texto e confere a senha certa", async () => {
    const hash = await hashPassword("minha-senha-forte");
    expect(hash).not.toContain("minha-senha-forte");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("minha-senha-forte", hash)).toBe(true);
  });

  it("recusa a senha errada", async () => {
    const hash = await hashPassword("minha-senha-forte");
    expect(await verifyPassword("minha-senha-fraca", hash)).toBe(false);
  });

  it("gera hashes diferentes para a mesma senha (sal aleatório)", async () => {
    expect(await hashPassword("igual-igual")).not.toBe(await hashPassword("igual-igual"));
  });

  it("retorna false para um hash em formato desconhecido", async () => {
    expect(await verifyPassword("qualquer", "formato-invalido")).toBe(false);
  });
});
