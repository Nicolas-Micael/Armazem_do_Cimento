// Mostra a mensagem de erro de um formulário e, se houver, os erros por campo.
import { ApiError } from "../api/client";

const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  username: "Usuário",
  role: "Perfil",
  password: "Senha",
  temporaryPassword: "Senha temporária",
  currentPassword: "Senha atual",
  newPassword: "Nova senha",
  document: "CPF/CNPJ",
  phone: "Telefone",
  street: "Logradouro",
  number: "Número",
  complement: "Complemento",
  district: "Bairro",
  city: "Cidade",
  state: "UF",
  zipCode: "CEP",
  notes: "Observações",
  brand: "Marca",
  cementType: "Tipo de cimento",
  currentPrice: "Preço",
  customerId: "Cliente",
  items: "Itens",
  freightAmount: "Frete",
  "discount.value": "Desconto",
  discount: "Desconto",
  paymentTerm: "Condição de pagamento",
  deliveryMode: "Modalidade de entrega",
  deliveryAddress: "Endereço de entrega",
  deliveryResponsible: "Responsável pela entrega",
  expectedDeliveryDate: "Data prevista",
  deliveryNotes: "Observações da entrega",
  driverName: "Motorista",
  helperName: "Ajudante",
  vehicle: "Veículo",
  licensePlate: "Placa",
  loadedBags: "Sacos carregados",
  operationType: "Tipo de operação",
  amount: "Valor",
  method: "Meio de pagamento",
  accountId: "Conta de destino",
  receivedAt: "Data do recebimento",
  reason: "Motivo",
  check: "Cheque",
  "check.number": "Número do cheque",
  "check.bank": "Banco do cheque",
  "check.expectedClearingDate": "Data prevista de compensação",
  dueDates: "Vencimentos",
  note: "Observação",
};

/** "items.0.quantity" → "Item 1 — quantidade". */
function itemLabel(field: string): string | null {
  const match = /^items\.(\d+)\.(\w+)(?:\.value)?$/.exec(field);
  if (!match) return null;
  const names: Record<string, string> = { productId: "produto", quantity: "quantidade", unitPrice: "preço", discount: "desconto" };
  return `Item ${Number(match[1]) + 1} — ${names[match[2] ?? ""] ?? match[2]}`;
}

export function FormErrors({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : "Erro inesperado.";
  const fieldErrors = error instanceof ApiError ? error.fieldErrors : [];

  return (
    <div className="alert alert-error" role="alert">
      <p>{message}</p>
      {fieldErrors.length > 0 && (
        <ul>
          {fieldErrors.map((fieldError) => (
            <li key={fieldError.field + fieldError.message}>
              <strong>{FIELD_LABELS[fieldError.field] ?? itemLabel(fieldError.field) ?? fieldError.field}:</strong> {fieldError.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
