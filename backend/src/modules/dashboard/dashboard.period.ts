// Período do painel: datas "AAAA-MM-DD" no horário de Brasília.
//
// O servidor pode rodar em outro fuso (ex.: UTC na nuvem). Por isso o "dia" e o
// "mês" do painel são sempre os de Brasília, e as consultas ao banco convertem
// os horários (AT TIME ZONE) em vez de usar o fuso do servidor.
import { ValidationError } from "../../lib/errors.js";

export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Period {
  from: string; // inclusive
  to: string; // inclusive
}

/** Hoje (data de Brasília) como "AAAA-MM-DD". O formato "en-CA" já sai nesse padrão. */
export function todayInBusinessZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE }).format(now);
}

/** Trabalha as datas em UTC só para somar dias (sem horário de verão no meio). */
function toUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcDate(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Quantidade de dias do período, contando o primeiro e o último. */
export function daysInPeriod(period: Period): number {
  return Math.round((toUtcDate(period.to).getTime() - toUtcDate(period.from).getTime()) / DAY_MS) + 1;
}

/** Período padrão: do dia 1º do mês atual até hoje. */
export function defaultPeriod(now: Date = new Date()): Period {
  const today = todayInBusinessZone(now);
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/** Confere datas reais (rejeita 2026-02-30), ordem e tamanho máximo. */
export function validatePeriod(period: Period): Period {
  for (const value of [period.from, period.to]) {
    const parsed = toUtcDate(value);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new ValidationError(`Data inválida: ${value}.`);
    }
  }
  if (period.from > period.to) {
    throw new ValidationError("A data inicial não pode ser depois da data final.");
  }
  if (daysInPeriod(period) > MAX_RANGE_DAYS) {
    throw new ValidationError(`O período pode ter no máximo ${MAX_RANGE_DAYS} dias.`);
  }
  return period;
}

/** Período anterior, com a mesma duração, terminando no dia antes do início. */
export function previousPeriod(period: Period): Period {
  const days = daysInPeriod(period);
  return { from: addDays(period.from, -days), to: addDays(period.from, -1) };
}

/** Lista todos os dias do período ("AAAA-MM-DD"), para o gráfico mostrar também os dias sem venda. */
export function listDays(period: Period): string[] {
  return Array.from({ length: daysInPeriod(period) }, (_, index) => addDays(period.from, index));
}
