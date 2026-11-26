// Minha Conta: dados do usuário logado (somente leitura) e atalho para trocar a senha.
import { Link } from "react-router";
import { ROLE_LABELS } from "../../api/types";
import { formatDateTime } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";

export function MyAccountPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <section className="card info-grid">
      <div>
        <span className="muted small">Nome</span>
        <p>{user.name}</p>
      </div>
      <div>
        <span className="muted small">Usuário de acesso</span>
        <p>{user.username}</p>
      </div>
      <div>
        <span className="muted small">Perfil</span>
        <p>{ROLE_LABELS[user.role]}</p>
      </div>
      <div>
        <span className="muted small">Último acesso</span>
        <p>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"}</p>
      </div>
      <div className="span-2">
        <Link to="/trocar-senha" className="button-secondary">
          Trocar senha
        </Link>
      </div>
    </section>
  );
}
