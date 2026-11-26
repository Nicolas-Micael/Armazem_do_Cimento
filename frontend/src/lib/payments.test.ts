import { describe, expect, it } from "vitest";
import { accountRule, availableActions, canEditDueDates, initialStatusHint } from "./payments";

describe("availableActions", () => {
  it("Pendente confirma ou estorna; A compensar compensa ou estorna; Confirmado só estorna; Estornado nada", () => {
    expect(availableActions({ status: "PENDING", method: "PIX" })).toEqual(["confirm", "reverse"]);
    expect(availableActions({ status: "TO_CLEAR", method: "CHECK" })).toEqual(["clear", "reverse"]);
    expect(availableActions({ status: "CONFIRMED", method: "CASH" })).toEqual(["reverse"]);
    expect(availableActions({ status: "REVERSED", method: "CASH" })).toEqual([]);
  });
});

describe("accountRule e initialStatusHint", () => {
  it("dinheiro e cheque têm conta fixa; os demais escolhem conta bancária", () => {
    expect(accountRule("CASH")).toBe("cash-box");
    expect(accountRule("CHECK")).toBe("check-wallet");
    for (const method of ["PIX", "DEPOSIT", "TRANSFER", "DEBIT_CARD", "CREDIT_CARD"] as const) expect(accountRule(method)).toBe("bank");
  });
  it("situação inicial por meio", () => {
    expect(initialStatusHint("CASH")).toBe("CONFIRMED");
    expect(initialStatusHint("CREDIT_CARD")).toBe("CONFIRMED");
    expect(initialStatusHint("PIX")).toBe("PENDING");
    expect(initialStatusHint("DEPOSIT")).toBe("PENDING");
    expect(initialStatusHint("TRANSFER")).toBe("PENDING");
    expect(initialStatusHint("CHECK")).toBe("TO_CLEAR");
  });
});

describe("canEditDueDates", () => {
  const base = { orderStatus: "CONFIRMED", paymentTerm: "NEGOTIATED", payments: [] as { status: "PENDING" | "REVERSED" }[] };
  it("só a prazo, confirmada e sem pagamento ativo", () => {
    expect(canEditDueDates(base)).toBe(true);
    expect(canEditDueDates({ ...base, paymentTerm: "IMMEDIATE" })).toBe(false);
    expect(canEditDueDates({ ...base, orderStatus: "PENDING" })).toBe(false);
    expect(canEditDueDates({ ...base, orderStatus: "CANCELLED" })).toBe(false);
    expect(canEditDueDates({ ...base, payments: [{ status: "PENDING" }] })).toBe(false);
    expect(canEditDueDates({ ...base, payments: [{ status: "REVERSED" }] })).toBe(true);
  });
});
