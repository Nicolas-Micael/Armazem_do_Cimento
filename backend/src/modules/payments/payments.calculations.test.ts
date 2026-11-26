// Testes das contas de pagamentos: resumo de valores e distribuição pelos vencimentos.
import { describe, expect, it } from "vitest";
import { Decimal } from "../../lib/money.js";
import { allocateDueDates, summarizePayments, summaryToPublic } from "./payments.calculations.js";

const d = (value: string) => new Decimal(value);

describe("summarizePayments", () => {
  it("separa recebido, a compensar, pendente, saldo e disponível (exemplo da decisão 8)", () => {
    const summary = summarizePayments(d("2000"), [
      { amount: d("500"), status: "CONFIRMED" },
      { amount: d("1000"), status: "TO_CLEAR" },
    ]);
    expect(summaryToPublic(summary)).toEqual({
      total: "2000.00",
      received: "500.00",
      toClear: "1000.00",
      pending: "0.00",
      balance: "1500.00", // total − Confirmados
      available: "500.00", // total − Confirmados − Pendentes − A compensar
    });
  });

  it("Pendente e A compensar não reduzem o saldo a receber, mas comprometem o disponível", () => {
    const summary = summarizePayments(d("100"), [
      { amount: d("30"), status: "PENDING" },
      { amount: d("20"), status: "TO_CLEAR" },
    ]);
    expect(summary.balance.toFixed(2)).toBe("100.00");
    expect(summary.available.toFixed(2)).toBe("50.00");
  });

  it("Estornado deixa de comprometer o limite e não conta como recebido", () => {
    const summary = summarizePayments(d("100"), [
      { amount: d("60"), status: "REVERSED" },
      { amount: d("10"), status: "CONFIRMED" },
    ]);
    expect(summary.received.toFixed(2)).toBe("10.00");
    expect(summary.available.toFixed(2)).toBe("90.00");
  });

  it("soma valores decimais sem erro de ponto flutuante", () => {
    const summary = summarizePayments(d("0.30"), [
      { amount: d("0.10"), status: "CONFIRMED" },
      { amount: d("0.20"), status: "CONFIRMED" },
    ]);
    expect(summary.received.toFixed(2)).toBe("0.30");
    expect(summary.balance.toFixed(2)).toBe("0.00");
  });
});

describe("allocateDueDates", () => {
  const dues = [
    { id: "b", sequence: 2, dueDate: "2026-12-20", amount: d("300.00") },
    { id: "a", sequence: 1, dueDate: "2026-12-05", amount: d("700.00") },
  ];

  it("abate os vencimentos mais antigos primeiro", () => {
    const result = allocateDueDates(dues, d("800.00"), "2026-12-01");
    expect(result.map((due) => due.id)).toEqual(["a", "b"]);
    expect(result[0]).toMatchObject({ paid: d("700.00"), open: d("0.00"), overdue: false });
    expect(result[1]).toMatchObject({ paid: d("100.00"), open: d("200.00") });
  });

  it("nada recebido: tudo em aberto", () => {
    const result = allocateDueDates(dues, d("0"), "2026-12-01");
    expect(result.map((due) => due.open.toFixed(2))).toEqual(["700.00", "300.00"]);
  });

  it("atraso: vencimento anterior a hoje com valor em aberto (no dia do vencimento ainda não está atrasado)", () => {
    expect(allocateDueDates(dues, d("0"), "2026-12-05")[0]!.overdue).toBe(false);
    expect(allocateDueDates(dues, d("0"), "2026-12-06")[0]!.overdue).toBe(true);
  });

  it("vencimento totalmente pago não fica em atraso", () => {
    const result = allocateDueDates(dues, d("700.00"), "2027-01-01");
    expect(result[0]!.overdue).toBe(false);
    expect(result[1]!.overdue).toBe(true);
  });

  it("recebido maior que a soma dos vencimentos não gera valor negativo", () => {
    const result = allocateDueDates(dues, d("5000"), "2027-01-01");
    expect(result.every((due) => due.open.eq(0))).toBe(true);
  });
});
