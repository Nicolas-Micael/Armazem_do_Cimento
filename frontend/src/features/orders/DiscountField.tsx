// Desconto em R$ ou %, usado no item e no desconto geral da saída.
import { MoneyInput } from "../../components/MoneyInput";
import type { Discount, DiscountType } from "../../api/orders";
import { moneyInputToApi } from "../../lib/format";

export interface DiscountDraft {
  type: DiscountType | "NONE";
  /** Texto digitado, padrão brasileiro ("10,00"). */
  value: string;
}

export const NO_DISCOUNT: DiscountDraft = { type: "NONE", value: "" };

/** Converte o que está na tela no formato da API (null = sem desconto). */
export function discountToApi(draft: DiscountDraft): Discount | null {
  if (draft.type === "NONE" || !draft.value.trim()) return null;
  return { type: draft.type, value: moneyInputToApi(draft.value) };
}

interface Props {
  value: DiscountDraft;
  onChange: (value: DiscountDraft) => void;
  label: string;
}

export function DiscountField({ value, onChange, label }: Props) {
  return (
    <span className="discount-field">
      <select
        value={value.type}
        onChange={(e) => onChange({ type: e.target.value as DiscountType | "NONE", value: e.target.value === "NONE" ? "" : value.value })}
        aria-label={`${label} — tipo`}
      >
        <option value="NONE">Sem desconto</option>
        <option value="FIXED">Valor (R$)</option>
        <option value="PERCENTAGE">Percentual (%)</option>
      </select>
      {value.type !== "NONE" && (
        <MoneyInput
          className="input-small"
          prefix={value.type === "FIXED" ? "R$" : "%"}
          value={value.value}
          onChange={(text) => onChange({ ...value, value: text })}
          aria-label={`${label} — valor`}
        />
      )}
    </span>
  );
}
