// Tela de usuários (só ADM): lista, cadastro, ativar/desativar e redefinir senha.
import { useEffect, useState } from "react";
import { listUsers, updateUser } from "../../api/users";
import { ROLE_LABELS, type User } from "../../api/types";
import { formatDateTime } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";
import { FormErrors } from "../../components/FormErrors";
import { CreateUserForm } from "./CreateUserForm";
import { ResetPasswordForm } from "./ResetPasswordForm";

type Panel = { kind: "none" } | { kind: "create" } | { kind: "reset"; user: User };

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>({ kind: "none" });

  useEffect(() => {
    listUsers()
      .then(({ users }) => setUsers(users))
      .catch(setLoadError);
  }, []);

  /** Troca um usuário da lista pela versão atualizada que veio do backend. */
  function replaceUser(updated: User) {
    setUsers((list) => list?.map((u) => (u.id === updated.id ? updated : u)) ?? null);
  }

  async function toggleActive(user: User) {
    const action = user.active ? "desativar" : "reativar";
    if (!window.confirm(`Deseja ${action} o usuário ${user.name}?`)) return;
    setActionError(null);
    setNotice(null);
    try {
      const { user: updated } = await updateUser(user.id, { active: !user.active });
      replaceUser(updated);
      setNotice(`Usuário ${updated.name} ${updated.active ? "reativado" : "desativado"}.`);
    } catch (err) {
      setActionError(err);
    }
  }

  if (loadError) return <FormErrors error={loadError} />;
  if (!users) return <p className="page-message">Carregando usuários…</p>;

  return (
    <>
      <div className="page-title">
        <h1>Usuários</h1>
        {panel.kind === "none" && (
          <button type="button" className="button-primary" onClick={() => setPanel({ kind: "create" })}>
            Novo usuário
          </button>
        )}
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      <FormErrors error={actionError} />

      {panel.kind === "create" && (
        <CreateUserForm
          onCancel={() => setPanel({ kind: "none" })}
          onCreated={(created) => {
            setUsers((list) => [...(list ?? []), created]);
            setPanel({ kind: "none" });
            setNotice(`Usuário ${created.username} cadastrado. Entregue a senha temporária à pessoa.`);
          }}
        />
      )}
      {panel.kind === "reset" && (
        <ResetPasswordForm
          user={panel.user}
          onCancel={() => setPanel({ kind: "none" })}
          onDone={(updated) => {
            replaceUser(updated);
            setPanel({ kind: "none" });
            setNotice(`Senha de ${updated.name} redefinida. Entregue a senha temporária à pessoa.`);
          }}
        />
      )}

      {users.length === 0 ? (
        <p className="page-message">Nenhum usuário cadastrado.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Situação</th>
                <th>Último acesso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={user.active ? undefined : "row-inactive"}>
                  <td>{user.name}</td>
                  <td>{user.username}</td>
                  <td>{ROLE_LABELS[user.role]}</td>
                  <td>
                    {user.active ? "Ativo" : "Inativo"}
                    {user.active && user.mustChangePassword && (
                      <span className="muted small"> · aguardando nova senha</span>
                    )}
                  </td>
                  <td>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Nunca"}</td>
                  <td>
                    <div className="actions">
                      {user.id !== currentUser?.id && (
                        <>
                          <button type="button" className="button-link" onClick={() => setPanel({ kind: "reset", user })}>
                            Redefinir senha
                          </button>
                          <button type="button" className="button-link" onClick={() => void toggleActive(user)}>
                            {user.active ? "Desativar" : "Reativar"}
                          </button>
                        </>
                      )}
                      {user.id === currentUser?.id && <span className="muted small">Você</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
