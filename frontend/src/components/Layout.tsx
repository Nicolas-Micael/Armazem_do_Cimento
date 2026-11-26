// Estrutura comum das telas internas: cabeçalho com menu e o conteúdo.
import { NavLink, Outlet } from "react-router";
import { useAuth } from "../features/auth/AuthContext";
import { ROLE_SHORT_LABELS } from "../api/types";

export function Layout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <>
      <header className="app-header">
        <strong className="brand">Armazém do Cimento</strong>
        <nav className="app-nav">
          <NavLink to="/" end>
            Início
          </NavLink>
          {/* O menu de usuários só aparece para o ADM (e o backend também bloqueia). */}
          {user.role === "ADMIN" && <NavLink to="/usuarios">Usuários</NavLink>}
        </nav>
        <div className="app-user">
          <span>
            {user.name} <span className="muted small">({ROLE_SHORT_LABELS[user.role]})</span>
          </span>
          <NavLink to="/trocar-senha">Trocar senha</NavLink>
          <button type="button" className="button-link" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
