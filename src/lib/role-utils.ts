/** Role display helpers (shared across UI) */

export const ROLE_LABELS: Record<string, string> = {
  platform: "Platform",
  admin: "Admin",
  user: "User",
  auditor: "Auditor",
};

/** Hex colors for role badges (used with ColorBadge) — fallback when entity_color not set */
export const ROLE_COLORS: Record<string, string> = {
  platform: "#14B8A6",
  admin: "#EF4444",
  auditor: "#22C55E",
};

export function getRoleLabel(code: string): string {
  return ROLE_LABELS[code] ?? code;
}

export function getRoleColor(code: string): string {
  return ROLE_COLORS[code] ?? "#888888";
}
