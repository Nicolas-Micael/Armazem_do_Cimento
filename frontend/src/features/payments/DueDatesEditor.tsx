// Edição dos vencimentos de uma saída a prazo (só enquanto não há pagamento ativo).
// Prazo de 10/15/30 dias: um único vencimento (a data é editável).
// Prazo negociado: um ou mais vencimentos; a soma precisa ser igual ao total (o backend confere).
import { useState, type FormEvent } from "react";
import { setDueDates, type DueDate } from "../../api/payments";
import { FormErrors } from "../../components/FormErrors";
import { MoneyInput } from "../../components/MoneyInput";
import { moneyApiToInput, moneyInputToApi } from "../../lib/format";

interface Props {
  orderId: string;
  total: string;
  negotiated: boolean;
  current: DueDate[];
  onSaved: () => void;
  onCancel: () => void;
}

interface Row {
  key: number;
  date: string;
  amount: string;
}

let nextKey = 1;

export function DueDatesEditor({ orderId, total, negotiated, current, onSaved, onCancel }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    current.length > 0
      ? current.map((due) => ({ key: nextKey++, date: due.dueDate, amount: moneyApiToInput(due.amount) }))
      : [{ key: nextKey++, date: "", amount: negotiated ? "" : moneyApiToInput(total) }],
  );
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(key: number, changes: Partial<Row>) {
    setRows((list) => list.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await setDueDates(
        orderId,
        rows.map((row) => ({ dueDate: row.date, amount: moneyInputToApi(negotiated ? row.amount : moneyApiToInput(total)) })),
      );
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} noValidate>
      <h3>{current.length > 0 ? "Editar vencimentos" : "Definir vencimentos"}</h3>
      <FormErrors error={error} />
      <div className="table-wrapper table-flat">
        <table className="items-table">
          <thead>
            <tr>
              <th>Vencimento</th>
              <th>Valor</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key}>
                <td>
                  <input type="date" value={row.date} onChange={(e) => update(row.key, { date: e.target.value })} aria-label={`Data do vencimento ${index + 1}`} />
                </td>
                <td>
                  {negotiated ? (
                    <MoneyInput value={row.amount} onChange={(value) => update(row.key, { amount: value })} aria-label={`Valor do vencimento ${index + 1}`} />
                  ) : (
                    <span>{moneyApiToInput(total)}</span>
                  )}
                </td>
                <td>
                  {negotiated && rows.length > 1 && (
                    <button type="button" className="button-link" onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}>
                      Remover
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {negotiated && (
        <button type="button" className="button-secondary" onClick={() => setRows((list) => [...list, { key: nextKey++, date: "", amount: "" }])}>
          + Adicionar vencimento
        </button>
      )}
      <p className="muted small">
        {negotiated ? "A soma dos vencimentos deve ser igual ao total da saída." : "Prazo fixo: um único vencimento, com o valor total da saída."} Os
        vencimentos anteriores ficam guardados no histórico.
      </p>
      <div className="form-actions">
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Salvando…" : "Salvar vencimentos"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
