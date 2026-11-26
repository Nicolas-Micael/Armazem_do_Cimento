// Formulário de pedido (novo ou edição de pedido pendente).
//
// A tela NÃO calcula o total: a cada mudança ela pede ao backend uma
// pré-visualização (POST /api/orders/preview). Assim a conta existe num
// lugar só, e o valor mostrado é exatamente o que será gravado.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  createOrder,
  getOrder,
  previewOrder,
  updateOrder,
  type DeliveryMode,
  type DiscountType,
  type Order,
  type OrderData,
  type OrderPreview,
  type PaymentTerm,
} from "../../api/orders";
import { listProducts } from "../../api/products";
import type { Customer, Product } from "../../api/types";
import { formatMoney, moneyApiToInput, moneyInputToApi } from "../../lib/format";
import { DELIVERY_MODE_LABELS, PAYMENT_TERM_LABELS } from "../../lib/labels";
import { FormErrors } from "../../components/FormErrors";
import { CustomerPicker } from "./CustomerPicker";

/** Uma linha de item como está na tela (texto digitado). */
interface ItemRow {
  key: number;
  productId: string;
  quantity: string;
  /** Preço no padrão brasileiro, ex.: "38,90". */
  price: string;
}

let nextKey = 1;
const emptyRow = (): ItemRow => ({ key: nextKey++, productId: "", quantity: "", price: "" });

/** Monta uma descrição do endereço do cliente para sugerir como endereço de entrega. */
function customerAddress(customer: Customer): string {
  const parts = [
    [customer.street, customer.number].filter(Boolean).join(", "),
    customer.complement,
    customer.district,
    [customer.city, customer.state].filter(Boolean).join("/"),
  ].filter(Boolean);
  return parts.join(" - ");
}

export function OrderFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);

  const [loaded, setLoaded] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);
  const [freight, setFreight] = useState("0,00");
  const [discountType, setDiscountType] = useState<DiscountType | "NONE">("NONE");
  const [discountValue, setDiscountValue] = useState("");
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>("IMMEDIATE");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("DELIVERY");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryResponsible, setDeliveryResponsible] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [notes, setNotes] = useState("");

  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  // Carrega os produtos (para o seletor) e, na edição, o pedido.
  useEffect(() => {
    listProducts({ status: "all" })
      .then(({ products }) => setProducts(products))
      .catch(setLoadError);
    if (!id) return;
    getOrder(id)
      .then(({ order }) => {
        setLoaded(order);
        setCustomer({ id: order.customerId, name: order.customerName });
        setRows(
          order.items.map((item) => ({
            key: nextKey++,
            productId: item.productId,
            quantity: String(item.quantity),
            price: moneyApiToInput(item.unitPrice),
          })),
        );
        setFreight(moneyApiToInput(order.freightAmount));
        setDiscountType(order.discount?.type ?? "NONE");
        setDiscountValue(order.discount ? moneyApiToInput(order.discount.value) : "");
        setPaymentTerm(order.paymentTerm);
        setDeliveryMode(order.deliveryMode);
        setDeliveryAddress(order.deliveryAddress ?? "");
        setDeliveryResponsible(order.deliveryResponsible ?? "");
        setExpectedDeliveryDate(order.expectedDeliveryDate ?? "");
        setDeliveryNotes(order.deliveryNotes ?? "");
        setNotes(order.notes ?? "");
      })
      .catch(setLoadError);
  }, [id]);

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  /** Converte o que está na tela no formato da API. */
  function calculationData(): Pick<OrderData, "items" | "freightAmount" | "discount"> {
    return {
      items: rows
        .filter((row) => row.productId)
        .map((row) => ({
          productId: row.productId,
          quantity: Number(row.quantity),
          ...(row.price.trim() ? { unitPrice: moneyInputToApi(row.price) } : {}),
        })),
      freightAmount: moneyInputToApi(freight || "0"),
      discount: discountType === "NONE" || !discountValue.trim() ? null : { type: discountType, value: moneyInputToApi(discountValue) },
    };
  }

  // Pré-visualização: espera a pessoa parar de digitar (400 ms) e pede o cálculo ao backend.
  const previewKey = JSON.stringify([rows, freight, discountType, discountValue]);
  useEffect(() => {
    const data = calculationData();
    if (data.items.length === 0) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      previewOrder(data)
        .then(({ preview }) => {
          setPreview(preview);
          setPreviewError(null);
        })
        .catch((err: unknown) => {
          setPreview(null);
          setPreviewError(err instanceof Error ? err.message : "Não foi possível calcular.");
        });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  function updateRow(key: number, changes: Partial<ItemRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }

  function chooseProduct(key: number, productId: string) {
    const product = productsById.get(productId);
    // Ao escolher o produto, o preço de tabela entra como sugestão (pode ser alterado).
    updateRow(key, { productId, price: product ? moneyApiToInput(product.currentPrice) : "" });
  }

  function chooseCustomer(selected: Customer) {
    setCustomer({ id: selected.id, name: selected.name });
    if (!deliveryAddress) setDeliveryAddress(customerAddress(selected));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!customer) {
      setError(new Error("Escolha o cliente."));
      return;
    }
    const data: OrderData = {
      customerId: customer.id,
      ...calculationData(),
      paymentTerm,
      deliveryMode,
      deliveryAddress,
      deliveryResponsible,
      expectedDeliveryDate: expectedDeliveryDate || null,
      deliveryNotes,
      notes,
    };
    setSubmitting(true);
    try {
      const { order } = loaded ? await updateOrder(loaded.id, { ...data, version: loaded.version }) : await createOrder(data);
      navigate(`/pedidos/${order.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <FormErrors error={loadError} />;
  if (editing && !loaded) return <p className="page-message">Carregando pedido…</p>;
  if (loaded && loaded.status !== "PENDING") {
    return <p className="page-message">Só pedidos pendentes podem ser editados.</p>;
  }

  // Produtos que podem ser escolhidos: ativos, ou já presentes neste pedido.
  const usedInOrder = new Set(loaded?.items.map((item) => item.productId));
  const selectableProducts = products.filter((p) => p.active || usedInOrder.has(p.id));

  return (
    <form onSubmit={handleSubmit} className="order-form">
      <div className="page-title">
        <h1>{loaded ? `Editar pedido ${loaded.code}` : "Novo pedido"}</h1>
        <Link to={loaded ? `/pedidos/${loaded.id}` : "/pedidos"}>Voltar</Link>
      </div>

      <FormErrors error={error} />

      <section className="card">
        <h2>Cliente</h2>
        <CustomerPicker selected={customer} onSelect={chooseCustomer} onClear={() => setCustomer(null)} />
      </section>

      <section className="card">
        <h2>Itens</h2>
        <div className="table-wrapper">
          <table className="items-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd. (sacos)</th>
                <th>Preço unit. (R$)</th>
                <th className="numeric">Total do item</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const product = productsById.get(row.productId);
                const previewItem = preview?.items[rows.filter((r) => r.productId).indexOf(row)];
                const priceChanged = product && row.price && moneyInputToApi(row.price) !== product.currentPrice;
                return (
                  <tr key={row.key}>
                    <td>
                      <select
                        value={row.productId}
                        onChange={(e) => chooseProduct(row.key, e.target.value)}
                        aria-label="Produto"
                        required
                      >
                        <option value="">Escolha…</option>
                        {selectableProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {formatMoney(p.currentPrice)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="input-small"
                        value={row.quantity}
                        onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                        inputMode="numeric"
                        aria-label="Quantidade"
                        required
                      />
                    </td>
                    <td>
                      <input
                        className="input-small"
                        value={row.price}
                        onChange={(e) => updateRow(row.key, { price: e.target.value })}
                        inputMode="decimal"
                        aria-label="Preço unitário"
                      />
                      {priceChanged && <div className="muted small">Tabela: {formatMoney(product.currentPrice)}</div>}
                    </td>
                    <td className="numeric">{previewItem ? formatMoney(previewItem.lineTotal) : "—"}</td>
                    <td>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          className="button-link"
                          onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                        >
                          Remover
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="button-secondary" onClick={() => setRows((current) => [...current, emptyRow()])}>
          + Adicionar item
        </button>
      </section>

      <section className="card form-grid form-wide">
        <h2>Entrega e frete</h2>
        <label>
          Modalidade
          <select value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value as DeliveryMode)}>
            {(Object.keys(DELIVERY_MODE_LABELS) as DeliveryMode[]).map((value) => (
              <option key={value} value={value}>
                {DELIVERY_MODE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor do frete (R$)
          <input value={freight} onChange={(e) => setFreight(e.target.value)} inputMode="decimal" />
        </label>
        {deliveryMode === "DELIVERY" && (
          <>
            <label className="span-2">
              Endereço de entrega
              <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
            </label>
            <label>
              Responsável pela entrega
              <input value={deliveryResponsible} onChange={(e) => setDeliveryResponsible(e.target.value)} />
            </label>
          </>
        )}
        <label>
          Data prevista {deliveryMode === "DELIVERY" ? "da entrega" : "da retirada"}
          <input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
        </label>
        <label className="span-2">
          Observações da entrega
          <textarea value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} rows={2} />
        </label>
      </section>

      <section className="card form-grid form-wide">
        <h2>Desconto e pagamento</h2>
        <label>
          Desconto
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType | "NONE")}>
            <option value="NONE">Sem desconto</option>
            <option value="FIXED">Valor fixo (R$)</option>
            <option value="PERCENTAGE">Percentual (%) sobre os produtos</option>
          </select>
        </label>
        {discountType !== "NONE" && (
          <label>
            {discountType === "FIXED" ? "Valor do desconto (R$)" : "Percentual (%)"}
            <input value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} inputMode="decimal" />
          </label>
        )}
        <label>
          Condição de pagamento
          <select value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value as PaymentTerm)}>
            {(Object.keys(PAYMENT_TERM_LABELS) as PaymentTerm[]).map((value) => (
              <option key={value} value={value}>
                {PAYMENT_TERM_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Observações do pedido
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>
      </section>

      <section className="card totals" aria-live="polite">
        <h2>Valores</h2>
        {previewError && <p className="text-error">{previewError}</p>}
        {!preview && !previewError && <p className="muted">Escolha os produtos para ver o total.</p>}
        {preview && (
          <dl>
            <dt>Produtos</dt>
            <dd>{formatMoney(preview.subtotal)}</dd>
            <dt>Frete</dt>
            <dd>{formatMoney(preview.freightAmount)}</dd>
            <dt>Desconto</dt>
            <dd>− {formatMoney(preview.discountAmount)}</dd>
            <dt className="total">Total do pedido</dt>
            <dd className="total">{formatMoney(preview.total)}</dd>
          </dl>
        )}
        <p className="muted small">Calculado pelo servidor. O valor gravado é recalculado ao salvar.</p>
      </section>

      <div className="form-actions">
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Salvando…" : loaded ? "Salvar alterações" : "Registrar pedido"}
        </button>
      </div>
    </form>
  );
}
