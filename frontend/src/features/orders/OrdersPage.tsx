// Lista de Saídas de Cimento: filtros, ordenação, totalizadores e paginação.
//
// Todos os filtros e os totais são calculados no backend sobre o filtro inteiro
// (não só sobre a página mostrada).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { listCustomers } from "../../api/customers";
import {
  listOrders,
  type Order,
  type OrderListParams,
  type OrderListTotals,
  type OrderSortField,
  type OrderStatus,
  type PaymentTerm,
} from "../../api/orders";
import { listProducts } from "../../api/products";
import type { Customer, Page, Product } from "../../api/types";
import { FormErrors } from "../../components/FormErrors";
import { Pagination } from "../../components/Pagination";
import { formatDateTime, formatInteger, formatMoney } from "../../lib/format";
import { ORDER_STATUS_LABELS, PAYMENT_TERM_LABELS } from "../../lib/labels";
import { StatusBadge } from "./StatusBadge";

interface Filters {
  search: string;
  from: string;
  to: string;
  customerId: string;
  productId: string;
  paymentTerm: PaymentTerm | "all";
  status: OrderStatus | "all";
}

const NO_FILTERS: Filters = { search: "", from: "", to: "", customerId: "", productId: "", paymentTerm: "all", status: "all" };

/** Produtos da saída para a coluna "Produtos": o primeiro nome, ou "N produtos". */
function productsSummary(order: Order): string {
  const names = [...new Set(order.items.map((item) => item.productName))];
  return names.length === 1 ? (names[0] ?? "") : `${names.length} produtos`;
}

/** Valor unitário: o preço único, ou "vários" quando há produtos/preços diferentes. */
function unitPriceSummary(order: Order): string {
  const prices = new Set(order.items.map((item) => item.unitPrice));
  const [only] = [...prices];
  return prices.size === 1 && only ? formatMoney(only) : "vários";
}

export function OrdersPage() {
  const navigate = useNavigate();
  // A busca rápida do cabeçalho chega pelo endereço: /pedidos?busca=texto
  const [params] = useSearchParams();
  const urlSearch = params.get("busca") ?? "";
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, search: urlSearch });
  const [searchText, setSearchText] = useState(urlSearch);
  const [sortBy, setSortBy] = useState<OrderSortField>("number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Page & { orders: Order[]; totals: OrderListTotals }) | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  // Nova busca rápida enquanto já está nesta tela: atualiza o filtro.
  useEffect(() => {
    setSearchText(urlSearch);
    setFilters((current) => ({ ...current, search: urlSearch }));
    setPage(1);
  }, [urlSearch]);

  // Opções dos filtros de cliente e produto (inclui inativos: o histórico mostra todos).
  useEffect(() => {
    listCustomers({ status: "all" }).then(({ customers }) => setCustomers(customers)).catch(() => undefined);
    listProducts({ status: "all" }).then(({ products }) => setProducts(products)).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const query: OrderListParams = { ...filters, sortBy, sortDir, page };
    listOrders(query)
      .then((result) => !cancelled && setData(result))
      .catch((err: unknown) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [filters, sortBy, sortDir, page]);

  // Atalhos: "/" foca a busca e "N" abre uma nova saída (só fora de campos de digitação).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key.toLowerCase() === "n") {
        navigate("/pedidos/novo");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  function change(changes: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...changes }));
    setPage(1);
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    change({ search: searchText.trim() });
  }

  function clearFilters() {
    setSearchText("");
    setFilters(NO_FILTERS);
    setPage(1);
  }

  function sortOn(field: OrderSortField) {
    if (field === sortBy) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir(field === "customer" || field === "status" ? "asc" : "desc");
    }
    setPage(1);
  }

  function sortHeader(field: OrderSortField, label: string, numeric = false) {
    const active = sortBy === field;
    return (
      <th key={field} className={numeric ? "numeric" : undefined} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" className="sort-button" onClick={() => sortOn(field)}>
          {label}
          <span aria-hidden="true">{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</span>
        </button>
      </th>
    );
  }

  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <>
      <div className="page-title">
        <h1>Saídas de Cimento</h1>
        <Link to="/pedidos/novo" className="button-primary">
          Nova Saída
        </Link>
      </div>

      <form className="card filters" onSubmit={handleSearch} role="search">
        <div className="filters-grid">
          <label className="filter-search">
            Buscar
            <input
              ref={searchRef}
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Número (ex.: 123) ou cliente — tecla /"
            />
          </label>
          <label>
            De
            <input type="date" value={filters.from} onChange={(e) => change({ from: e.target.value })} />
          </label>
          <label>
            Até
            <input type="date" value={filters.to} onChange={(e) => change({ to: e.target.value })} />
          </label>
          <label>
            Cliente
            <select value={filters.customerId} onChange={(e) => change({ customerId: e.target.value })}>
              <option value="">Todos</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Produto
            <select value={filters.productId} onChange={(e) => change({ productId: e.target.value })}>
              <option value="">Todos</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Condição de pagamento
            <select value={filters.paymentTerm} onChange={(e) => change({ paymentTerm: e.target.value as PaymentTerm | "all" })}>
              <option value="all">Todas</option>
              {(Object.keys(PAYMENT_TERM_LABELS) as PaymentTerm[]).map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_TERM_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Situação
            <select value={filters.status} onChange={(e) => change({ status: e.target.value as OrderStatus | "all" })}>
              <option value="all">Todas</option>
              {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((value) => (
                <option key={value} value={value}>
                  {ORDER_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="button-secondary">
            Buscar
          </button>
          {filtered && (
            <button type="button" className="button-link" onClick={clearFilters}>
              Limpar filtros
            </button>
          )}
        </div>
      </form>

      <FormErrors error={error} />

      {data && (
        <section className="kpi-grid" aria-label="Totais do filtro">
          <div className="kpi">
            <span className="kpi-label">Saídas confirmadas</span>
            <strong className="kpi-value">{formatInteger(data.totals.effective.ordersCount)}</strong>
            <span className="kpi-variation">{formatInteger(data.totals.effective.bagsSold)} sacos</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Valor das confirmadas</span>
            <strong className="kpi-value">{formatMoney(data.totals.effective.total)}</strong>
            <span className="kpi-variation">Confirmado em diante</span>
          </div>
          <div className="kpi kpi-pending">
            <span className="kpi-label">Pendentes (rascunhos)</span>
            <strong className="kpi-value">{formatInteger(data.totals.pending.ordersCount)}</strong>
            <span className="kpi-variation">
              {formatInteger(data.totals.pending.bagsSold)} sacos · {formatMoney(data.totals.pending.total)}
            </span>
          </div>
        </section>
      )}
      {data && <p className="muted small kpi-note">Totais sobre todo o filtro, não só a página. Pendentes e canceladas não entram nas confirmadas.</p>}

      {!data && !error && <p className="page-message">Carregando saídas…</p>}
      {data && data.orders.length === 0 && (
        <p className="page-message">{filtered ? "Nenhuma saída encontrada com estes filtros." : "Nenhuma saída registrada ainda."}</p>
      )}
      {data && data.orders.length > 0 && (
        <>
          <div className="table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  {sortHeader("number", "Número")}
                  {sortHeader("createdAt", "Data")}
                  {sortHeader("customer", "Cliente")}
                  <th>Produtos</th>
                  <th className="numeric">Quantidade</th>
                  <th className="numeric">Valor unitário</th>
                  {sortHeader("total", "Valor total", true)}
                  <th>Pagamento</th>
                  {sortHeader("status", "Situação")}
                  <th>Ações</th>
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
                    <td>{productsSummary(order)}</td>
                    <td className="numeric">{formatInteger(order.items.reduce((sum, item) => sum + item.quantity, 0))} sacos</td>
                    <td className="numeric">{unitPriceSummary(order)}</td>
                    <td className="numeric">{formatMoney(order.total)}</td>
                    <td>{PAYMENT_TERM_LABELS[order.paymentTerm]}</td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="row-actions">
                      <Link to={`/pedidos/${order.id}`}>Visualizar</Link>
                      {order.status === "PENDING" && <Link to={`/pedidos/${order.id}/editar`}>Editar</Link>}
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
