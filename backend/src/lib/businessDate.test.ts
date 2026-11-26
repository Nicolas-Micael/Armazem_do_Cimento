import { describe, expect, it } from "vitest";
import { startOfBusinessDay, startOfNextBusinessDay } from "./businessDate.js";

describe("dia de Brasília", () => {
  it("meia-noite de Brasília é 03:00 UTC", () => {
    expect(startOfBusinessDay("2026-11-30").toISOString()).toBe("2026-11-30T03:00:00.000Z");
    expect(startOfBusinessDay("2026-01-01").toISOString()).toBe("2026-01-01T03:00:00.000Z");
  });

  it("o fim do filtro é o início do dia seguinte, inclusive na virada de mês e de ano", () => {
    expect(startOfNextBusinessDay("2026-11-30").toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(startOfNextBusinessDay("2026-12-31").toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
});
