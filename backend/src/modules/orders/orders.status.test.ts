// Testes da máquina de estados (regras puras).
import { describe, expect, it } from "vitest";
import type { OrderStatus } from "../../generated/prisma/client.js";
import { allowedAdvance, canCancel, previousStatus } from "./orders.status.js";

describe("allowedAdvance", () => {
  it("entrega segue a sequência sem pular etapa", () => {
    expect(allowedAdvance("CONFIRMED", "DELIVERY")).toEqual(["PICKING"]);
    expect(allowedAdvance("PICKING", "DELIVERY")).toEqual(["OUT_FOR_DELIVERY"]);
    expect(allowedAdvance("OUT_FOR_DELIVERY", "DELIVERY")).toEqual(["COMPLETED"]);
  });
  it("retirada pode ir de Em separação direto para Concluído", () => {
    expect(allowedAdvance("PICKING", "PICKUP")).toContain("COMPLETED");
    expect(allowedAdvance("CONFIRMED", "PICKUP")).toEqual(["PICKING"]);
  });
  it("Pendente, Concluído e Cancelado não avançam por aqui", () => {
    for (const status of ["PENDING", "COMPLETED", "CANCELLED"] as OrderStatus[]) {
      expect(allowedAdvance(status, "DELIVERY")).toEqual([]);
      expect(allowedAdvance(status, "PICKUP")).toEqual([]);
    }
  });
});

describe("previousStatus", () => {
  it("volta um passo só; Confirmado não volta a Pendente; Concluído e Cancelado são definitivos", () => {
    expect(previousStatus("PICKING")).toBe("CONFIRMED");
    expect(previousStatus("OUT_FOR_DELIVERY")).toBe("PICKING");
    for (const status of ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"] as OrderStatus[]) expect(previousStatus(status)).toBeNull();
  });
});

describe("canCancel", () => {
  it("só Pendente, Confirmado e Em separação", () => {
    const result = Object.fromEntries((["PENDING", "CONFIRMED", "PICKING", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"] as OrderStatus[]).map((s) => [s, canCancel(s)]));
    expect(result).toEqual({ PENDING: true, CONFIRMED: true, PICKING: true, OUT_FOR_DELIVERY: false, COMPLETED: false, CANCELLED: false });
  });
});
