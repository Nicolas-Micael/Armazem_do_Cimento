// Testes do cálculo do pedido (não usam o banco).
import { describe, expect, it } from "vitest";
import { Decimal } from "../../lib/money.js";
import { calculateOrderTotals, type CalculationInput } from "./orders.calculations.js";

const d = (value: string) => new Decimal(value);

function totals(input: CalculationInput) {
  const result = calculateOrderTotals(input);
  return {
    lineTotals: result.lineTotals.map((v) => v.toFixed(2)),
    subtotal: result.subtotal.toFixed(2),
    freight: result.freightAmount.toFixed(2),
    discount: result.discountAmount.toFixed(2),
    total: result.total.toFixed(2),
  };
}

describe("calculateOrderTotals", () => {
  it("vários itens + frete, sem desconto", () => {
    expect(
      totals({
        items: [
          { quantity: 3, unitPrice: d("38.90") },
          { quantity: 10, unitPrice: d("45.15") },
        ],
        freightAmount: d("15.50"),
        discount: null,
      }),
    ).toEqual({ lineTotals: ["116.70", "451.50"], subtotal: "568.20", freight: "15.50", discount: "0.00", total: "583.70" });
  });

  it("valores que dariam erro com ponto flutuante (0,10 × 3)", () => {
    // Em JavaScript, 0.1 * 3 = 0.30000000000000004
    expect(totals({ items: [{ quantity: 3, unitPrice: d("0.10") }], freightAmount: d("0"), discount: null }).total).toBe("0.30");
  });

  it("desconto fixo em reais", () => {
    const result = totals({
      items: [{ quantity: 40, unitPrice: d("38.90") }],
      freightAmount: d("120.00"),
      discount: { type: "FIXED", value: d("56.00") },
    });
    expect(result).toMatchObject({ subtotal: "1556.00", discount: "56.00", total: "1620.00" });
  });

  it("desconto percentual incide só sobre os produtos, com arredondamento em centavos", () => {
    // 7 × 38,90 = 272,30; 5% = 13,615 → 13,62 (meio para cima); 272,30 + 20,00 − 13,62 = 278,68
    const result = totals({
      items: [{ quantity: 7, unitPrice: d("38.90") }],
      freightAmount: d("20.00"),
      discount: { type: "PERCENTAGE", value: d("5") },
    });
    expect(result).toMatchObject({ subtotal: "272.30", discount: "13.62", total: "278.68" });
  });

  it("desconto de 100% zera os produtos, mas mantém o frete", () => {
    const result = totals({
      items: [{ quantity: 2, unitPrice: d("40.00") }],
      freightAmount: d("10.00"),
      discount: { type: "PERCENTAGE", value: d("100") },
    });
    expect(result.total).toBe("10.00");
  });

  it("recusa percentual acima de 100%", () => {
    expect(() =>
      calculateOrderTotals({
        items: [{ quantity: 1, unitPrice: d("10.00") }],
        freightAmount: d("0"),
        discount: { type: "PERCENTAGE", value: d("100.01") },
      }),
    ).toThrow(/100%/);
  });

  it("recusa desconto fixo maior que produtos + frete (total negativo)", () => {
    expect(() =>
      calculateOrderTotals({
        items: [{ quantity: 1, unitPrice: d("10.00") }],
        freightAmount: d("5.00"),
        discount: { type: "FIXED", value: d("15.01") },
      }),
    ).toThrow(/maior que o valor do pedido/);
  });

  it("aceita desconto igual a produtos + frete (total zero)", () => {
    const result = totals({
      items: [{ quantity: 1, unitPrice: d("10.00") }],
      freightAmount: d("5.00"),
      discount: { type: "FIXED", value: d("15.00") },
    });
    expect(result.total).toBe("0.00");
  });
});
