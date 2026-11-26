// Lista de pedidos, com busca por número ou cliente e filtro por status.
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { listOrders, type Order, type OrderStatus } from "../../api/orders";
import type { Page } from "../../api/types";
import { formatDateTime, formatMoney } from "../../lib/format";
import { ORDER_STATUS_LABELS, PAYMENT_TERM_LABELS } from "../../lib/labels";
import { FormErrors } from "../../components/FormErrors";
import { Pagination } from "../../components/Pagination";
import { StatusBadge } from "./StatusBadge";

export function OrdersPage() {
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Page & { orders: Order[] }) | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    listOrders({ search, status, page })
      .then((result) => !cancelled && setData(result))
      .catch((err: unknown) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [search, status, page]);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchText.trim());
    setPage(1);
  }

  return (
    <>
      <div className="page-title">
        <h1>Pedidos</h1>
        <Link to="/pedidos/novo" className="button-primary">
          Novo pedido
        </Link>
      </div>

      <form className="toolbar" onSubmit={handleSearch} role="search">
        <input
          type="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Buscar por número (ex.: 123) ou cliente"
          aria-label="Buscar"
        />
        <button type="submit" className="button-secondary">
          Buscar
        </button>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OrderStatus | "all");
            setPage(1);
          }}
          aria-label="Status"
        >
          <option value="all">Todos os status</option>
          {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((value) => (
            <option key={value} value={value}>
              {ORDER_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </form>

      <FormErrors error={error} />
      {!data && !error && <p className="page-message">Carregando pedidos…</p>}
      {data && data.orders.length === 0 && <p className="page-message">Nenhum pedido encontrado.</p>}
      {data && data.orders.length > 0 && (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Pagamento</th>
                  <th className="numeric">Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link to={`/pedidos/${order.id}`}>{order.code}</Link>
                    </td>
                    <td>{formatDateTime(order.createdAt)}</td>
                    <td>{order.customerName}</td>
                    <td>{PAYMENT_TERM_LABELS[order.paymentTerm]}</td>
                    <td className="numeric">{formatMoney(order.total)}</td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </>
      )}
    </>
  );
}
