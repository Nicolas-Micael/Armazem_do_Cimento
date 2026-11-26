import { describe, expect, it } from "vitest";
import { advanceLabel, canCancelStatus, canRevert, nextSteps } from "./orderStatus";

describe("nextSteps", () => {
  it("entrega não pula etapas", () => {
    expect(nextSteps("CONFIRMED", "DELIVERY")).toEqual(["PICKING"]);
    expect(nextSteps("PICKING", "DELIVERY")).toEqual(["OUT_FOR_DELIVERY"]);
    expect(nextSteps("OUT_FOR_DELIVERY", "DELIVERY")).toEqual(["COMPLETED"]);
  });
  it("retirada pode concluir direto de Em separação", () => {
    expect(nextSteps("PICKING", "PICKUP")).toEqual(["OUT_FOR_DELIVERY", "COMPLETED"]);
  });
  it("Pendente, Concluído e Cancelado não avançam", () => {
    for (const s of ["PENDING", "COMPLETED", "CANCELLED"] as const) expect(nextSteps(s, "DELIVERY")).toEqual([]);
  });
});

describe("retorno e cancelamento", () => {
  it("só retorna de Em separação e Saiu para entrega", () => {
    expect(["PENDING", "CONFIRMED", "PICKING", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"].map((s) => canRevert(s as never))).toEqual([false, false, true, true, false, false]);
  });
  it("cancela Pendente, Confirmado e Em separação apenas", () => {
    expect(["PENDING", "CONFIRMED", "PICKING", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"].map((s) => canCancelStatus(s as never))).toEqual([true, true, true, false, false, false]);
  });
  it("rótulos mudam conforme entrega/retirada", () => {
    expect(advanceLabel("COMPLETED", "PICKUP")).toBe("Concluir (retirado)");
    expect(advanceLabel("COMPLETED", "DELIVERY")).toBe("Concluir (entregue)");
  });
});
