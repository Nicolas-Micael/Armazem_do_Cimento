// Tela de clientes: busca, lista e (para o ADM) cadastro, edição e desativação.
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router";
import { listCustomers, updateCustomer } from "../../api/customers";
import type { ListParams } from "../../api/listParams";
import type { Customer } from "../../api/types";
import { formatDocument, formatPhone } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";
import { FormErrors } from "../../components/FormErrors";
import { ListToolbar } from "../../components/ListToolbar";
import { Pagination } from "../../components/Pagination";
import { useList } from "../useList";
import { CustomerForm } from "./CustomerForm";

type Panel = { kind: "none" } | { kind: "create" } | { kind: "edit"; customer: Customer };

export function CustomersPage() {
  const { user } = useAuth();
  // ADM e Financeiro cadastram e editam clientes (P-CLI-1). Isto só muda o
  // que aparece na tela; o backend é quem bloqueia de verdade.
  const canManage = user?.role === "ADMIN" || user?.role === "FINANCEIRO";

  const fetchPage = useCallback(
    (params: ListParams) => listCustomers(params).then(({ customers, ...page }) => ({ ...page, items: customers })),
    [],
  );
  const list = useList<Customer>(fetchPage);
  // O atalho do painel abre direto o formulário: /clientes?novo=1
  const [params] = useSearchParams();
  const [panel, setPanel] = useState<Panel>(() => (params.get("novo") === "1" && canManage ? { kind: "create" } : { kind: "none" }));
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  async function toggleActive(customer: Customer) {
    const action = customer.active ? "desativar" : "reativar";
    if (!window.confirm(`Deseja ${action} o cliente ${customer.name}?`)) return;
    setActionError(null);
    try {
      const { customer: updated } = await updateCustomer(customer.id, { active: !customer.active });
      setNotice(`Cliente ${updated.name} ${updated.active ? "reativado" : "desativado"}.`);
      list.reload();
    } catch (err) {
      setActionError(err);
    }
  }

  function handleSaved(saved: Customer) {
    setNotice(`Cliente ${saved.name} salvo.`);
    setPanel({ kind: "none" });
    list.reload();
  }

  return (
    <>
      <div className="page-title">
        <h1>Clientes</h1>
        {canManage && panel.kind === "none" && (
          <button type="button" className="button-primary" onClick={() => setPanel({ kind: "create" })}>
            Novo cliente
          </button>
        )}
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      <FormErrors error={actionError} />

      {panel.kind === "create" && <CustomerForm onSaved={handleSaved} onCancel={() => setPanel({ kind: "none" })} />}
      {panel.kind === "edit" && (
        <CustomerForm
          key={panel.customer.id}
          customer={panel.customer}
          onSaved={handleSaved}
          onCancel={() => setPanel({ kind: "none" })}
        />
      )}

      <ListToolbar
        placeholder="Buscar por nome ou CPF/CNPJ"
        status={list.status}
        onSearch={list.setSearch}
        onStatusChange={list.setStatus}
      />

      <FormErrors error={list.error} />
      {!list.data && !list.error && <p className="page-message">Carregando clientes…</p>}
      {list.data && list.data.items.length === 0 && <p className="page-message">Nenhum cliente encontrado.</p>}
      {list.data && list.data.items.length > 0 && (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF/CNPJ</th>
                  <th>Telefone</th>
                  <th>Cidade/UF</th>
                  <th>Situação</th>
                  {canManage && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((customer) => (
                  <tr key={customer.id} className={customer.active ? undefined : "row-inactive"}>
                    <td>{customer.name}</td>
                    <td>{formatDocument(customer.document) || "—"}</td>
                    <td>{formatPhone(customer.phone) || "—"}</td>
                    <td>{customer.city ? `${customer.city}${customer.state ? `/${customer.state}` : ""}` : "—"}</td>
                    <td>{customer.active ? "Ativo" : "Inativo"}</td>
                    {canManage && (
                      <td>
                        <div className="actions">
                          <button type="button" className="button-link" onClick={() => setPanel({ kind: "edit", customer })}>
                            Editar
                          </button>
                          <button type="button" className="button-link" onClick={() => void toggleActive(customer)}>
                            {customer.active ? "Desativar" : "Reativar"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...list.data} onChange={list.setPage} />
        </>
      )}
    </>
  );
}
