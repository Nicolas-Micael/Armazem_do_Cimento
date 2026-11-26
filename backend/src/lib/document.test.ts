import { describe, expect, it } from "vitest";
import { isValidCnpj, isValidCpf, isValidCpfOrCnpj, onlyDigits } from "./document.js";

// Números gerados apenas para teste (não pertencem a pessoas reais).
const VALID_CPF = "52998224725";
const VALID_CNPJ = "11222333000181";

describe("onlyDigits", () => {
  it("remove pontos, traços, barras e espaços", () => {
    expect(onlyDigits(" 529.982.247-25 ")).toBe(VALID_CPF);
    expect(onlyDigits("11.222.333/0001-81")).toBe(VALID_CNPJ);
  });
});

describe("CPF", () => {
  it("aceita CPF válido", () => expect(isValidCpf(VALID_CPF)).toBe(true));
  it("recusa dígito verificador errado", () => expect(isValidCpf("52998224724")).toBe(false));
  it("recusa números repetidos", () => expect(isValidCpf("11111111111")).toBe(false));
  it("recusa tamanho errado", () => expect(isValidCpf("5299822472")).toBe(false));
});

describe("CNPJ", () => {
  it("aceita CNPJ válido", () => expect(isValidCnpj(VALID_CNPJ)).toBe(true));
  it("recusa dígito verificador errado", () => expect(isValidCnpj("11222333000182")).toBe(false));
  it("recusa números repetidos", () => expect(isValidCnpj("00000000000000")).toBe(false));
});

describe("isValidCpfOrCnpj", () => {
  it("decide pelo tamanho", () => {
    expect(isValidCpfOrCnpj(VALID_CPF)).toBe(true);
    expect(isValidCpfOrCnpj(VALID_CNPJ)).toBe(true);
    expect(isValidCpfOrCnpj("123")).toBe(false);
  });
});
