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

/** "11222333000181" → "11.222.333/0001-81"; "52998224725" → "529.982.247-25". */
export function formatDocument(digits: string | null): string {
  if (!digits) return "";
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return digits;
}

/** "11987654321" → "(11) 98765-4321"; "1133334444" → "(11) 3333-4444". */
export function formatPhone(digits: string | null): string {
  if (!digits) return "";
  if (digits.length === 11) return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (digits.length === 10) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return digits;
}

/** "01001000" → "01001-000". */
export function formatZipCode(digits: string | null): string {
  if (!digits) return "";
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/**
 * Converte o valor digitado no padrão brasileiro para o formato da API,
 * mexendo só no texto (sem number):
 * "1.234,56" → "1234.56" · "38,9" → "38.9" · "40" → "40".
 * Não valida: quem confere se o valor é aceitável é o backend.
 */
export function moneyInputToApi(value: string): string {
  return value.trim().replace(/^R\$\s*/, "").replace(/\./g, "").replace(",", ".");
}

/** Converte o valor da API para exibir num campo de edição: "38.90" → "38,90". */
export function moneyApiToInput(value: string): string {
  return value.replace(".", ",");
}

/** "2026-11-30" → "30/11/2026" (data de calendário, sem fuso horário). */
export function formatDate(isoDate: string | null): string {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

/** Recebe: 1234 · Retorna: "1.234" (quantidades inteiras, como sacos). */
export function formatInteger(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

/** Recebe: "12.5" · Retorna: "+12,5%"; "-3.0" → "−3,0%". */
export function formatVariation(value: string): string {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const sign = negative ? "−" : value === "0.0" ? "" : "+";
  return `${sign}${digits.replace(".", ",")}%`;
}

/**
 * Limpa o que a pessoa digita num campo de dinheiro/percentual: só dígitos,
 * uma vírgula e no máximo 2 casas decimais. O ponto vira vírgula (quem digita
 * "38.9" quer dizer "38,9"). Recebe: "R$ 1a2,345" · Retorna: "12,34".
 */
export function sanitizeMoneyInput(raw: string): string {
  const text = raw.replace(/[^\d.,]/g, "").replace(/\./g, ",");
  const [integer = "", ...rest] = text.split(",");
  if (rest.length === 0) return integer;
  return `${integer},${rest.join("").slice(0, 2)}`;
}

/** Ao sair do campo completa as casas: "38" → "38,00"; "38,9" → "38,90"; "" → "". */
export function completeMoneyInput(value: string): string {
  if (!value) return "";
  const [integer = "", decimals = ""] = value.split(",");
  return `${integer || "0"},${decimals.padEnd(2, "0")}`;
}
