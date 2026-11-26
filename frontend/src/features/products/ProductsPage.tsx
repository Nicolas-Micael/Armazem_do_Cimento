// Tela de produtos: busca, lista com preço atual, histórico de preços e
// (para o ADM) cadastro, edição de preço e desativação.
import { useCallback, useState } from "react";
import { listProducts, updateProduct } from "../../api/products";
import type { ListParams } from "../../api/listParams";
import type { Product } from "../../api/types";
import { formatMoney } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";
import { FormErrors } from "../../components/FormErrors";
import { ListToolbar } from "../../components/ListToolbar";
import { Pagination } from "../../components/Pagination";
import { useList } from "../useList";
import { ProductForm } from "./ProductForm";
import { PriceHistory } from "./PriceHistory";

type Panel =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; product: Product }
  | { kind: "history"; product: Product };

export function ProductsPage() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN";

  const fetchPage = useCallback(
    (params: ListParams) => listProducts(params).then(({ products, ...page }) => ({ ...page, items: products })),
    [],
  );
  const list = useList<Product>(fetchPage);
  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  async function toggleActive(product: Product) {
    const action = product.active ? "desativar" : "reativar";
    if (!window.confirm(`Deseja ${action} o produto ${product.name}?`)) return;
    setActionError(null);
    try {
      const { product: updated } = await updateProduct(product.id, { active: !product.active });
      setNotice(`Produto ${updated.name} ${updated.active ? "reativado" : "desativado"}.`);
      list.reload();
    } catch (err) {
      setActionError(err);
    }
  }

  function handleSaved(saved: Product) {
    setNotice(`Produto ${saved.name} salvo. Preço atual: ${formatMoney(saved.currentPrice)}.`);
    setPanel({ kind: "none" });
    list.reload();
  }

  return (
    <>
      <div className="page-title">
        <h1>Produtos</h1>
        {canManage && panel.kind === "none" && (
          <button type="button" className="button-primary" onClick={() => setPanel({ kind: "create" })}>
            Novo produto
          </button>
        )}
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      <FormErrors error={actionError} />

      {panel.kind === "create" && <ProductForm onSaved={handleSaved} onCancel={() => setPanel({ kind: "none" })} />}
      {panel.kind === "edit" && (
        <ProductForm
          key={panel.product.id}
          product={panel.product}
          onSaved={handleSaved}
          onCancel={() => setPanel({ kind: "none" })}
        />
      )}
      {panel.kind === "history" && (
        <PriceHistory key={panel.product.id} product={panel.product} onClose={() => setPanel({ kind: "none" })} />
      )}

      <ListToolbar
        placeholder="Buscar por nome, marca ou tipo"
        status={list.status}
        onSearch={list.setSearch}
        onStatusChange={list.setStatus}
      />

      <FormErrors error={list.error} />
      {!list.data && !list.error && <p className="page-message">Carregando produtos…</p>}
      {list.data && list.data.items.length === 0 && <p className="page-message">Nenhum produto encontrado.</p>}
      {list.data && list.data.items.length > 0 && (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Marca</th>
                  <th>Tipo</th>
                  <th className="numeric">Preço de tabela</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((product) => (
                  <tr key={product.id} className={product.active ? undefined : "row-inactive"}>
                    <td>{product.name}</td>
                    <td>{product.brand ?? "—"}</td>
                    <td>{product.cementType ?? "—"}</td>
                    <td className="numeric">{formatMoney(product.currentPrice)}</td>
                    <td>{product.active ? "Ativo" : "Inativo"}</td>
                    <td>
                      <div className="actions">
                        <button type="button" className="button-link" onClick={() => setPanel({ kind: "history", product })}>
                          Histórico
                        </button>
                        {canManage && (
                          <>
                            <button type="button" className="button-link" onClick={() => setPanel({ kind: "edit", product })}>
                              Editar
                            </button>
                            <button type="button" className="button-link" onClick={() => void toggleActive(product)}>
                              {product.active ? "Desativar" : "Reativar"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
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
