// Erros "esperados" da aplicação.
//
// Quando uma regra de negócio é violada (ex.: pedido não encontrado),
// o código lança um destes erros. O middleware errorHandler transforma
// o erro numa resposta HTTP com o código e a mensagem corretos.
// Assim nenhum erro é escondido e o usuário recebe uma mensagem clara.

export class AppError extends Error {
  constructor(
    message: string,
    /** Código HTTP da resposta (400, 404, 409...). */
    public readonly statusCode: number,
    /** Código curto e estável que o frontend pode usar. */
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400 — dados enviados em formato inválido. */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

/** 401 — a pessoa não está autenticada (não fez login). */
export class UnauthorizedError extends AppError {
  constructor(message = "É necessário fazer login.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

/** 403 — está autenticada, mas o perfil não permite a ação. */
export class ForbiddenError extends AppError {
  constructor(message = "Seu perfil não tem permissão para esta ação.", code = "FORBIDDEN") {
    super(message, 403, code);
  }
}

/** 403 — usuário com senha temporária precisa cadastrar uma senha nova. */
export class PasswordChangeRequiredError extends ForbiddenError {
  constructor() {
    super("Cadastre uma nova senha para continuar.", "PASSWORD_CHANGE_REQUIRED");
  }
}

/** 404 — o registro procurado não existe. */
export class NotFoundError extends AppError {
  constructor(message = "Registro não encontrado.") {
    super(message, 404, "NOT_FOUND");
  }
}

/** 409 — a ação conflita com o estado atual (ex.: editar pedido concluído). */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}
