// Guarda "quem está logado" para o app inteiro.
//
// Um Context do React funciona como uma variável compartilhada: qualquer
// tela pode chamar useAuth() para saber o usuário atual, sem precisar
// passar essa informação de componente em componente.
//
// Importante: o frontend NÃO decide quem pode o quê. Ele só usa estes
// dados para mostrar as telas certas; o backend confere tudo de novo.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import * as authApi from "../../api/auth";
import { ApiError } from "../../api/client";
import type { User } from "../../api/types";

interface AuthContextValue {
  /** Usuário logado, ou null se ninguém estiver logado. */
  user: User | null;
  /** true enquanto confere, ao abrir o app, se já existe uma sessão. */
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Atualiza o usuário guardado (ex.: depois de trocar a senha). */
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Ao abrir o app, pergunta ao backend se o cookie ainda vale.
  useEffect(() => {
    authApi
      .getMe()
      .then(({ user }) => setUser(user))
      .catch((error: unknown) => {
        // 401 = ninguém logado, situação normal. Outros erros vão para o console.
        if (!(error instanceof ApiError && error.status === 401)) console.error(error);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { user } = await authApi.login(username, password);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return context;
}
