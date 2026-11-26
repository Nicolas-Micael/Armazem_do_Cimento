// Campo de dinheiro (ou percentual) no padrão brasileiro.
//
// O valor continua sendo TEXTO ("38,90"), nunca number: assim não existe
// arredondamento de ponto flutuante. A conversão para o formato da API
// ("38.90") é feita por moneyInputToApi na hora de enviar.
import type { InputHTMLAttributes } from "react";
import { completeMoneyInput, sanitizeMoneyInput } from "../lib/format";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "prefix"> {
  value: string;
  onChange: (value: string) => void;
  /** Texto fixo antes do número, ex.: "R$" ou "%". */
  prefix?: string;
}

export function MoneyInput({ value, onChange, prefix = "R$", className, ...rest }: Props) {
  return (
    <span className="money-input">
      <span className="money-prefix" aria-hidden="true">
        {prefix}
      </span>
      <input
        {...rest}
        className={className}
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(sanitizeMoneyInput(e.target.value))}
        onBlur={() => onChange(completeMoneyInput(value))}
      />
    </span>
  );
}
