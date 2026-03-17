
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
 * Tries to extract all applicable roles from a given name/string.
 * Uses fuzzy matching based on defined patterns.
 */
export function getRolesFromName(name: string): string[] {
  if (!name) return [];
  
  const cleanName = name.toLowerCase();
  const foundRoles: string[] = [];
  
  for (const role of ROLES) {
    if (role.patterns.some(pattern => pattern.test(cleanName))) {
      foundRoles.push(role.name);
    }
  }
  
  return foundRoles;
}

/**
 * Returns the rank (vertical order) of a role.
 * Lower number means higher position (top of diagram).
 */
export function getRoleRank(roleName: string | undefined, allRoles: string[] = []): number {
  const normalizedName = (!roleName || roleName === 'Unassigned') ? 'Unassigned' : roleName;
  
  // 1. Check if it matches a predefined role
  const predefinedIndex = ROLES.findIndex(r => r.name === normalizedName);
  if (predefinedIndex !== -1) return predefinedIndex;

  // 2. Determine rank for custom roles and "Unassigned"
  // We want a contiguous list: [Predefined Roles...] [Custom Roles...] [Unassigned]
  const customRoleNames = allRoles.filter(name => 
    name !== 'Unassigned' && !ROLES.some(r => r.name === name)
  );
  
  if (normalizedName === 'Unassigned') {
    return ROLES.length + customRoleNames.length;
  }

  const customIndex = customRoleNames.indexOf(normalizedName);
  return customIndex === -1 ? ROLES.length + customRoleNames.length : ROLES.length + customIndex;
}

/**
 * Tries to find roles in the name and returns the cleaned name (without role prefix) and the role names.
 */
export function extractRolesAndCleanName(name: string): { roles: string[]; cleanName: string } {
  let roles = getRolesFromName(name);
  let cleanName = name;

  // 1. Check for "[Role1, Role2] Task Name" pattern
  const bracketMatch = name.match(/^\[(.*?)\]\s*(.*)$/);
  if (bracketMatch) {
    const rawRoles = bracketMatch[1].split(',').map(r => r.trim());
    const mappedRoles: string[] = [];
    
    rawRoles.forEach(rawRole => {
      const matched = getRolesFromName(rawRole);
      if (matched.length > 0) {
        mappedRoles.push(...matched);
      } else {
        mappedRoles.push(rawRole);
      }
    });

    // Remove duplicates
    roles = Array.from(new Set(mappedRoles));
    cleanName = bracketMatch[2].trim() || cleanName;
    return { roles, cleanName };
  }

  // 2. Check for "Role: Task Name" pattern
  const colonMatch = name.match(/^([^:]+):\s*(.*)$/);
  if (colonMatch) {
    const rawRole = colonMatch[1].trim();
    // Only accept it as a role prefix if it's reasonably short 
    if (rawRole.length > 0 && rawRole.length < 35) {
      const matched = getRolesFromName(rawRole);
      if (matched.length > 0) {
        roles = matched;
      } else {
        roles = [rawRole];
      }
      cleanName = colonMatch[2].trim() || cleanName;
      return { roles, cleanName };
    }
  }

  // If no prefix pattern was found, return the fuzzy matched roles (if any) and the original name
  return { roles, cleanName };
}
