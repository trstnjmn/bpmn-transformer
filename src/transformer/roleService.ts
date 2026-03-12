
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
  if (!roleName) return ROLES.length; // Default to bottom
  
  const index = ROLES.findIndex(r => r.name === roleName);
  return index === -1 ? ROLES.length : index;
}

/**
 * Tries to find a role in the name and returns the cleaned name (without role prefix) and the role name.
 */
export function extractRoleAndCleanName(name: string): { role?: string; cleanName: string } {
  let role = getRoleFromName(name);
  let cleanName = name;
  
  if (role) {
    // Optional: remove the matched role from the name if it's a prefix like "[SysAdmin] ..."
    // For now, we'll keep the name as is but we could strip brackets etc.
    const bracketMatch = name.match(/^\[(.*?)\]\s*(.*)$/);
    if (bracketMatch) {
      // If bracket content matches a role, we use the rest as cleanName
      const possibleRole = getRoleFromName(bracketMatch[1]);
      if (possibleRole) {
        role = possibleRole;
        cleanName = bracketMatch[2];
      }
    }
  }
  
  return { role, cleanName };
}
