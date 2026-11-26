// Cabeçalho superior: título da tela, breadcrumb, busca rápida e menu do perfil.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ROLE_SHORT_LABELS, type User } from "../api/types";
import { Icon } from "./Icon";
import { resolveLocation } from "./navigation";

interface Props {
  user: User;
  onLogout: () => void;
  onOpenMenu: () => void;
}

export function Topbar({ user, onLogout, onOpenMenu }: Props) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { title, crumbs } = resolveLocation(pathname);
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Fecha o menu do perfil ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!profileOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setProfileOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  // A busca rápida procura saídas (por número ou nome do cliente) e abre a lista já filtrada.
  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    navigate(text ? `/pedidos?busca=${encodeURIComponent(text)}` : "/pedidos");
    setQuery("");
  }

  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <header className="topbar">
      <button type="button" className="topbar-menu-button" onClick={onOpenMenu} aria-label="Abrir menu">
        <Icon name="menu" />
      </button>

      <div className="topbar-title">
        <nav aria-label="Caminho de navegação" className="breadcrumb">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`}>
              {index > 0 && <span className="breadcrumb-sep"> / </span>}
              {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current={index === crumbs.length - 1 ? "page" : undefined}>{crumb.label}</span>}
            </span>
          ))}
        </nav>
        <strong className="topbar-heading">{title}</strong>
      </div>

      <form className="topbar-search" onSubmit={handleSearch} role="search">
        <Icon name="search" size={18} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar saída (nº ou cliente)"
          aria-label="Busca rápida de saídas"
        />
      </form>

      <div className="profile" ref={profileRef}>
        <button type="button" className="profile-button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-haspopup="menu">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <span className="profile-text">
            <span className="profile-name">{user.name}</span>
            <span className="profile-role">{ROLE_SHORT_LABELS[user.role]} · {user.username}</span>
          </span>
        </button>
        {profileOpen && (
          <div className="profile-menu" role="menu">
            <Link to="/minha-conta" role="menuitem" onClick={() => setProfileOpen(false)}>
              <Icon name="user" size={18} /> Minha conta
            </Link>
            <Link to="/trocar-senha" role="menuitem" onClick={() => setProfileOpen(false)}>
              <Icon name="key" size={18} /> Trocar senha
            </Link>
            <button type="button" role="menuitem" onClick={onLogout}>
              <Icon name="logout" size={18} /> Sair
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
