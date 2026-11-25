// Formatação de valores para exibição no padrão brasileiro.
//
// A API envia dinheiro como TEXTO ("1234.5" ou "1234.56"). Formatamos
// mexendo no texto, sem converter para number, para não haver nenhum
// risco de arredondamento de ponto flutuante.

/**
 * Recebe: "1234.5" · Retorna: "R$ 1.234,50"
 * Recebe: "-10.00" · Retorna: "-R$ 10,00"
 */
export function formatMoney(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`Valor monetário inválido para exibição: "${value}"`);

  const [, sign = "", integerPart = "0", decimalPart = ""] = match;
  // Separador de milhar: insere "." a cada 3 dígitos, da direita para a esquerda.
  const withThousands = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cents = decimalPart.padEnd(2, "0");
  return `${sign}R$ ${withThousands},${cents}`;
}

/** Recebe: "2026-11-25T20:28:40.308Z" · Retorna: "25/11/2026 17:28" (horário de Brasília) */
export function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(isoDate));
}
