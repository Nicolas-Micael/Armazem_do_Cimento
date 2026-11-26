import { useState, type FormEvent } from "react";
import { createUser } from "../../api/users";
import { ROLE_LABELS, type Role, type User } from "../../api/types";
import { FormErrors } from "../../components/FormErrors";

interface Props {
  onCreated: (user: User) => void;
  onCancel: () => void;
}

export function CreateUserForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("FINANCEIRO");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { user } = await createUser({ name, username, role, temporaryPassword });
      onCreated(user);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h2>Novo usuário</h2>
      <FormErrors error={error} />
      <label>
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Usuário (para o login)
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          placeholder="ex.: joao.silva"
          required
        />
      </label>
      <label>
        Perfil
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {(Object.keys(ROLE_LABELS) as Role[]).map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Senha temporária
        <input
          type="text"
          value={temporaryPassword}
          onChange={(e) => setTemporaryPassword(e.target.value)}
          autoComplete="off"
          minLength={8}
          required
        />
        <span className="muted small">Entregue esta senha à pessoa. No primeiro acesso ela cadastrará uma nova.</span>
      </label>
      <div className="form-actions">
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Salvando…" : "Cadastrar"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
