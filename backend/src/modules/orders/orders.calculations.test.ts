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

describe("desconto por item + desconto geral", () => {
  const full = (input: CalculationInput) => {
    const r = calculateOrderTotals(input);
    return {
      gross: r.lineGrossTotals.map((v) => v.toFixed(2)),
      itemDiscounts: r.lineDiscounts.map((v) => v.toFixed(2)),
      net: r.lineTotals.map((v) => v.toFixed(2)),
      grossSubtotal: r.grossSubtotal.toFixed(2),
      itemDiscountsTotal: r.itemDiscountsTotal.toFixed(2),
      subtotal: r.subtotal.toFixed(2),
      generalDiscount: r.discountAmount.toFixed(2),
      totalDiscounts: r.totalDiscounts.toFixed(2),
      total: r.total.toFixed(2),
    };
  };

  it("desconto fixo no item reduz só aquele item", () => {
    expect(
      full({
        items: [
          { quantity: 10, unitPrice: d("38.90"), discount: { type: "FIXED", value: d("19.00") } },
          { quantity: 5, unitPrice: d("45.15") },
        ],
        freightAmount: d("0"),
        discount: null,
      }),
    ).toMatchObject({ gross: ["389.00", "225.75"], itemDiscounts: ["19.00", "0.00"], net: ["370.00", "225.75"], subtotal: "595.75", total: "595.75" });
  });

  it("desconto percentual no item incide sobre o bruto do item", () => {
    const r = full({
      items: [{ quantity: 3, unitPrice: d("38.90"), discount: { type: "PERCENTAGE", value: d("10") } }],
      freightAmount: d("0"),
      discount: null,
    });
    // 116,70 × 10% = 11,67
    expect(r).toMatchObject({ gross: ["116.70"], itemDiscounts: ["11.67"], net: ["105.03"], total: "105.03" });
  });

  it("desconto geral percentual incide sobre os produtos JÁ com os descontos dos itens (sem duplicidade)", () => {
    const r = full({
      items: [{ quantity: 10, unitPrice: d("40.00"), discount: { type: "FIXED", value: d("100.00") } }], // bruto 400, líquido 300
      freightAmount: d("50.00"),
      discount: { type: "PERCENTAGE", value: d("10") }, // 10% de 300 = 30 (e não 10% de 400)
    });
    expect(r).toMatchObject({
      grossSubtotal: "400.00", itemDiscountsTotal: "100.00", subtotal: "300.00",
      generalDiscount: "30.00", totalDiscounts: "130.00", total: "320.00", // 300 + 50 − 30
    });
  });

  it("os dois descontos somam em 'descontos totais' e o total fecha: bruto − descontos + frete", () => {
    const r = calculateOrderTotals({
      items: [
        { quantity: 7, unitPrice: d("38.90"), discount: { type: "PERCENTAGE", value: d("2.5") } },
        { quantity: 3, unitPrice: d("45.15"), discount: { type: "FIXED", value: d("1.05") } },
        { quantity: 1, unitPrice: d("10.00") },
      ],
      freightAmount: d("33.33"),
      discount: { type: "FIXED", value: d("12.34") },
    });
    expect(r.grossSubtotal.plus(r.freightAmount).minus(r.totalDiscounts).toFixed(2)).toBe(r.total.toFixed(2));
  });

  it("desconto do item não pode passar do valor do item", () => {
    expect(() =>
      calculateOrderTotals({
        items: [{ quantity: 1, unitPrice: d("10.00"), discount: { type: "FIXED", value: d("10.01") } }],
        freightAmount: d("0"),
        discount: null,
      }),
    ).toThrow(/maior que o valor do item/);
    expect(() =>
      calculateOrderTotals({
        items: [{ quantity: 1, unitPrice: d("10.00"), discount: { type: "PERCENTAGE", value: d("100.01") } }],
        freightAmount: d("0"),
        discount: null,
      }),
    ).toThrow(/100%/);
  });

  it("erro de desconto aponta o item certo", () => {
    try {
      calculateOrderTotals({
        items: [{ quantity: 1, unitPrice: d("10.00") }, { quantity: 1, unitPrice: d("5.00"), discount: { type: "FIXED", value: d("6.00") } }],
        freightAmount: d("0"),
        discount: null,
      });
      expect.unreachable();
    } catch (error) {
      expect((error as { details: { field: string }[] }).details[0]?.field).toBe("items.1.discount.value");
    }
  });

  it("item com 100% de desconto fica em zero e o pedido continua válido", () => {
    expect(
      full({ items: [{ quantity: 2, unitPrice: d("10.00"), discount: { type: "PERCENTAGE", value: d("100") } }], freightAmount: d("5.00"), discount: null }),
    ).toMatchObject({ net: ["0.00"], subtotal: "0.00", total: "5.00" });
  });

  it("sem descontos nos itens o resultado é igual ao de antes (compatibilidade)", () => {
    expect(
      totals({ items: [{ quantity: 40, unitPrice: d("38.90") }], freightAmount: d("120.00"), discount: { type: "PERCENTAGE", value: d("5") } }),
    ).toEqual({ lineTotals: ["1556.00"], subtotal: "1556.00", freight: "120.00", discount: "77.80", total: "1598.20" });
  });
});
