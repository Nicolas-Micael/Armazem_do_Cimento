// Dashboard: indicadores reais das saídas efetivadas, com filtro de período.
//
// Fluxo dos dados: tela → GET /api/dashboard?from=&to= → backend soma no PostgreSQL
// → a tela só mostra. Nenhum número é calculado ou inventado aqui.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getDashboard, type DashboardData, type Period, type Totals } from "../../api/dashboard";
import { getHealth, type HealthResponse } from "../../api/health";
import { formatDate, formatDateTime, formatInteger, formatMoney, formatVariation } from "../../lib/format";
import { PRESET_LABELS, presetPeriod, type PresetId } from "../../lib/period";
import { FormErrors } from "../../components/FormErrors";
import { StatusBadge } from "../orders/StatusBadge";
import { useAuth } from "../auth/AuthContext";
import { BarList, ColumnChart } from "./charts";

type Metric = "bagsSold" | "revenue" | "ordersCount";
const METRIC_LABELS: Record<Metric, string> = { bagsSold: "Sacos", revenue: "Faturamento", ordersCount: "Saídas" };

export function HomePage() {
  const { user } = useAuth();
  const [preset, setPreset] = useState<PresetId>("this-month");
  const [period, setPeriod] = useState<Period>(() => presetPeriod("this-month"));
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [metric, setMetric] = useState<Metric>("bagsSold");
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    // Datas incompletas ou invertidas (período personalizado em edição): não consulta.
    if (!period.from || !period.to || period.from > period.to) return;
    let cancelled = false;
    setError(null);
    getDashboard(period)
      .then((result) => !cancelled && setData(result))
      .catch((err: unknown) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [period]);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  function choosePreset(next: PresetId) {
    setPreset(next);
    if (next !== "custom") setPeriod(presetPeriod(next));
  }

  function changeDate(field: keyof Period, value: string) {
    // Só busca quando as duas datas estão completas e na ordem certa (o backend valida de novo).
    const next = { ...period, [field]: value };
    setPeriod(next);
  }

  const customInvalid = preset === "custom" && (!period.from || !period.to || period.from > period.to);

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Olá, {user?.name}</h1>
          <p className="muted small">
            Indicadores das saídas confirmadas de {formatDate(period.from)} a {formatDate(period.to)}.
          </p>
        </div>
        <div className="form-actions">
          <Link to="/pedidos/novo" className="button-primary">
            Nova Saída
          </Link>
          <Link to="/clientes?novo=1" className="button-secondary">
            Cadastrar cliente
          </Link>
        </div>
      </div>

      <div className="toolbar period-bar">
        <label className="inline-label">
          Período
          <select value={preset} onChange={(e) => choosePreset(e.target.value as PresetId)}>
            {(Object.keys(PRESET_LABELS) as PresetId[]).map((id) => (
              <option key={id} value={id}>
                {PRESET_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        {preset === "custom" && (
          <>
            <label className="inline-label">
              De
              <input type="date" value={period.from} onChange={(e) => changeDate("from", e.target.value)} />
            </label>
            <label className="inline-label">
              Até
              <input type="date" value={period.to} onChange={(e) => changeDate("to", e.target.value)} />
            </label>
          </>
        )}
      </div>
      {customInvalid && <p className="alert alert-error">A data inicial não pode ser depois da data final.</p>}

      <FormErrors error={error} />
      {!data && !error && <p className="page-message">Carregando indicadores…</p>}

      {data && (
        <>
          {data.pendingOrders.ordersCount > 0 && (
            <p className="alert alert-notice">
              {data.pendingOrders.ordersCount === 1 ? "1 saída pendente" : `${data.pendingOrders.ordersCount} saídas pendentes`} (
              {formatMoney(data.pendingOrders.total)}) aguardando confirmação.{" "}
              {data.pendingOrders.ordersCount === 1 ? "Ela ainda" : "Elas ainda"} <strong>não {data.pendingOrders.ordersCount === 1 ? "entra" : "entram"}</strong> nos indicadores abaixo.{" "}
              <Link to="/pedidos">Ver saídas</Link>
            </p>
          )}

          <section className="kpi-grid" aria-label="Indicadores do período">
            <Kpi label="Saídas" value={formatInteger(data.totals.ordersCount)} variation={data.variation.ordersCount} />
            <Kpi label="Sacos vendidos" value={formatInteger(data.totals.bagsSold)} variation={data.variation.bagsSold} />
            <Kpi label="Faturamento" value={formatMoney(data.totals.revenue)} variation={data.variation.revenue} hint="Produtos + frete − descontos" />
            <Kpi label="Ticket médio" value={formatMoney(data.totals.averageTicket)} variation={data.variation.averageTicket} hint="Faturamento ÷ saídas" />
            <Kpi label="Clientes atendidos" value={formatInteger(data.totals.customersServed)} variation={data.variation.customersServed} />
          </section>
          <p className="muted small kpi-note">
            Comparação com o período anterior ({formatDate(data.previousPeriod.from)} a {formatDate(data.previousPeriod.to)}).
          </p>

          <section className="card">
            <div className="card-head">
              <h2>Evolução por dia</h2>
              <div className="segmented" role="group" aria-label="Indicador do gráfico">
                {(Object.keys(METRIC_LABELS) as Metric[]).map((id) => (
                  <button key={id} type="button" className={metric === id ? "active" : ""} onClick={() => setMetric(id)} aria-pressed={metric === id}>
                    {METRIC_LABELS[id]}
                  </button>
                ))}
              </div>
            </div>
            {data.totals.ordersCount === 0 ? (
              <p className="muted">Nenhuma saída confirmada neste período.</p>
            ) : (
              <ColumnChart
                ariaLabel={`${METRIC_LABELS[metric]} por dia, de ${formatDate(data.period.from)} a ${formatDate(data.period.to)}`}
                points={data.salesByDay.map((day) => ({
                  date: day.date,
                  value: metric === "revenue" ? Number(day.revenue) : day[metric],
                  label: metric === "revenue" ? formatMoney(day.revenue) : `${formatInteger(day[metric])} ${metric === "bagsSold" ? "sacos" : "saídas"}`,
                }))}
              />
            )}
          </section>

          <div className="dash-two">
            <section className="card">
              <h2>Vendas por produto</h2>
              <p className="muted small">Sacos vendidos e valor dos itens (antes de frete e desconto geral).</p>
              {data.salesByProduct.length === 0 ? (
                <p className="muted">Sem vendas no período.</p>
              ) : (
                <BarList
                  rows={data.salesByProduct.map((product) => ({
                    key: product.productId,
                    name: product.productName,
                    value: product.bagsSold,
                    detail: `${formatInteger(product.bagsSold)} sacos · ${formatMoney(product.itemsValue)}`,
                  }))}
                />
              )}
            </section>

            <section className="card">
              <h2>Clientes por volume comprado</h2>
              {data.topCustomers.length === 0 ? (
                <p className="muted">Sem vendas no período.</p>
              ) : (
                <div className="table-wrapper table-flat">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Cliente</th>
                        <th className="numeric">Sacos</th>
                        <th className="numeric">Faturamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topCustomers.map((customer, index) => (
                        <tr key={customer.customerId}>
                          <td>{index + 1}</td>
                          <td>{customer.customerName}</td>
                          <td className="numeric">{formatInteger(customer.bagsSold)}</td>
                          <td className="numeric">{formatMoney(customer.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className="card">
            <h2>Últimas saídas</h2>
            {data.recentOrders.length === 0 ? (
              <p className="muted">Nenhuma saída confirmada neste período.</p>
            ) : (
              <div className="table-wrapper table-flat">
                <table>
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Data</th>
                      <th>Cliente</th>
                      <th className="numeric">Sacos</th>
                      <th className="numeric">Total</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <Link to={`/pedidos/${order.id}`}>PED-{String(order.number).padStart(6, "0")}</Link>
                        </td>
                        <td>{formatDateTime(order.createdAt)}</td>
                        <td>{order.customerName}</td>
                        <td className="numeric">{formatInteger(order.bagsSold)}</td>
                        <td className="numeric">{formatMoney(order.total)}</td>
                        <td>
                          <StatusBadge status={order.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="muted small">
            Não há ainda indicadores de valor recebido ou saldo a receber: eles dependem do módulo de pagamentos.
            {health && ` · Sistema: API ${health.status === "ok" ? "no ar" : "com problemas"}, banco ${health.database === "ok" ? "conectado" : "indisponível"}.`}
          </p>
        </>
      )}
    </>
  );
}

function Kpi({ label, value, variation, hint }: { label: string; value: string; variation: string | null; hint?: string }) {
  const trend = variation === null ? "none" : variation.startsWith("-") ? "down" : variation === "0.0" ? "flat" : "up";
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      <span className={`kpi-variation kpi-${trend}`}>
        {variation === null ? "sem dados no período anterior" : `${formatVariation(variation)} vs. período anterior`}
      </span>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}

