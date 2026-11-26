interface Props {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1) return <p className="muted small">{total} registro(s)</p>;
  return (
    <div className="pagination">
      <button type="button" className="button-secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </button>
      <span className="muted small">
        Página {page} de {pages} · {total} registro(s)
      </span>
      <button type="button" className="button-secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Próxima
      </button>
    </div>
  );
}
