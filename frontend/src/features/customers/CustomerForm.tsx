// Formulário de cliente, usado para cadastrar e para editar.
import { useState, type FormEvent } from "react";
import { createCustomer, updateCustomer, type CustomerData } from "../../api/customers";
import type { Customer } from "../../api/types";
import { formatDocument, formatPhone, formatZipCode } from "../../lib/format";
import { FormErrors } from "../../components/FormErrors";

interface Props {
  /** Cliente a editar; ausente = cadastro novo. */
  customer?: Customer;
  onSaved: (customer: Customer) => void;
  onCancel: () => void;
}

function initialData(customer?: Customer): CustomerData {
  return {
    name: customer?.name ?? "",
    document: formatDocument(customer?.document ?? null),
    phone: formatPhone(customer?.phone ?? null),
    street: customer?.street ?? "",
    number: customer?.number ?? "",
    complement: customer?.complement ?? "",
    district: customer?.district ?? "",
    city: customer?.city ?? "",
    state: customer?.state ?? "",
    zipCode: formatZipCode(customer?.zipCode ?? null),
    notes: customer?.notes ?? "",
  };
}

export function CustomerForm({ customer, onSaved, onCancel }: Props) {
  const [data, setData] = useState<CustomerData>(() => initialData(customer));
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Cria a função que atualiza um campo específico do formulário. */
  function field(name: keyof CustomerData) {
    return {
      value: data[name],
      onChange: (e: { target: { value: string } }) => setData((current) => ({ ...current, [name]: e.target.value })),
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = customer ? await updateCustomer(customer.id, data) : await createCustomer(data);
      onSaved(result.customer);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid form-wide" onSubmit={handleSubmit}>
      <h2>{customer ? `Editar ${customer.name}` : "Novo cliente"}</h2>
      <FormErrors error={error} />

      <label className="span-2">
        Nome ou razão social
        <input {...field("name")} required />
      </label>
      <label>
        CPF ou CNPJ <span className="muted small">(opcional)</span>
        <input {...field("document")} inputMode="numeric" placeholder="000.000.000-00" />
      </label>
      <label>
        Telefone
        <input {...field("phone")} inputMode="tel" placeholder="(11) 98765-4321" />
      </label>
      <label className="span-2">
        Logradouro
        <input {...field("street")} />
      </label>
      <label>
        Número
        <input {...field("number")} />
      </label>
      <label>
        Complemento
        <input {...field("complement")} />
      </label>
      <label>
        Bairro
        <input {...field("district")} />
      </label>
      <label>
        Cidade
        <input {...field("city")} />
      </label>
      <label>
        UF
        <input {...field("state")} maxLength={2} placeholder="SP" />
      </label>
      <label>
        CEP
        <input {...field("zipCode")} inputMode="numeric" placeholder="00000-000" />
      </label>
      <label className="span-2">
        Observações
        <textarea {...field("notes")} rows={3} />
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
