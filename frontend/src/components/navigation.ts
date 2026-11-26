// Definição do menu lateral: é a ÚNICA lista de telas do sistema.
// O menu, o título do cabeçalho e o breadcrumb (caminho de navegação) leem daqui,
// então para criar um módulo novo basta acrescentar uma linha.
import type { Role } from "../api/types";
import type { IconName } from "./Icon";

export interface NavItem {
  label: string;
  path: string;
  icon: IconName;
  /** false = módulo ainda não construído: abre a tela "Em desenvolvimento". */
  implemented: boolean;
  /** Se informado, só estes perfis veem o item (o backend também bloqueia). */
  roles?: Role[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Início",
    items: [{ label: "Dashboard", path: "/", icon: "dashboard", implemented: true }],
  },
  {
    label: "Comercial",
    items: [
      { label: "Saídas de Cimento", path: "/pedidos", icon: "truck", implemented: true },
      { label: "Orçamentos", path: "/orcamentos", icon: "file", implemented: false },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { label: "Clientes", path: "/clientes", icon: "users", implemented: true },
      { label: "Produtos", path: "/produtos", icon: "box", implemented: true },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { label: "Contas a Receber", path: "/financeiro/contas-a-receber", icon: "money", implemented: false },
      { label: "Contas a Pagar", path: "/financeiro/contas-a-pagar", icon: "money", implemented: false },
      { label: "Fluxo de Caixa", path: "/financeiro/fluxo-de-caixa", icon: "chart", implemented: false },
    ],
  },
  {
    label: "Relatórios",
    items: [
      { label: "Relatório de Saídas", path: "/relatorios/saidas", icon: "report", implemented: false },
      { label: "Relatório de Vendas", path: "/relatorios/vendas", icon: "report", implemented: false },
      { label: "Relatório por Cliente", path: "/relatorios/clientes", icon: "report", implemented: false },
      { label: "Relatório por Produto", path: "/relatorios/produtos", icon: "report", implemented: false },
    ],
  },
  {
    label: "Configurações",
    items: [
      { label: "Minha Conta", path: "/minha-conta", icon: "user", implemented: true },
      { label: "Usuários e Permissões", path: "/usuarios", icon: "shield", implemented: true, roles: ["ADMIN"] },
      { label: "Configurações do Sistema", path: "/configuracoes", icon: "settings", implemented: false },
    ],
  },
];

/** Itens visíveis para o perfil informado, já com o nome do grupo. */
export function visibleGroups(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

export interface Crumb {
  label: string;
  /** Sem `to` = parte atual (não é link). */
  to?: string;
}

/** Nomes das subtelas dos pedidos, para o breadcrumb. */
const SUBPAGE_LABELS: Record<string, string> = {
  novo: "Nova saída",
  editar: "Editar",
};

/**
 * Descobre o título da tela e o breadcrumb a partir do endereço.
 * Ex.: "/pedidos/abc/editar" → Início › Comercial › Saídas de Cimento › Saída › Editar
 */
export function resolveLocation(pathname: string): { title: string; crumbs: Crumb[] } {
  const all = NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ group, item })));
  // O item cujo caminho é o mais longo e é prefixo do endereço atual.
  const match = all
    .filter(({ item }) => (item.path === "/" ? pathname === "/" : pathname === item.path || pathname.startsWith(item.path + "/")))
    .sort((a, b) => b.item.path.length - a.item.path.length)[0];

  if (!match) {
    if (pathname === "/trocar-senha") return { title: "Trocar senha", crumbs: [{ label: "Início", to: "/" }, { label: "Trocar senha" }] };
    return { title: "Armazém do Cimento", crumbs: [{ label: "Início", to: "/" }] };
  }

  const { group, item } = match;
  if (item.path === "/") return { title: item.label, crumbs: [{ label: "Início" }] };

  const rest = pathname.slice(item.path.length).split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "Início", to: "/" }, { label: group.label }];
  if (rest.length === 0) {
    crumbs.push({ label: item.label });
    return { title: item.label, crumbs };
  }
  crumbs.push({ label: item.label, to: item.path });
  // Primeiro segmento extra: "novo" ou o identificador do registro.
  const first = rest[0] ?? "";
  const firstLabel = SUBPAGE_LABELS[first] ?? "Detalhe";
  if (rest.length === 1) {
    crumbs.push({ label: firstLabel });
    return { title: firstLabel, crumbs };
  }
  crumbs.push({ label: "Detalhe", to: `${item.path}/${first}` });
  const lastLabel = SUBPAGE_LABELS[rest[1] ?? ""] ?? "Detalhe";
  crumbs.push({ label: lastLabel });
  return { title: lastLabel, crumbs };
}
