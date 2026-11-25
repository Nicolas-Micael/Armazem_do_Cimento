// Funções para valores em dinheiro.
//
// REGRA DO PROJETO: nunca usar "number" (ponto flutuante) para dinheiro.
// Exemplo do problema: em JavaScript, 0.1 + 0.2 === 0.30000000000000004.
//
// Usamos a biblioteca decimal.js, que faz contas exatas em base 10.
// É a mesma biblioteca que o Prisma usa para colunas DECIMAL.
import { Decimal } from "decimal.js";
import { ValidationError } from "./errors.js";

/**
 * Formato aceito para dinheiro vindo de fora (JSON): texto com até
 * duas casas decimais, separador ponto. Ex.: "38.90", "1500", "0.05".
 */
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Converte o texto recebido da API em Decimal.
 * Recebe: "38.90" · Retorna: Decimal(38.90) · Lança ValidationError se inválido.
 */
export function parseMoney(value: string): Decimal {
  if (!MONEY_PATTERN.test(value)) {
    throw new ValidationError(`Valor monetário inválido: "${value}". Use o formato 1234.56.`);
  }
  return new Decimal(value);
}

/**
 * Arredonda para centavos (2 casas).
 *
 * ATENÇÃO: o modo de arredondamento ainda depende de confirmação
 * (pergunta P-PED-5 do planejamento). Usamos provisoriamente o
 * arredondamento comercial "meio para cima" (2,345 → 2,35).
 */
export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Converte Decimal em texto para enviar na resposta da API.
 * Recebe: Decimal(38.9) · Retorna: "38.90"
 */
export function moneyToString(value: Decimal): string {
  return roundMoney(value).toFixed(2);
}

/** Soma uma lista de valores sem perder precisão. */
export function sumMoney(values: Decimal[]): Decimal {
  return values.reduce((total, value) => total.plus(value), new Decimal(0));
}

export { Decimal };
