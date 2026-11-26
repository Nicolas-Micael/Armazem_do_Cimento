// Rotas (endereços) do frontend e qual tela aparece em cada uma.
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider } from "./features/auth/AuthContext";
import { LoginPage } from "./features/auth/LoginPage";
import { ChangePasswordPage } from "./features/auth/ChangePasswordPage";
import { HomePage } from "./features/home/HomePage";
import { UsersPage } from "./features/users/UsersPage";
import { CustomersPage } from "./features/customers/CustomersPage";
import { ProductsPage } from "./features/products/ProductsPage";
import { OrdersPage } from "./features/orders/OrdersPage";
import { OrderFormPage } from "./features/orders/OrderFormPage";
import { OrderDetailPage } from "./features/orders/OrderDetailPage";
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
            <Route path="/pedidos" element={<OrdersPage />} />
            <Route path="/pedidos/novo" element={<OrderFormPage />} />
            <Route path="/pedidos/:id" element={<OrderDetailPage />} />
            <Route path="/pedidos/:id/editar" element={<OrderFormPage key="editar" />} />
            <Route path="/clientes" element={<CustomersPage />} />
            <Route path="/produtos" element={<ProductsPage />} />
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
