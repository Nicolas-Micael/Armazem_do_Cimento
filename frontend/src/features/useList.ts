// Lógica comum das telas de listagem: filtros, página, carregamento e erro.
//
// Um "hook" do React é uma função que guarda estado e pode ser reutilizada
// por vários componentes. Aqui ele evita repetir o mesmo código nas telas
// de clientes e de produtos.
import { useCallback, useEffect, useState } from "react";
import type { ListParams } from "../api/listParams";
import type { Page, StatusFilter } from "../api/types";

export function useList<T>(fetchPage: (params: ListParams) => Promise<Page & { items: T[] }>) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Page & { items: T[] }) | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false; // evita mostrar uma resposta antiga se o filtro mudou no meio
    setError(null);
    fetchPage({ search, status, page })
      .then((result) => !cancelled && setData(result))
      .catch((err: unknown) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [fetchPage, search, status, page, reloadKey]);

  return {
    data,
    error,
    status,
    page,
    /** Nova busca volta para a página 1. */
    setSearch: useCallback((value: string) => {
      setSearch(value);
      setPage(1);
    }, []),
    setStatus: useCallback((value: StatusFilter) => {
      setStatus(value);
      setPage(1);
    }, []),
    setPage,
    reload: useCallback(() => setReloadKey((key) => key + 1), []),
  };
}
