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
};

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
              <strong>{FIELD_LABELS[fieldError.field] ?? fieldError.field}:</strong> {fieldError.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
