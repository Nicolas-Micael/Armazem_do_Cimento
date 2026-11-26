import { describe, expect, it } from "vitest";
import {
  formatDateTime,
  formatDocument,
  formatMoney,
  formatPhone,
  formatZipCode,
  moneyApiToInput,
  moneyInputToApi,
} from "./format";

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

describe("máscaras de documento, telefone e CEP", () => {
  it("formata CPF e CNPJ", () => {
    expect(formatDocument("52998224725")).toBe("529.982.247-25");
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatDocument(null)).toBe("");
  });

  it("formata telefone fixo e celular", () => {
    expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
  });

  it("formata CEP", () => {
    expect(formatZipCode("01001000")).toBe("01001-000");
  });
});

describe("campo de dinheiro", () => {
  it("converte o padrão brasileiro para o formato da API", () => {
    expect(moneyInputToApi("1.234,56")).toBe("1234.56");
    expect(moneyInputToApi("38,9")).toBe("38.9");
    expect(moneyInputToApi("R$ 40")).toBe("40");
  });

  it("converte o valor da API para edição", () => {
    expect(moneyApiToInput("38.90")).toBe("38,90");
  });
});
