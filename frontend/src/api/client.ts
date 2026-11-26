// Função única para chamar o backend.
//
// Todas as telas usam apiRequest() em vez de chamar fetch() direto.
// Assim o envio do cookie de sessão e o tratamento de erros ficam num
// só lugar.

/** Erro de um campo específico, enviado pelo backend na validação. */
export interface FieldError {
  field: string;
  message: string;
}

/** Formato de erro que o backend sempre devolve. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: FieldError[] };
}

/** Erro lançado quando a API responde com status de falha. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly fieldErrors: FieldError[] = [],
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: "include", // envia o cookie de sessão
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new ApiError("Sem conexão com o servidor. Verifique a internet e tente novamente.", 0, "NETWORK_ERROR");
  }

  // 204 = sucesso sem conteúdo (ex.: logout).
  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    throw new ApiError(
      errorBody?.error?.message ?? `Erro ${response.status} ao comunicar com o servidor.`,
      response.status,
      errorBody?.error?.code ?? "UNKNOWN",
      errorBody?.error?.details ?? [],
    );
  }

  return body as T;
}

/** Atalho para enviar um objeto como JSON. */
export function jsonBody(method: "POST" | "PATCH", data: unknown): RequestInit {
  return { method, body: JSON.stringify(data) };
}
