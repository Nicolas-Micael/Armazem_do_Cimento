// Ícones do sistema, desenhados em SVG (sem biblioteca externa).
// Todos usam o mesmo traço, para o visual ficar consistente.
export type IconName =
  | "dashboard" | "truck" | "file" | "users" | "box" | "money" | "chart"
  | "report" | "user" | "shield" | "settings" | "search" | "menu" | "chevron-left" | "chevron-right" | "logout" | "key";

const PATHS: Record<IconName, string> = {
  dashboard: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  truck: "M2 6h12v10H2zM14 9h4l3 3v4h-7zM6 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01",
  file: "M6 2h8l5 5v15H6zM14 2v5h5M9 13h7M9 17h7",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 21v-1a6 6 0 0 1 12 0v1M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 4 6v1",
  box: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9",
  money: "M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9v.01M18 15v.01",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  report: "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a8 8 0 0 1 16 0v1",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  menu: "M3 6h18M3 12h18M3 18h18",
  "chevron-left": "M15 18l-6-6 6-6",
  "chevron-right": "M9 18l6-6-6-6",
  logout: "M9 21H5V3h4M16 17l5-5-5-5M21 12H9",
  key: "M15 8a4 4 0 1 1-3.6 5.7L3 22v-3l2-2v-2h2l3.4-3.4A4 4 0 0 1 15 8z",
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
