// Troca de senha. Obrigatória quando o usuário entra com senha temporária,
// e também disponível pelo menu a qualquer momento.
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import * as authApi from "../../api/auth";
import { useAuth } from "./AuthContext";
import { FormErrors } from "../../components/FormErrors";

export function ChangePasswordPage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const mandatory = user?.mustChangePassword ?? false;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    // Conferir a confirmação é só uma ajuda da tela; as regras da senha
    // (tamanho mínimo etc.) são conferidas pelo backend.
    if (newPassword !== confirmation) {
      setError(new Error("A confirmação não é igual à nova senha."));
      return;
    }
    setSubmitting(true);
    try {
      const { user: updated } = await authApi.changePassword(currentPassword, newPassword);
      setUser(updated);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>{mandatory ? "Cadastre sua nova senha" : "Trocar senha"}</h1>
        {mandatory && (
          <p className="muted">
            Você entrou com uma senha temporária. Para continuar, cadastre uma senha só sua, com pelo menos 8
            caracteres.
          </p>
        )}

        <FormErrors error={error} />

        <label>
          {mandatory ? "Senha temporária" : "Senha atual"}
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          Nova senha
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label>
          Confirme a nova senha
          <input
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Salvando…" : "Salvar nova senha"}
        </button>
        {mandatory ? (
          <button type="button" className="button-link" onClick={() => void logout()}>
            Sair
          </button>
        ) : (
          <button type="button" className="button-link" onClick={() => navigate(-1)}>
            Cancelar
          </button>
        )}
      </form>
    </main>
  );
}
