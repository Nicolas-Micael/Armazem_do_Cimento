// Rotas (endereços) do frontend e qual tela aparece em cada uma.
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider } from "./features/auth/AuthContext";
import { LoginPage } from "./features/auth/LoginPage";
import { ChangePasswordPage } from "./features/auth/ChangePasswordPage";
import { HomePage } from "./features/home/HomePage";
import { UsersPage } from "./features/users/UsersPage";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { Layout } from "./components/Layout";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/trocar-senha"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />
          {/* Telas internas: exigem login e usam o Layout (cabeçalho e menu). */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomePage />} />
            <Route
              path="/usuarios"
              element={
                <ProtectedRoute roles={["ADMIN"]}>
                  <UsersPage />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
