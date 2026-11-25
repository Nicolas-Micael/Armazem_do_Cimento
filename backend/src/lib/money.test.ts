// Testes das funções de dinheiro. Rodar com: npm test
import { describe, expect, it } from "vitest";
import { Decimal, moneyToString, parseMoney, roundMoney, sumMoney } from "./money.js";

describe("parseMoney", () => {
  it("aceita valores com até duas casas decimais", () => {
    expect(parseMoney("38.90").toFixed(2)).toBe("38.90");
    expect(parseMoney("1500").toFixed(2)).toBe("1500.00");
  });

  it("recusa formatos inválidos em vez de adivinhar", () => {
    expect(() => parseMoney("38,90")).toThrow(/inválido/);   // vírgula
    expect(() => parseMoney("-10")).toThrow(/inválido/);     // negativo
    expect(() => parseMoney("1.999")).toThrow(/inválido/);   // 3 casas
    expect(() => parseMoney("abc")).toThrow(/inválido/);
  });
});

describe("cálculos sem erro de ponto flutuante", () => {
  it("0.1 + 0.2 dá exatamente 0.30", () => {
    // Com number: 0.1 + 0.2 = 0.30000000000000004
    expect(sumMoney([new Decimal("0.1"), new Decimal("0.2")]).toString()).toBe("0.3");
  });

  it("3 sacos de R$ 38,90 + frete de R$ 15,50 = R$ 132,20", () => {
    const products = new Decimal("38.90").times(3);
    expect(moneyToString(products.plus("15.50"))).toBe("132.20");
  });
});

describe("roundMoney", () => {
  it("arredonda meio para cima (regra provisória, P-PED-5)", () => {
    expect(roundMoney(new Decimal("2.345")).toFixed(2)).toBe("2.35");
    expect(roundMoney(new Decimal("2.344")).toFixed(2)).toBe("2.34");
  });
});
