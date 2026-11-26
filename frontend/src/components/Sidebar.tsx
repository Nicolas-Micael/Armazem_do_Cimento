// Menu lateral: grupos de módulos, ícones e recolhimento.
import { NavLink } from "react-router";
import type { Role } from "../api/types";
import { Icon } from "./Icon";
import { visibleGroups } from "./navigation";

interface Props {
  role: Role;
  collapsed: boolean;
  /** Menu aberto como gaveta (telas pequenas). */
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onNavigate: () => void;
}

export function Sidebar({ role, collapsed, mobileOpen, onToggleCollapsed, onNavigate }: Props) {
  return (
    <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}${mobileOpen ? " sidebar-open" : ""}`} aria-label="Menu principal">
      <div className="sidebar-brand">
        <span className="sidebar-logo" aria-hidden="true">AC</span>
        <span className="sidebar-brand-text">Armazém do Cimento</span>
      </div>

      <nav className="sidebar-nav">
        {visibleGroups(role).map((group) => (
          <div key={group.label} className="sidebar-group">
            <p className="sidebar-group-label">{group.label}</p>
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                title={collapsed ? item.label : undefined}
                className="sidebar-link"
                onClick={onNavigate}
              >
                <Icon name={item.icon} />
                <span className="sidebar-link-text">{item.label}</span>
                {!item.implemented && <span className="sidebar-soon">Em breve</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <button type="button" className="sidebar-toggle" onClick={onToggleCollapsed} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
        <Icon name={collapsed ? "chevron-right" : "chevron-left"} />
        <span className="sidebar-link-text">Recolher menu</span>
      </button>
    </aside>
  );
}
