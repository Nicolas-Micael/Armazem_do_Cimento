// Protege as telas que exigem login.
//
// Lembre: isto só decide O QUE MOSTRAR. Quem garante a segurança é o
// backend, que recusa a requisição se a pessoa não tiver permissão.
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../features/auth/AuthContext";
import type { Role } from "../api/types";

interface Props {
  children: ReactNode;
  /** Se informado, só estes perfis veem a tela. */
  roles?: Role[];
}

export function ProtectedRoute({ children, roles }: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="page-message">Carregando…</p>;
  if (!user) return <Navigate to="/login" replace />;

  // Senha temporária: só a tela de troca de senha fica disponível.
  if (user.mustChangePassword && location.pathname !== "/trocar-senha") {
    return <Navigate to="/trocar-senha" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <p className="page-message">Seu perfil não tem acesso a esta tela.</p>;
  }

  return children;
}
