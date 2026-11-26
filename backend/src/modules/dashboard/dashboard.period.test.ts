import { describe, expect, it } from "vitest";
import { ValidationError } from "../../lib/errors.js";
import { daysInPeriod, defaultPeriod, listDays, previousPeriod, todayInBusinessZone, validatePeriod } from "./dashboard.period.js";

describe("período do painel", () => {
  it("usa a data de Brasília, não a do servidor (UTC)", () => {
    // 01/12 01:30 UTC ainda é 30/11 22:30 em Brasília.
    expect(todayInBusinessZone(new Date("2026-12-01T01:30:00Z"))).toBe("2026-11-30");
  });

  it("período padrão: do dia 1º do mês até hoje", () => {
    expect(defaultPeriod(new Date("2026-11-26T16:00:00Z"))).toEqual({ from: "2026-11-01", to: "2026-11-26" });
    expect(defaultPeriod(new Date("2026-12-01T01:30:00Z"))).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });

  it("conta os dias incluindo o primeiro e o último", () => {
    expect(daysInPeriod({ from: "2026-11-01", to: "2026-11-30" })).toBe(30);
    expect(daysInPeriod({ from: "2026-11-05", to: "2026-11-05" })).toBe(1);
  });

  it("período anterior tem a mesma duração e termina na véspera", () => {
    expect(previousPeriod({ from: "2026-11-01", to: "2026-11-30" })).toEqual({ from: "2026-10-02", to: "2026-10-31" });
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-07" })).toEqual({ from: "2026-02-22", to: "2026-02-28" });
  });

  it("lista todos os dias, inclusive na virada de mês", () => {
    expect(listDays({ from: "2026-11-29", to: "2026-12-02" })).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  });

  it("recusa datas inexistentes, ordem invertida e períodos muito longos", () => {
    expect(() => validatePeriod({ from: "2026-02-30", to: "2026-03-05" })).toThrow(ValidationError);
    expect(() => validatePeriod({ from: "2026-11-10", to: "2026-11-01" })).toThrow(ValidationError);
    expect(() => validatePeriod({ from: "2025-01-01", to: "2026-12-31" })).toThrow(ValidationError);
    expect(validatePeriod({ from: "2026-01-01", to: "2026-12-31" })).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
});
