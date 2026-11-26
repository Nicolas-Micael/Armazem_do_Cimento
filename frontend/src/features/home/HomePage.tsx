// Tela inicial. Por enquanto mostra a situação da API e do banco; o painel
// com indicadores entra na etapa 9.
import { useEffect, useState } from "react";
import { getHealth, type HealthResponse } from "../../api/health";
import { formatDateTime } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";

type State = { kind: "loading" } | { kind: "success"; data: HealthResponse } | { kind: "error"; message: string };

export function HomePage() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    getHealth()
      .then((data) => setState({ kind: "success", data }))
      .catch((error: unknown) =>
        setState({ kind: "error", message: error instanceof Error ? error.message : "Erro desconhecido." }),
      );
  }, []);

  return (
    <>
      <h1>Olá, {user?.name}</h1>
      <p className="muted">Os módulos de clientes, produtos e pedidos entram nas próximas etapas.</p>

      <section className="card" aria-live="polite">
        <h2>Situação do sistema</h2>
        {state.kind === "loading" && <p>Verificando conexão com o servidor…</p>}
        {state.kind === "error" && <p className="text-error">Não foi possível falar com o servidor: {state.message}</p>}
        {state.kind === "success" && (
          <ul>
            <li>API: {state.data.status === "ok" ? "funcionando" : "com problemas"}</li>
            <li>Banco de dados: {state.data.database === "ok" ? "conectado" : "indisponível"}</li>
            <li>Verificado em: {formatDateTime(state.data.time)}</li>
          </ul>
        )}
      </section>
    </>
  );
}
