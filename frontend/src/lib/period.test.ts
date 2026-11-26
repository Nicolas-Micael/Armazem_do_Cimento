import { describe, expect, it } from "vitest";
import { presetPeriod, todayInBrazil } from "./period";

const NOW = new Date("2026-11-26T16:00:00Z");

describe("presetPeriod", () => {
  it("este mês: do dia 1º até hoje", () => {
    expect(presetPeriod("this-month", NOW)).toEqual({ from: "2026-11-01", to: "2026-11-26" });
  });
  it("mês passado: mês inteiro anterior, inclusive na virada de ano", () => {
    expect(presetPeriod("last-month", NOW)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetPeriod("last-month", new Date("2027-01-10T12:00:00Z"))).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
  it("últimos 7 e 30 dias contam o dia de hoje", () => {
    expect(presetPeriod("last-7", NOW)).toEqual({ from: "2026-11-20", to: "2026-11-26" });
    expect(presetPeriod("last-30", NOW)).toEqual({ from: "2026-10-28", to: "2026-11-26" });
  });
  it("usa a data de Brasília (01:30 UTC ainda é o dia anterior)", () => {
    expect(todayInBrazil(new Date("2026-12-01T01:30:00Z"))).toBe("2026-11-30");
  });
});
