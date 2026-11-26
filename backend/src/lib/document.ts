// Validação de CPF e CNPJ.
//
// CPF e CNPJ têm "dígitos verificadores": os dois últimos números são
// calculados a partir dos anteriores. Refazendo a conta, descobrimos se
// alguém digitou errado. (Isso não prova que o documento existe na
// Receita Federal; só que o número é coerente.)

/** Remove tudo que não for número: "123.456.789-09" → "12345678909". */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Calcula um dígito verificador a partir dos dígitos e dos pesos. */
function checkDigit(digits: number[], weights: number[]): number {
  const sum = digits.reduce((total, digit, index) => total + digit * (weights[index] ?? 0), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** Recebe só números (11 dígitos). Retorna true se o CPF for válido. */
export function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false; // ex.: 111.111.111-11 é inválido
  const digits = [...cpf].map(Number);
  const first = checkDigit(digits.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === digits[9] && second === digits[10];
}

/** Recebe só números (14 dígitos). Retorna true se o CNPJ for válido. */
export function isValidCnpj(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digits = [...cnpj].map(Number);
  const first = checkDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === digits[12] && second === digits[13];
}

/** CPF (11 dígitos) ou CNPJ (14 dígitos) válido. Recebe só números. */
export function isValidCpfOrCnpj(document: string): boolean {
  if (document.length === 11) return isValidCpf(document);
  if (document.length === 14) return isValidCnpj(document);
  return false;
}
