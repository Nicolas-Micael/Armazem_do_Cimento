// Datas do negócio: "dia" sempre no horário de Brasília, mesmo com o servidor em outro fuso.
// Usado nos filtros de período das listas (o painel tem a sua versão em dashboard.period.ts).
export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Diferença (em ms) entre o relógio de Brasília e UTC no instante informado (ex.: −3 h = −10 800 000). */
function zoneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Instante em que o dia "AAAA-MM-DD" começa em Brasília (meia-noite local).
 * Recebe: "2026-11-30" · Retorna: 2026-11-30T03:00:00Z.
 */
export function startOfBusinessDay(date: string): Date {
  const utcMidnight = new Date(`${date}T00:00:00Z`);
  // Duas passadas cobrem a mudança de fuso (horário de verão), caso volte a existir.
  let guess = new Date(utcMidnight.getTime() - zoneOffsetMs(utcMidnight));
  guess = new Date(utcMidnight.getTime() - zoneOffsetMs(guess));
  return guess;
}

/** Instante em que o dia SEGUINTE começa (limite exclusivo de um filtro "até a data"). */
export function startOfNextBusinessDay(date: string): Date {
  const next = new Date(new Date(`${date}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);
  return startOfBusinessDay(next);
}
