// Tela dos módulos que ainda não foram construídos.
// Não mostra números nem botões falsos: só informa que o módulo está planejado.
import { useLocation } from "react-router";
import { resolveLocation } from "../../components/navigation";

export function ModuleInDevelopmentPage() {
  const { pathname } = useLocation();
  const { title } = resolveLocation(pathname);
  return (
    <section className="card module-soon">
      <h1>{title}</h1>
      <p className="badge badge-soon">Em desenvolvimento</p>
      <p className="muted">Este módulo ainda não foi construído e não tem dados. Ele será liberado em uma etapa futura do projeto.</p>
    </section>
  );
}
