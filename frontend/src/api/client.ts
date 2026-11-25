// Função única para chamar o backend.
//
// Todas as telas usam apiRequest() em vez de chamar fetch() direto.
// Assim, o tratamento de erros (e, na etapa 2, o envio do cookie de
// sessão) fica num só lugar.

/** Formato de erro que o backend sempre devolve. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Erro lançado quando a API responde com status de falha. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "include", // envia o cookie de sessão (etapa 2)
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    throw new ApiError(
      errorBody?.error?.message ?? `Erro ${response.status} ao comunicar com o servidor.`,
      response.status,
      errorBody?.error?.code ?? "UNKNOWN",
    );
  }

  return body as T;
}
