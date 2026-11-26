// Seção "Pagamentos" do detalhe da saída: resumo, vencimentos, lista de pagamentos e ações.
//
// Tudo vem de GET /api/orders/:id/payments. A tela não soma nem decide nada: só mostra e chama a API.
// Cada ação (confirmar, compensar cheque, estornar) é conferida de novo pelo backend.
import { useCallback, useEffect, useState } from "react";
import {
  clearCheck,
  confirmPayment,
  getOrderPayments,
  listReceivingAccounts,
  reversePayment,
  type OrderPayments,
  type Payment,
  type ReceivingAccount,
} from "../../api/payments";
import { FormErrors } from "../../components/FormErrors";
import { formatDate, formatDateTime, formatMoney } from "../../lib/format";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "../../lib/labels";
import { availableActions, canEditDueDates, type PaymentAction } from "../../lib/payments";
import { DueDatesEditor } from "./DueDatesEditor";
import { PaymentForm } from "./PaymentForm";

interface Props {
  orderId: string;
  /** Total da saída, para o editor de vencimentos. */
  orderTotal: string;
  /** Avisa a página quando algo mudou (ex.: recarregar a lista). */
  onChanged?: () => void;
}

export function PaymentsSection({ orderId, orderTotal, onChanged }: Props) {
  const [data, setData] = useState<OrderPayments | null>(null);
  const [accounts, setAccounts] = useState<ReceivingAccount[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [registering, setRegistering] = useState(false);
  const [editingDues, setEditingDues] = useState(false);
  const [action, setAction] = useState<{ payment: Payment; kind: PaymentAction } | null>(null);
  const [actionAccount, setActionAccount] = useState("");
  const [actionText, setActionText] = useState("");
  const [actionError, setActionError] = useState<unknown>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getOrderPayments(orderId));
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
    listReceivingAccounts()
      .then(({ accounts }) => setAccounts(accounts))
      .catch(() => undefined);
  }, [load]);

  function openAction(payment: Payment, kind: PaymentAction) {
    setAction({ payment, kind });
    setActionAccount("");
    setActionText("");
    setActionError(null);
  }

  async function afterChange(message: string) {
    setNotice(message);
    setRegistering(false);
    setEditingDues(false);
    setAction(null);
    await load();
    onChanged?.();
  }

  async function runAction() {
    if (!action) return;
    setWorking(true);
    setActionError(null);
    try {
      const { payment, kind } = action;
      if (kind === "confirm") await confirmPayment(payment.id, { note: actionText.trim() || undefined });
      if (kind === "clear") await clearCheck(payment.id, { accountId: actionAccount, note: actionText.trim() || undefined });
      if (kind === "reverse") await reversePayment(payment.id, { reason: actionText });
      await afterChange(
        kind === "confirm" ? "Recebimento confirmado." : kind === "clear" ? "Cheque compensado." : "Pagamento estornado. O valor voltou ao saldo.",
      );
    } catch (err) {
      setActionError(err);
    } finally {
      setWorking(false);
    }
  }

  if (error) return <FormErrors error={error} />;
  if (!data) return <p className="page-message">Carregando pagamentos…</p>;

  const { summary } = data;
  const hasAvailable = summary.available !== "0.00";
  const banks = accounts.filter((account) => account.kind === "BANK");
  const actionLabels: Record<PaymentAction, string> = { confirm: "Confirmar recebimento", clear: "Compensar cheque", reverse: "Estornar" };

  return (
    <section className="card payments-section" aria-label="Pagamentos">
      <div className="card-head">
        <h2>Pagamentos</h2>
        {data.canReceive && hasAvailable && !registering && (
          <button type="button" className="button-primary" onClick={() => setRegistering(true)}>
            Registrar pagamento
          </button>
        )}
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      {!data.canReceive && (
        <p className="alert alert-notice">
          {data.orderStatus === "PENDING"
            ? "Saídas pendentes ainda não recebem pagamentos. Confirme a saída primeiro."
            : "Saídas canceladas não recebem novos pagamentos. Os já lançados continuam aqui para consulta e estorno."}
        </p>
      )}

      <dl className="payment-summary">
        <div>
          <dt>Total da saída</dt>
          <dd>{formatMoney(summary.total)}</dd>
        </div>
        <div>
          <dt>Total recebido</dt>
          <dd className="amount-ok">{formatMoney(summary.received)}</dd>
        </div>
        <div>
          <dt>A compensar</dt>
          <dd>{formatMoney(summary.toClear)}</dd>
        </div>
        <div>
          <dt>Pendentes de conferência</dt>
          <dd>{formatMoney(summary.pending)}</dd>
        </div>
        <div>
          <dt>Saldo a receber</dt>
          <dd className="amount-strong">{formatMoney(summary.balance)}</dd>
        </div>
        <div>
          <dt>Disponível para novos registros</dt>
          <dd>{formatMoney(summary.available)}</dd>
        </div>
      </dl>
      <p className="muted small">
        Só pagamentos <strong>Confirmados</strong> contam como recebido. Pendentes e A compensar não reduzem o saldo a receber, mas já ocupam o valor da
        saída.
      </p>

      {registering && (
        <PaymentForm orderId={orderId} accounts={accounts} available={summary.available} onSaved={() => void afterChange("Pagamento registrado.")} onCancel={() => setRegistering(false)} />
      )}

      {data.paymentTerm !== "IMMEDIATE" && (
        <div className="due-dates">
          <div className="card-head">
            <h3>Vencimentos</h3>
            {canEditDueDates(data) && !editingDues && (
              <button type="button" className="button-secondary" onClick={() => setEditingDues(true)}>
                {data.dueDates.length > 0 ? "Editar vencimentos" : "Definir vencimentos"}
              </button>
            )}
          </div>
          {editingDues && (
            <DueDatesEditor
              orderId={orderId}
              total={orderTotal}
              negotiated={data.paymentTerm === "NEGOTIATED"}
              current={data.dueDates}
              onSaved={() => void afterChange("Vencimentos salvos.")}
              onCancel={() => setEditingDues(false)}
            />
          )}
          {data.overdueAmount !== "0.00" && <p className="alert alert-error">Em atraso: {formatMoney(data.overdueAmount)}.</p>}
          {data.dueDates.length === 0 ? (
            <p className="muted">
              {data.paymentTerm === "NEGOTIATED" ? "Prazo negociado: defina os vencimentos." : "Nenhum vencimento registrado."}
            </p>
          ) : (
            <div className="table-wrapper table-flat">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Vencimento</th>
                    <th className="numeric">Valor</th>
                    <th className="numeric">Pago</th>
                    <th className="numeric">Em aberto</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dueDates.map((due) => (
                    <tr key={due.id}>
                      <td>{due.sequence}</td>
                      <td>{formatDate(due.dueDate)}</td>
                      <td className="numeric">{formatMoney(due.amount)}</td>
                      <td className="numeric">{formatMoney(due.paid)}</td>
                      <td className="numeric">{formatMoney(due.open)}</td>
                      <td>
                        {due.overdue ? <span className="badge badge-cancelled">Em atraso</span> : due.open === "0.00" ? <span className="badge badge-completed">Pago</span> : <span className="badge">Em aberto</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted small">Os pagamentos Confirmados abatem os vencimentos mais antigos primeiro.</p>
        </div>
      )}

      <h3>Lançamentos</h3>
      {data.payments.length === 0 ? (
        <p className="muted">Nenhum pagamento registrado.</p>
      ) : (
        <div className="table-wrapper table-flat">
          <table className="payments-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Meio</th>
                <th>Conta</th>
                <th className="numeric">Valor</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((payment) => (
                <tr key={payment.id} className={payment.status === "REVERSED" ? "row-reversed" : undefined}>
                  <td>{formatDate(payment.receivedAt)}</td>
                  <td>
                    {PAYMENT_METHOD_LABELS[payment.method]}
                    {payment.check && (
                      <div className="muted small">
                        nº {payment.check.number} · {payment.check.bank} · compensação prevista {formatDate(payment.check.expectedClearingDate)}
                      </div>
                    )}
                    {payment.notes && <div className="muted small">{payment.notes}</div>}
                    <details className="payment-history">
                      <summary className="small">Histórico</summary>
                      <ul className="small">
                        {payment.history.map((entry) => (
                          <li key={entry.changedAt + entry.toStatus}>
                            {formatDateTime(entry.changedAt)} · {entry.fromStatus ? `${PAYMENT_STATUS_LABELS[entry.fromStatus]} → ` : "Registrado como "}
                            {PAYMENT_STATUS_LABELS[entry.toStatus]} · {entry.changedBy}
                            {entry.fromAccount && entry.toAccount && <span> · conta: {entry.fromAccount} → {entry.toAccount}</span>}
                            {entry.reason && <span className="muted"> · {entry.reason}</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td>{payment.account.name}</td>
                  <td className="numeric">{formatMoney(payment.amount)}</td>
                  <td>
                    <span className={`badge badge-pay-${payment.status.toLowerCase()}`}>{PAYMENT_STATUS_LABELS[payment.status]}</span>
                  </td>
                  <td className="row-actions">
                    {availableActions(payment).map((kind) => (
                      <button key={kind} type="button" className="button-link" onClick={() => openAction(payment, kind)}>
                        {actionLabels[kind]}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {action && (
        <div className="card confirm-panel" role="alertdialog" aria-labelledby="pay-action-title">
          <h3 id="pay-action-title">
            {actionLabels[action.kind]}: {PAYMENT_METHOD_LABELS[action.payment.method]} de {formatMoney(action.payment.amount)}?
          </h3>
          {action.kind === "confirm" && <p className="muted small">Confirme só depois de conferir o recebimento. A partir daqui o valor conta como recebido.</p>}
          {action.kind === "reverse" && (
            <p className="muted small">O estorno não apaga o lançamento: ele fica no histórico e o valor volta ao saldo. Um pagamento substituto deve ser registrado como novo.</p>
          )}
          <FormErrors error={actionError} />
          {action.kind === "clear" && (
            <label>
              Conta onde o cheque foi depositado
              <select value={actionAccount} onChange={(e) => setActionAccount(e.target.value)} aria-label="Conta de destino da compensação">
                <option value="">Escolha…</option>
                {banks.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {action.kind === "reverse" ? "Motivo do estorno (obrigatório)" : "Observação (opcional)"}
            <input value={actionText} onChange={(e) => setActionText(e.target.value)} maxLength={500} aria-label={action.kind === "reverse" ? "Motivo do estorno" : "Observação"} />
          </label>
          <div className="form-actions">
            <button type="button" className="button-primary" disabled={working} onClick={() => void runAction()}>
              {working ? "Salvando…" : `Sim, ${actionLabels[action.kind].toLowerCase()}`}
            </button>
            <button type="button" className="button-secondary" disabled={working} onClick={() => setAction(null)}>
              Voltar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
