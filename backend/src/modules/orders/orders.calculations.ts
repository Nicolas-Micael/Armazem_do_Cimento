// Cálculo dos valores do pedido.
//
// Estas funções são "puras": recebem números decimais e devolvem
// números decimais, sem acessar banco nem internet. Por isso são fáceis
// de testar (ver orders.calculations.test.ts) e são a ÚNICA fonte da
// conta do pedido: a criação, a edição e a pré-visualização usam elas.
//
// Fórmula aprovada: total = produtos (já com os descontos dos itens) + frete − desconto geral.
import { Decimal, roundMoney, sumMoney } from "../../lib/money.js";
import { ValidationError } from "../../lib/errors.js";

export type DiscountType = "FIXED" | "PERCENTAGE";

export type Discount = { type: DiscountType; value: Decimal };

export interface CalculationItem {
  quantity: number;
  unitPrice: Decimal;
  /** Desconto só deste item (R$ ou %), aplicado sobre o valor bruto do item. */
  discount?: Discount | null;
}

export interface CalculationInput {
  items: CalculationItem[];
  freightAmount: Decimal;
  /** Desconto geral do pedido, aplicado sobre os produtos JÁ com os descontos dos itens. */
  discount: Discount | null;
}

export interface CalculationResult {
  /** Por item: quantidade × preço, antes do desconto do item. */
  lineGrossTotals: Decimal[];
  /** Por item: desconto do item em reais. */
  lineDiscounts: Decimal[];
  /** Por item: valor líquido (bruto − desconto do item). */
  lineTotals: Decimal[];
  /** Soma dos brutos dos itens. */
  grossSubtotal: Decimal;
  /** Soma dos descontos dos itens. */
  itemDiscountsTotal: Decimal;
  /** Produtos: soma dos valores líquidos dos itens. */
  subtotal: Decimal;
  freightAmount: Decimal;
  /** Desconto geral em reais. */
  discountAmount: Decimal;
  /** Descontos dos itens + desconto geral. */
  totalDiscounts: Decimal;
  total: Decimal;
}

/** Converte um desconto (R$ ou %) em reais sobre uma base. Lança ValidationError no campo informado. */
function discountInReais(discount: Discount, base: Decimal, field: string, overMessage: string): Decimal {
  let amount: Decimal;
  if (discount.type === "PERCENTAGE") {
    if (discount.value.greaterThan(100)) {
      throw new ValidationError("O desconto percentual não pode passar de 100%.", [
        { field, message: "Use um percentual entre 0 e 100." },
      ]);
    }
    amount = roundMoney(base.times(discount.value).dividedBy(100));
  } else {
    amount = roundMoney(discount.value);
  }
  if (amount.greaterThan(base)) {
    throw new ValidationError(overMessage, [{ field, message: overMessage }]);
  }
  return amount;
}

/**
 * Calcula os valores do pedido, nesta ordem (cada desconto incide em UMA base só, sem duplicidade):
 * 1. bruto do item = quantidade × preço praticado (centavos);
 * 2. desconto do item (fixo ou %) sobre o bruto DESSE item; líquido = bruto − desconto;
 * 3. produtos = soma dos líquidos;
 * 4. desconto geral: % sobre os produtos já com os descontos dos itens (nunca sobre o frete, P-DES-3);
 *    fixo em reais, até produtos + frete;
 * 5. total = produtos + frete − desconto geral (nunca negativo).
 *
 * Lança ValidationError (com o campo) se algum desconto for maior que o permitido.
 */
export function calculateOrderTotals(input: CalculationInput): CalculationResult {
  const lineGrossTotals = input.items.map((item) => roundMoney(item.unitPrice.times(item.quantity)));
  const lineDiscounts = input.items.map((item, index) =>
    item.discount
      ? discountInReais(item.discount, lineGrossTotals[index]!, `items.${index}.discount.value`, "O desconto do item é maior que o valor do item.")
      : new Decimal(0),
  );
  const lineTotals = lineGrossTotals.map((gross, index) => gross.minus(lineDiscounts[index]!));

  const grossSubtotal = sumMoney(lineGrossTotals);
  const itemDiscountsTotal = sumMoney(lineDiscounts);
  const subtotal = sumMoney(lineTotals);
  const freightAmount = roundMoney(input.freightAmount);

  // Desconto geral: o percentual incide sobre os produtos (P-DES-3); o fixo pode chegar
  // até produtos + frete, para o total nunca ficar negativo (regra já existente, mantida).
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
    lineGrossTotals,
    lineDiscounts,
    lineTotals,
    grossSubtotal,
    itemDiscountsTotal,
    subtotal,
    freightAmount,
    discountAmount,
    totalDiscounts: itemDiscountsTotal.plus(discountAmount),
    total: beforeDiscount.minus(discountAmount),
  };
}
