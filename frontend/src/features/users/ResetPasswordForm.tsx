import { useState, type FormEvent } from "react";
import { resetUserPassword } from "../../api/users";
import type { User } from "../../api/types";
import { FormErrors } from "../../components/FormErrors";

interface Props {
  user: User;
  onDone: (user: User) => void;
  onCancel: () => void;
}

/** O ADM define uma senha temporária para outra pessoa. */
export function ResetPasswordForm({ user, onDone, onCancel }: Props) {
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { user: updated } = await resetUserPassword(user.id, temporaryPassword);
      onDone(updated);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h2>Redefinir senha de {user.name}</h2>
      <p className="muted small">
        A pessoa será desconectada de todos os aparelhos e, no próximo acesso, terá de cadastrar uma senha nova.
      </p>
      <FormErrors error={error} />
      <label>
        Nova senha temporária
        <input
          type="text"
          value={temporaryPassword}
          onChange={(e) => setTemporaryPassword(e.target.value)}
          autoComplete="off"
          minLength={8}
          required
          autoFocus
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Salvando…" : "Redefinir senha"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
