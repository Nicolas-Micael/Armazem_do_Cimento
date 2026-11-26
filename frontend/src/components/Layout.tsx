// Estrutura comum das telas internas: menu lateral, cabeçalho e conteúdo.
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { useAuth } from "../features/auth/AuthContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const COLLAPSED_KEY = "armazem_menu_recolhido";

/** Lê/grava a preferência do menu. O armazenamento do navegador pode falhar (janela privada), então tudo é protegido. */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Ao trocar de tela, fecha a gaveta do menu (celular/tablet).
  useEffect(() => setMobileOpen(false), [pathname]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, current ? "0" : "1");
      } catch {
        /* sem armazenamento: a preferência só vale nesta sessão */
      }
      return !current;
    });
  }

  if (!user) return null;

  return (
    <div className={`shell${collapsed ? " shell-collapsed" : ""}`}>
      <Sidebar
        role={user.role}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggleCollapsed={toggleCollapsed}
        onNavigate={() => setMobileOpen(false)}
      />
      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
      <div className="shell-main">
        <Topbar user={user} onLogout={() => void logout()} onOpenMenu={() => setMobileOpen(true)} />
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
