// Gráficos simples feitos com HTML/CSS (sem biblioteca), para o painel.
//
// ATENÇÃO: aqui os valores viram `number` SÓ para calcular a ALTURA das barras
// (um desenho). Os valores mostrados ao usuário continuam sendo os textos
// exatos que vieram da API, formatados sem conta.
import { formatDate } from "../../lib/format";

export interface DayPoint {
  date: string;
  /** Valor usado só para desenhar a barra. */
  value: number;
  /** Texto exato mostrado no tooltip. */
  label: string;
}

/** Gráfico de colunas: uma coluna por dia do período. */
export function ColumnChart({ points, ariaLabel }: { points: DayPoint[]; ariaLabel: string }) {
  const max = Math.max(0, ...points.map((point) => point.value));
  const first = points[0];
  const last = points[points.length - 1];
  const middle = points[Math.floor(points.length / 2)];
  return (
    <figure className="chart">
      <div className="chart-columns" role="img" aria-label={ariaLabel}>
        {points.map((point) => (
          <div
            key={point.date}
            className="chart-column"
            title={`${formatDate(point.date)}: ${point.label}`}
            style={{ height: max === 0 ? "0%" : `${Math.max((point.value / max) * 100, point.value > 0 ? 2 : 0)}%` }}
          />
        ))}
      </div>
      {first && last && middle && (
        <figcaption className="chart-axis">
          <span>{formatDate(first.date)}</span>
          {points.length > 2 && <span>{formatDate(middle.date)}</span>}
          {points.length > 1 && <span>{formatDate(last.date)}</span>}
        </figcaption>
      )}
    </figure>
  );
}

export interface BarRow {
  key: string;
  name: string;
  value: number;
  detail: string;
}

/** Barras horizontais com nome e valor (ranking). */
export function BarList({ rows }: { rows: BarRow[] }) {
  const max = Math.max(0, ...rows.map((row) => row.value));
  return (
    <ul className="bar-list">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="bar-list-head">
            <span className="bar-list-name">{row.name}</span>
            <span className="muted small">{row.detail}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: max === 0 ? "0%" : `${(row.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
