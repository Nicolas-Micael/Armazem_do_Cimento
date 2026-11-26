// Barra de busca + filtro de situação, usada nas listagens.
import { useState, type FormEvent } from "react";
import type { StatusFilter } from "../api/types";

interface Props {
  placeholder: string;
  status: StatusFilter;
  onSearch: (search: string) => void;
  onStatusChange: (status: StatusFilter) => void;
}

export function ListToolbar({ placeholder, status, onSearch, onStatusChange }: Props) {
  const [text, setText] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSearch(text.trim());
  }

  return (
    <form className="toolbar" onSubmit={handleSubmit} role="search">
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar"
      />
      <button type="submit" className="button-secondary">
        Buscar
      </button>
      <select value={status} onChange={(e) => onStatusChange(e.target.value as StatusFilter)} aria-label="Situação">
        <option value="active">Ativos</option>
        <option value="inactive">Inativos</option>
        <option value="all">Todos</option>
      </select>
    </form>
  );
}
