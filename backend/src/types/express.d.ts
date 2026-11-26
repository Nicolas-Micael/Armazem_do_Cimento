// Acrescenta ao "req" do Express as informações de quem está logado.
// O middleware authenticate preenche req.auth; as rotas leem dele.
import type { Role } from "../generated/prisma/client.js";

export interface AuthenticatedUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: { user: AuthenticatedUser; sessionId: string };
    }
  }
}
