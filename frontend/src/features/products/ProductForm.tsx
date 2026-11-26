// Formulário de produto, usado para cadastrar e para editar.
import { useState, type FormEvent } from "react";
import { createProduct, updateProduct, type ProductData } from "../../api/products";
import type { Product } from "../../api/types";
import { moneyApiToInput, moneyInputToApi } from "../../lib/format";
import { FormErrors } from "../../components/FormErrors";

interface Props {
  product?: Product;
  onSaved: (product: Product) => void;
  onCancel: () => void;
}

export function ProductForm({ product, onSaved, onCancel }: Props) {
  const [name, setName] = useState(product?.name ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [cementType, setCementType] = useState(product?.cementType ?? "");
  const [bagWeightKg, setBagWeightKg] = useState(product?.bagWeightKg?.replace(".", ",") ?? "");
  // O preço é digitado no padrão brasileiro ("38,90") e convertido no envio.
  const [price, setPrice] = useState(product ? moneyApiToInput(product.currentPrice) : "");
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const data: ProductData = {
      name,
      brand,
      cementType,
      bagWeightKg: bagWeightKg.trim().replace(",", "."),
      currentPrice: moneyInputToApi(price),
    };
    try {
      const result = product ? await updateProduct(product.id, data) : await createProduct(data);
      onSaved(result.product);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid form-wide" onSubmit={handleSubmit}>
      <h2>{product ? `Editar ${product.name}` : "Novo produto"}</h2>
      {product && (
        <p className="muted small span-2">
          Alterar o preço vale só para pedidos novos. Pedidos já registrados mantêm o preço da época.
        </p>
      )}
      <FormErrors error={error} />

      <label className="span-2">
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Cimento CP II-E-32 50 kg" required />
      </label>
      <label>
        Marca
        <input value={brand} onChange={(e) => setBrand(e.target.value)} />
      </label>
      <label>
        Tipo de cimento
        <input value={cementType} onChange={(e) => setCementType(e.target.value)} placeholder="ex.: CP II-E-32" />
      </label>
      <label>
        Peso do saco (kg)
        <input value={bagWeightKg} onChange={(e) => setBagWeightKg(e.target.value)} inputMode="decimal" placeholder="50" />
      </label>
      <label>
        Preço por saco (R$)
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="38,90" required />
      </label>

      <div className="form-actions span-2">
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
