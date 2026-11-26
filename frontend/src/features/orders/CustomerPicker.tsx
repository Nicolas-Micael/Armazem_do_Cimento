// Escolha do cliente: digita parte do nome ou do CPF/CNPJ e escolhe na lista.
import { useState } from "react";
import { listCustomers } from "../../api/customers";
import type { Customer } from "../../api/types";
import { formatDocument } from "../../lib/format";

interface Props {
  selected: { id: string; name: string } | null;
  onSelect: (customer: Customer) => void;
  onClear: () => void;
}

export function CustomerPicker({ selected, onSelect, onClear }: Props) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setError(null);
    try {
      // Só clientes ativos podem receber pedidos novos.
      const { customers } = await listCustomers({ search: text.trim(), status: "active" });
      setResults(customers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar clientes.");
    }
  }

  if (selected) {
    return (
      <div className="picked">
        <strong>{selected.name}</strong>
        <button type="button" className="button-link" onClick={onClear}>
          Trocar cliente
        </button>
      </div>
    );
  }

  return (
    <div className="picker">
      <div className="toolbar">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter busca o cliente em vez de enviar o formulário do pedido.
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Nome ou CPF/CNPJ do cliente"
          aria-label="Buscar cliente"
        />
        <button type="button" className="button-secondary" onClick={() => void search()}>
          Buscar cliente
        </button>
      </div>
      {error && <p className="text-error">{error}</p>}
      {results && results.length === 0 && <p className="muted">Nenhum cliente ativo encontrado.</p>}
      {results && results.length > 0 && (
        <ul className="picker-results">
          {results.map((customer) => (
            <li key={customer.id}>
              <button type="button" className="button-link" onClick={() => onSelect(customer)}>
                {customer.name}
              </button>
              {customer.document && <span className="muted small"> · {formatDocument(customer.document)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
