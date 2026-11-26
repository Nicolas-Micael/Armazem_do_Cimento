// Cadastro rápido de cliente, aberto sobre o formulário da saída.
//
// Fica FORA do <form> da saída (formulário dentro de formulário não é válido em HTML),
// mas o formulário da saída continua montado por baixo: nada do que foi digitado se perde.
import type { Customer } from "../../api/types";
import { CustomerForm } from "../customers/CustomerForm";

interface Props {
  onSaved: (customer: Customer) => void;
  onCancel: () => void;
}

export function QuickCustomerPanel({ onSaved, onCancel }: Props) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Cadastrar cliente">
      <div className="modal">
        <CustomerForm onSaved={onSaved} onCancel={onCancel} />
      </div>
    </div>
  );
}
