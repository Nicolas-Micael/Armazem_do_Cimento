import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "./AuthContext";
import { FormErrors } from "../../components/FormErrors";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  // Já logado? Vai direto para o início.
  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); // impede o navegador de recarregar a página
    setError(null);
    setSubmitting(true);
    try {
      const loggedUser = await login(username, password);
      navigate(loggedUser.mustChangePassword ? "/trocar-senha" : "/", { replace: true });
    } catch (err) {
      setError(err);
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1>Armazém do Cimento</h1>
        <p className="muted">Entre com seu usuário e senha.</p>

        <FormErrors error={error} />

        <label>
          Usuário
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
            autoFocus
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Entrando…" : "Entrar"}
        </button>
        <p className="muted small">Esqueceu a senha? Peça ao administrador para redefini-la.</p>
      </form>
    </main>
  );
}
