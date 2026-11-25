// Tela inicial provisória (etapa 1).
//
// Mostra se o frontend consegue falar com o backend e o backend com o
// banco. É um "teste de encanamento": nas próximas etapas esta tela dá
// lugar ao login e ao menu do sistema.
import { useEffect, useState } from "react";
import { getHealth, type HealthResponse } from "./api/health";
import { formatDateTime } from "./lib/format";
import styles from "./App.module.css";

type State =
  | { kind: "loading" }
  | { kind: "success"; data: HealthResponse }
  | { kind: "error"; message: string };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    getHealth()
      .then((data) => setState({ kind: "success", data }))
      .catch((error: unknown) =>
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Erro desconhecido.",
        }),
      );
  }, []);

  return (
    <main className={styles.page}>
      <h1>Armazém do Cimento</h1>
      <p className={styles.subtitle}>Sistema de pedidos — ambiente de desenvolvimento</p>

      <section className={styles.card} aria-live="polite">
        <h2>Situação do sistema</h2>
        {state.kind === "loading" && <p>Verificando conexão com o servidor…</p>}
        {state.kind === "error" && (
          <p className={styles.error}>Não foi possível falar com o servidor: {state.message}</p>
        )}
        {state.kind === "success" && (
          <ul>
            <li>API: {state.data.status === "ok" ? "funcionando" : "com problemas"}</li>
            <li>Banco de dados: {state.data.database === "ok" ? "conectado" : "indisponível"}</li>
            <li>Verificado em: {formatDateTime(state.data.time)}</li>
          </ul>
        )}
      </section>
    </main>
  );
}
