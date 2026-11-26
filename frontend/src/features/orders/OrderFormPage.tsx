// Formulário de saída (nova ou edição de saída pendente), em 5 blocos:
// A) informações da operação, B) cliente, C) produtos, D) entrega e logística,
// E) pagamento e resumo.
//
// A tela NÃO calcula o total: a cada mudança ela pede ao backend uma
// pré-visualização (POST /api/orders/preview). Assim a conta existe num
// lugar só, e o valor mostrado é exatamente o que será gravado.
// "Pendente" = rascunho: salvar como rascunho grava a saída como Pendente.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  createOrder,
  getOrder,
  previewOrder,
  updateOrder,
  type DeliveryMode,
  type Order,
  type OrderData,
  type OrderPreview,
  type PaymentTerm,
} from "../../api/orders";
import { listProducts } from "../../api/products";
import type { Customer, Product } from "../../api/types";
import { FormErrors } from "../../components/FormErrors";
import { MoneyInput } from "../../components/MoneyInput";
import { formatDateTime, formatMoney, moneyApiToInput, moneyInputToApi } from "../../lib/format";
import { DELIVERY_MODE_LABELS, OPERATION_TYPE_LABELS, PAYMENT_TERM_LABELS } from "../../lib/labels";
import { useAuth } from "../auth/AuthContext";
import { CustomerPicker } from "./CustomerPicker";
import { DiscountField, NO_DISCOUNT, discountToApi, type DiscountDraft } from "./DiscountField";
import { QuickCustomerPanel } from "./QuickCustomerPanel";

/** Uma linha de item como está na tela (texto digitado). */
interface ItemRow {
  key: number;
  productId: string;
  quantity: string;
  /** Preço no padrão brasileiro, ex.: "38,90". */
  price: string;
  discount: DiscountDraft;
}

let nextKey = 1;
const emptyRow = (): ItemRow => ({ key: nextKey++, productId: "", quantity: "", price: "", discount: NO_DISCOUNT });

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

const isWholeNumber = (text: string) => /^\d+$/.test(text.trim());

export function OrderFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canConfirm = user?.role === "ADMIN";
  const editing = Boolean(id);

  const [loaded, setLoaded] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [quickCustomer, setQuickCustomer] = useState(false);
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);
  const [freight, setFreight] = useState("0,00");
  const [discount, setDiscount] = useState<DiscountDraft>(NO_DISCOUNT);
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>("IMMEDIATE");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("DELIVERY");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryResponsible, setDeliveryResponsible] = useState("");
  const [driverName, setDriverName] = useState("");
  const [helperName, setHelperName] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [loadedBags, setLoadedBags] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [notes, setNotes] = useState("");

  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  // Só mostra os avisos de campo depois da primeira tentativa de salvar.
  const [attempted, setAttempted] = useState(false);

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
            discount: item.discount ? { type: item.discount.type, value: moneyApiToInput(item.discount.value) } : NO_DISCOUNT,
          })),
        );
        setFreight(moneyApiToInput(order.freightAmount));
        setDiscount(order.discount ? { type: order.discount.type, value: moneyApiToInput(order.discount.value) } : NO_DISCOUNT);
        setPaymentTerm(order.paymentTerm);
        setDeliveryMode(order.deliveryMode);
        setDeliveryAddress(order.deliveryAddress ?? "");
        setDeliveryResponsible(order.deliveryResponsible ?? "");
        setDriverName(order.driverName ?? "");
        setHelperName(order.helperName ?? "");
        setVehicle(order.vehicle ?? "");
        setLicensePlate(order.licensePlate ?? "");
        setLoadedBags(order.loadedBags === null ? "" : String(order.loadedBags));
        setExpectedDeliveryDate(order.expectedDeliveryDate ?? "");
        setDeliveryNotes(order.deliveryNotes ?? "");
        setNotes(order.notes ?? "");
      })
      .catch(setLoadError);
  }, [id]);

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  /** Converte o que está na tela no formato da API (só a parte que entra no cálculo). */
  function calculationData(): Pick<OrderData, "items" | "freightAmount" | "discount"> {
    return {
      items: rows
        .filter((row) => row.productId)
        .map((row) => ({
          productId: row.productId,
          quantity: Number(row.quantity),
          ...(row.price.trim() ? { unitPrice: moneyInputToApi(row.price) } : {}),
          discount: discountToApi(row.discount),
        })),
      freightAmount: moneyInputToApi(freight || "0"),
      discount: discountToApi(discount),
    };
  }

  // Pré-visualização: espera a pessoa parar de digitar (400 ms) e pede o cálculo ao backend.
  const previewKey = JSON.stringify([rows, freight, discount]);
  useEffect(() => {
    const data = calculationData();
    // Só pede o cálculo quando todas as linhas escolhidas têm quantidade válida.
    if (data.items.length === 0 || data.items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
      setPreview(null);
      setPreviewError(null);
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

  // Avisos de campo, calculados a cada mudança (validação em tempo real).
  const problems = useMemo(() => {
    const list: string[] = [];
    if (!customer) list.push("Escolha o cliente.");
    if (!rows.some((row) => row.productId)) list.push("Adicione pelo menos um produto.");
    rows.forEach((row, index) => {
      if (!row.productId) return;
      if (!isWholeNumber(row.quantity) || Number(row.quantity) < 1) list.push(`Item ${index + 1}: informe a quantidade (número inteiro maior que zero).`);
      if (row.discount.type !== "NONE" && !row.discount.value.trim()) list.push(`Item ${index + 1}: informe o valor do desconto.`);
    });
    if (discount.type !== "NONE" && !discount.value.trim()) list.push("Informe o valor do desconto geral.");
    if (loadedBags.trim() && !isWholeNumber(loadedBags)) list.push("Sacos carregados: use um número inteiro.");
    return list;
  }, [customer, rows, discount, loadedBags]);

  /** Salva a saída como Pendente (rascunho). Com `review`, abre a revisão para confirmar em seguida. */
  const save = useCallback(
    async (review: boolean) => {
      setError(null);
      setAttempted(true);
      if (problems.length > 0 || !customer) return;
      const data: OrderData = {
        customerId: customer.id,
        ...calculationData(),
        operationType: "SALE",
        paymentTerm,
        deliveryMode,
        deliveryAddress,
        deliveryResponsible,
        driverName,
        helperName,
        vehicle,
        licensePlate,
        loadedBags: loadedBags.trim() ? Number(loadedBags) : null,
        expectedDeliveryDate: expectedDeliveryDate || null,
        deliveryNotes,
        notes,
      };
      setSubmitting(true);
      try {
        const { order } = loaded ? await updateOrder(loaded.id, { ...data, version: loaded.version }) : await createOrder(data);
        navigate(`/pedidos/${order.id}${review ? "?revisar=1" : ""}`);
      } catch (err) {
        setError(err);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } finally {
        setSubmitting(false);
      }
    },
    // calculationData lê o estado atual; refaz a função a cada render para o atalho Ctrl+S usar os valores novos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [problems, customer, rows, freight, discount, paymentTerm, deliveryMode, deliveryAddress, deliveryResponsible, driverName, helperName, vehicle, licensePlate, loadedBags, expectedDeliveryDate, deliveryNotes, notes, loaded, navigate],
  );

  // Ctrl+S salva como rascunho. A referência evita registrar o atalho de novo a cada digitação.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save(false);
  }

  if (loadError) return <FormErrors error={loadError} />;
  if (editing && !loaded) return <p className="page-message">Carregando saída…</p>;
  if (loaded && loaded.status !== "PENDING") {
    return <p className="page-message">Só saídas pendentes podem ser editadas.</p>;
  }

  // Produtos que podem ser escolhidos: ativos, ou já presentes neste pedido.
  const usedInOrder = new Set(loaded?.items.map((item) => item.productId));
  const selectableProducts = products.filter((p) => p.active || usedInOrder.has(p.id));

  return (
    <>
      <form onSubmit={handleSubmit} className="order-form" noValidate>
        <div className="page-title">
          <h1>{loaded ? `Editar saída ${loaded.code}` : "Nova saída de cimento"}</h1>
          <Link to={loaded ? `/pedidos/${loaded.id}` : "/pedidos"}>Voltar</Link>
        </div>

        <FormErrors error={error} />
        {attempted && problems.length > 0 && (
          <div className="alert alert-error" role="alert">
            <strong>Confira antes de salvar:</strong>
            <ul>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}

        <section className="card form-grid form-wide">
          <h2>A. Informações da operação</h2>
          <label>
            Tipo de operação
            <select value="SALE" disabled aria-label="Tipo de operação">
              <option value="SALE">{OPERATION_TYPE_LABELS.SALE}</option>
            </select>
          </label>
          <label>
            Data e hora do registro
            <input value={loaded ? formatDateTime(loaded.createdAt) : "Definida ao salvar"} readOnly />
          </label>
          <label className="span-2">
            Observações
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>B. Cliente</h2>
            {!customer && (
              <button type="button" className="button-secondary" onClick={() => setQuickCustomer(true)}>
                + Cadastrar novo cliente
              </button>
            )}
          </div>
          <CustomerPicker selected={customer} onSelect={chooseCustomer} onClear={() => setCustomer(null)} />
          {attempted && !customer && <p className="field-error">Escolha o cliente.</p>}
        </section>

        <section className="card">
          <h2>C. Produtos</h2>
          <div className="table-wrapper">
            <table className="items-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd. (sacos)</th>
                  <th>Preço unit.</th>
                  <th>Desconto do item</th>
                  <th className="numeric">Total do item</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const product = productsById.get(row.productId);
                  const previewItem = preview?.items[rows.filter((r) => r.productId).indexOf(row)];
                  const priceChanged = product && row.price && moneyInputToApi(row.price) !== product.currentPrice;
                  const badQuantity = Boolean(row.productId) && row.quantity !== "" && (!isWholeNumber(row.quantity) || Number(row.quantity) < 1);
                  return (
                    <tr key={row.key}>
                      <td>
                        <select value={row.productId} onChange={(e) => chooseProduct(row.key, e.target.value)} aria-label="Produto">
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
                          onChange={(e) => updateRow(row.key, { quantity: e.target.value.replace(/\D/g, "") })}
                          inputMode="numeric"
                          aria-label="Quantidade"
                          aria-invalid={badQuantity}
                        />
                        {badQuantity && <div className="field-error">Maior que zero</div>}
                      </td>
                      <td>
                        <MoneyInput
                          className="input-small"
                          value={row.price}
                          onChange={(value) => updateRow(row.key, { price: value })}
                          aria-label="Preço unitário"
                        />
                        {priceChanged && <div className="muted small">Tabela: {formatMoney(product.currentPrice)}</div>}
                      </td>
                      <td>
                        <DiscountField
                          label="Desconto do item"
                          value={row.discount}
                          onChange={(value) => updateRow(row.key, { discount: value })}
                        />
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
            + Adicionar produto
          </button>
        </section>

        <section className="card form-grid form-wide">
          <h2>D. Entrega e logística</h2>
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
            Valor do frete
            <MoneyInput value={freight} onChange={setFreight} aria-label="Valor do frete" />
          </label>
          {deliveryMode === "DELIVERY" && (
            <label className="span-2">
              Endereço de entrega
              <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
            </label>
          )}
          <label>
            Motorista
            <input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
          </label>
          <label>
            Ajudante
            <input value={helperName} onChange={(e) => setHelperName(e.target.value)} />
          </label>
          <label>
            Veículo
            <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
          </label>
          <label>
            Placa
            <input value={licensePlate} onChange={(e) => setLicensePlate(e.target.value.toUpperCase())} maxLength={10} />
          </label>
          <label>
            Sacos carregados
            <input value={loadedBags} onChange={(e) => setLoadedBags(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
          </label>
          <label>
            Responsável pelo transporte
            <input value={deliveryResponsible} onChange={(e) => setDeliveryResponsible(e.target.value)} />
          </label>
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
          <h2>E. Pagamento e resumo</h2>
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
          <div className="field">
            <span className="field-label">Desconto geral</span>
            <DiscountField label="Desconto geral" value={discount} onChange={setDiscount} />
            <span className="muted small">O percentual incide sobre os produtos já com os descontos dos itens (nunca sobre o frete).</span>
          </div>
          <p className="muted small span-2">
            Os pagamentos recebidos (valores, formas e vencimentos) serão registrados na etapa de pagamentos; aqui fica só a condição.
          </p>
        </section>

        <section className="card totals" aria-live="polite">
          <h2>Resumo</h2>
          {previewError && <p className="text-error">{previewError}</p>}
          {!preview && !previewError && <p className="muted">Escolha os produtos e as quantidades para ver o total.</p>}
          {preview && (
            <dl>
              <dt>Produtos (sem descontos)</dt>
              <dd>{formatMoney(preview.grossSubtotal)}</dd>
              <dt>Descontos dos itens</dt>
              <dd>− {formatMoney(preview.itemDiscountsTotal)}</dd>
              <dt>Frete</dt>
              <dd>{formatMoney(preview.freightAmount)}</dd>
              <dt>Desconto geral</dt>
              <dd>− {formatMoney(preview.discountAmount)}</dd>
              <dt className="total">Total da saída</dt>
              <dd className="total">{formatMoney(preview.total)}</dd>
            </dl>
          )}
          <p className="muted small">Calculado pelo servidor. O valor gravado é recalculado ao salvar.</p>
        </section>

        <div className="form-actions sticky-actions">
          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? "Salvando…" : "Salvar como rascunho"}
          </button>
          {canConfirm && (
            <button type="button" className="button-secondary" disabled={submitting} onClick={() => void save(true)}>
              Salvar e revisar para confirmar
            </button>
          )}
          <Link to={loaded ? `/pedidos/${loaded.id}` : "/pedidos"} className="button-secondary">
            Cancelar
          </Link>
          <span className="muted small">Ctrl+S salva como rascunho</span>
        </div>
      </form>

      {quickCustomer && (
        <QuickCustomerPanel
          onSaved={(created) => {
            chooseCustomer(created);
            setQuickCustomer(false);
          }}
          onCancel={() => setQuickCustomer(false)}
        />
      )}
    </>
  );
}
