// Cálculo dos valores do pedido.
//
// Estas funções são "puras": recebem números decimais e devolvem
// números decimais, sem acessar banco nem internet. Por isso são fáceis
// de testar (ver orders.calculations.test.ts) e são a ÚNICA fonte da
// conta do pedido: a criação, a edição e a pré-visualização usam elas.
//
// Fórmula aprovada: total = valor dos produtos + frete − desconto.
import { Decimal, roundMoney, sumMoney } from "../../lib/money.js";
import { ValidationError } from "../../lib/errors.js";

export type DiscountType = "FIXED" | "PERCENTAGE";

export interface CalculationItem {
  quantity: number;
  unitPrice: Decimal;
}

export interface CalculationInput {
  items: CalculationItem[];
  freightAmount: Decimal;
  discount: { type: DiscountType; value: Decimal } | null;
}

export interface CalculationResult {
  lineTotals: Decimal[];
  subtotal: Decimal;
  freightAmount: Decimal;
  discountAmount: Decimal;
  total: Decimal;
}

/**
 * Calcula subtotal, desconto em reais e total do pedido.
 *
 * Regras:
 * - cada item: quantidade × preço praticado, arredondado em centavos;
 * - desconto percentual incide só sobre os produtos (provisório, P-DES-3);
 * - o desconto não pode deixar o total negativo.
 *
 * Lança ValidationError se o desconto for maior que o permitido.
 */
export function calculateOrderTotals(input: CalculationInput): CalculationResult {
  const lineTotals = input.items.map((item) => roundMoney(item.unitPrice.times(item.quantity)));
  const subtotal = sumMoney(lineTotals);
  const freightAmount = roundMoney(input.freightAmount);

  let discountAmount = new Decimal(0);
  if (input.discount) {
    if (input.discount.type === "PERCENTAGE") {
      if (input.discount.value.greaterThan(100)) {
        throw new ValidationError("O desconto percentual não pode passar de 100%.", [
          { field: "discount.value", message: "Use um percentual entre 0 e 100." },
        ]);
      }
      discountAmount = roundMoney(subtotal.times(input.discount.value).dividedBy(100));
    } else {
      discountAmount = roundMoney(input.discount.value);
    }
  }

  const beforeDiscount = subtotal.plus(freightAmount);
  if (discountAmount.greaterThan(beforeDiscount)) {
    throw new ValidationError("O desconto é maior que o valor do pedido.", [
      { field: "discount.value", message: "O desconto não pode deixar o total negativo." },
    ]);
  }

  return {
    lineTotals,
    subtotal,
    freightAmount,
    discountAmount,
    total: beforeDiscount.minus(discountAmount),
  };
}
