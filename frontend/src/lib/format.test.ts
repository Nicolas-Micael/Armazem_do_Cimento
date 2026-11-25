import { describe, expect, it } from "vitest";
import { formatDateTime, formatMoney } from "./format";

describe("formatMoney", () => {
  it("formata no padrão brasileiro", () => {
    expect(formatMoney("1234.5")).toBe("R$ 1.234,50");
    expect(formatMoney("0.05")).toBe("R$ 0,05");
    expect(formatMoney("1500")).toBe("R$ 1.500,00");
    expect(formatMoney("1234567.89")).toBe("R$ 1.234.567,89");
    expect(formatMoney("-10.00")).toBe("-R$ 10,00");
  });

  it("recusa valores inválidos em vez de mostrar algo errado", () => {
    expect(() => formatMoney("12,50")).toThrow();
  });
});

describe("formatDateTime", () => {
  it("usa o horário de Brasília", () => {
    expect(formatDateTime("2026-11-25T20:28:00.000Z")).toBe("25/11/2026, 17:28");
  });
});
