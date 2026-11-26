// Formulário para registrar um pagamento da saída.
// A situação inicial NÃO é escolhida aqui: o backend decide pelo meio de pagamento.
// A tela só avisa o que vai acontecer.
import { useState, type FormEvent } from "react";
import { registerPayment, type PaymentInput, type PaymentMethod, type ReceivingAccount } from "../../api/payments";
import { FormErrors } from "../../components/FormErrors";
import { MoneyInput } from "../../components/MoneyInput";
import { formatMoney, moneyInputToApi } from "../../lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "../../lib/labels";
import { accountRule, initialStatusHint } from "../../lib/payments";

interface Props {
  orderId: string;
  accounts: ReceivingAccount[];
  /** Valor ainda disponível para novos registros (texto da API). */
  available: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function PaymentForm({ orderId, accounts, available, onSaved, onCancel }: Props) {
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [checkBank, setCheckBank] = useState("");
  const [clearingDate, setClearingDate] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const rule = accountRule(method);
  const banks = accounts.filter((account) => account.kind === "BANK");
  const fixedAccount = accounts.find((account) => account.kind === (rule === "cash-box" ? "CASH_BOX" : "CHECK_WALLET"));
  const status = initialStatusHint(method);
  const statusText: Record<typeof status, string> = {
    CONFIRMED: "Será registrado como Confirmado (já conta como recebido).",
    PENDING: "Será registrado como Pendente: só conta como recebido depois que você conferir o recebimento.",
    TO_CLEAR: "Será registrado como A compensar: só conta como recebido quando o cheque for compensado.",
    REVERSED: "",
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const data: PaymentInput = {
      method,
      amount: moneyInputToApi(amount),
      ...(rule === "bank" && accountId ? { accountId } : {}),
      ...(receivedAt ? { receivedAt } : {}),
      notes: notes.trim() || null,
      ...(method === "CHECK" ? { check: { number: checkNumber, bank: checkBank, expectedClearingDate: clearingDate } } : {}),
    };
    setSubmitting(true);
    try {
      await registerPayment(orderId, data);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid form-wide payment-form" onSubmit={handleSubmit} noValidate>
      <h3 className="span-2">Registrar pagamento</h3>
      <FormErrors error={error} />
      <label>
        Meio de pagamento
        <select
          value={method}
          onChange={(e) => {
            setMethod(e.target.value as PaymentMethod);
            setAccountId("");
          }}
        >
          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => (
            <option key={value} value={value}>
              {PAYMENT_METHOD_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Valor
        <MoneyInput value={amount} onChange={setAmount} aria-label="Valor do pagamento" />
        <span className="muted small">Disponível para novos registros: {formatMoney(available)}</span>
      </label>
      {rule === "bank" ? (
        <label>
          Conta de destino
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Conta de destino">
            <option value="">Escolha…</option>
            {banks.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Conta de destino
          <input value={fixedAccount?.name ?? ""} readOnly aria-label="Conta de destino" />
        </label>
      )}
      <label>
        Data do recebimento
        <input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
        <span className="muted small">Em branco = hoje.</span>
      </label>
      {method === "CHECK" && (
        <>
          <label>
            Número do cheque
            <input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
          </label>
          <label>
            Banco do cheque
            <input value={checkBank} onChange={(e) => setCheckBank(e.target.value)} />
          </label>
          <label>
            Data prevista de compensação
            <input type="date" value={clearingDate} onChange={(e) => setClearingDate(e.target.value)} />
          </label>
        </>
      )}
      <label className="span-2">
        Observações
        <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </label>
      <p className="muted small span-2">
        {statusText[status]} Situação inicial: <strong>{PAYMENT_STATUS_LABELS[status]}</strong>.
      </p>
      <div className="form-actions span-2">
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Registrando…" : "Registrar pagamento"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
