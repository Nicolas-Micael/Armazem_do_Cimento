// Períodos prontos do painel. Datas "AAAA-MM-DD" no horário de Brasília,
// o mesmo critério que o backend usa para somar as saídas.
import type { Period } from "../api/dashboard";

const DAY_MS = 24 * 60 * 60 * 1000;

export function todayInBrazil(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export type PresetId = "this-month" | "last-month" | "last-7" | "last-30" | "custom";

export const PRESET_LABELS: Record<PresetId, string> = {
  "this-month": "Este mês",
  "last-month": "Mês passado",
  "last-7": "Últimos 7 dias",
  "last-30": "Últimos 30 dias",
  custom: "Personalizado",
};

/** Calcula o período de um atalho. "custom" não tem período próprio (usa as datas digitadas). */
export function presetPeriod(preset: Exclude<PresetId, "custom">, now: Date = new Date()): Period {
  const today = todayInBrazil(now);
  const firstOfMonth = `${today.slice(0, 8)}01`;
  switch (preset) {
    case "this-month":
      return { from: firstOfMonth, to: today };
    case "last-month": {
      const lastDay = addDays(firstOfMonth, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
    case "last-7":
      return { from: addDays(today, -6), to: today };
    case "last-30":
      return { from: addDays(today, -29), to: today };
  }
}
