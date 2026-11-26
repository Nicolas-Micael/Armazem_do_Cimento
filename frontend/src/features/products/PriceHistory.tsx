// Histórico de preços de um produto (vem dos registros de auditoria).
import { useEffect, useState } from "react";
import { getPriceHistory } from "../../api/products";
import type { PriceHistoryEntry, Product } from "../../api/types";
import { formatDateTime, formatMoney } from "../../lib/format";
import { FormErrors } from "../../components/FormErrors";

export function PriceHistory({ product, onClose }: { product: Product; onClose: () => void }) {
  const [history, setHistory] = useState<PriceHistoryEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    getPriceHistory(product.id)
      .then(({ history }) => setHistory(history))
      .catch(setError);
  }, [product.id]);

  return (
    <section className="card">
      <div className="page-title">
        <h2>Histórico de preços: {product.name}</h2>
        <button type="button" className="button-secondary" onClick={onClose}>
          Fechar
        </button>
      </div>
      <FormErrors error={error} />
      {!history && !error && <p>Carregando…</p>}
      {history && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Preço anterior</th>
                <th>Novo preço</th>
                <th>Alterado por</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.changedAt + (entry.newPrice ?? "")}>
                  <td>{formatDateTime(entry.changedAt)}</td>
                  <td>{entry.previousPrice ? formatMoney(entry.previousPrice) : "Cadastro"}</td>
                  <td>{entry.newPrice ? formatMoney(entry.newPrice) : "—"}</td>
                  <td>{entry.changedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
