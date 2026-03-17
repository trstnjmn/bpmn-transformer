
export const ROLES = [
  {
    id: 'sysadmin',
    name: 'SysAdmin',
    patterns: [/sysadmin/i, /system\s*admin/i]
  },
  {
    id: 'techadmin',
    name: 'Tech Admin',
    patterns: [/techadmin/i, /tech\s*admin/i, /technischer\s*admin/i]
  },
  {
    id: 'fachbereich',
    name: 'Fachbereich Mitarbeiter',
    patterns: [/fachbereich/i, /\bfb\b/i, /fach-bereich/i, /business\s*user/i]
  },
  {
    id: 'compliance',
    name: 'Compliance Officer',
    patterns: [/compliance/i, /\bco\b/i, /compliance\s*officer/i]
  },
  {
    id: 'redakteur',
    name: 'Redakteur',
    patterns: [/redakteur/i, /editor/i]
  },
  {
    id: 'redaktionsleitung',
    name: 'Redaktions-leitung',
    patterns: [/redaktions-leitung/i, /redaktionsleitung/i, /editorial\s*lead/i]
  },
  {
    id: 'zenuser',
    name: 'ZENuser',
    patterns: [/zenuser/i, /\bzen\b/i, /zen-user/i]
  }
];

/**
 * Tries to extract a role from a given name/string.
 * Uses fuzzy matching based on defined patterns.
 */
export function getRoleFromName(name: string): string | undefined {
  if (!name) return undefined;

  // Also check if name is in format "[Role] Task Name" or "Role: Task Name"
  const cleanName = name.toLowerCase();

  for (const role of ROLES) {
    if (role.patterns.some(pattern => pattern.test(cleanName))) {
      return role.name;
    }
  }

  return undefined;
}

/**
 * Returns the rank (vertical order) of a role.
 * Lower number means higher position (top of diagram).
 */
export function getRoleRank(roleName: string | undefined): number {
  if (!roleName) return 1000; // Ganz weit unten

  const index = ROLES.findIndex(r => r.name === roleName);
  if (index !== -1) return index;

  // Für ganz neue Rollen: Gib einen Wert basierend auf dem Namen zurück,
  // damit verschiedene neue Rollen nicht alle den gleichen Rank (ROLES.length) haben.
  // So bekommt "Z-Rolle" einen höheren Rank als "A-Rolle".
  return 500 + roleName.charCodeAt(0);
}

/**
 * Tries to find a role in the name and returns the cleaned name (without role prefix) and the role name.
 */
export function extractRoleAndCleanName(name: string): { role?: string; cleanName: string } {
  let role = getRoleFromName(name);
  let cleanName = name;

  // 1. Check for "[Role] Task Name" pattern
  const bracketMatch = name.match(/^\[(.*?)\]\s*(.*)$/);
  if (bracketMatch) {
    const rawRole = bracketMatch[1].trim();
    role = getRoleFromName(rawRole) || rawRole;
    cleanName = bracketMatch[2].trim() || cleanName;
    return { role, cleanName };
  }

  // 2. Check for "Role: Task Name" pattern
  const colonMatch = name.match(/^([^:]+):\s*(.*)$/);
  if (colonMatch) {
    const rawRole = colonMatch[1].trim();
    // Only accept it as a role if it's reasonably short (avoids taking whole sentences)
    if (rawRole.length > 0 && rawRole.length < 35) {
      role = getRoleFromName(rawRole) || rawRole;
      cleanName = colonMatch[2].trim() || cleanName;
      return { role, cleanName };
    }
  }

  // If no prefix pattern was found, return the fuzzy matched role (if any) and the original name
  return { role, cleanName };
}