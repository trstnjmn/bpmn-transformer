/**
 * Bereinigt einen Text extrem gründlich von HTML und Whitespace.
 * Dies wird intern für den Vergleich genutzt, um doppelte Lanes zu vermeiden.
 */
function getLeanIdentity(name: string): string {
  return name
      .replace(/<[^>]*>/g, '')      // Alle HTML Tags weg
      .replace(/&nbsp;/g, ' ')     // HTML Leerzeichen zu Text Leerzeichen
      .replace(/\s+/g, '')         // ALLE Leerzeichen weg für den Identitäts-Check
      .toLowerCase()               // Case-insensitive
      .trim();
}

/**
 * Normalisiert einen Rollennamen für die Anzeige in der Lane-Beschriftung.
 */
function normalizeRoleName(name: string): string {
  if (!name) return '';
  return name
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
}

/**
 * Berechnet einen Rang für das Sortieren der Lanes.
 */
export function getRoleRank(roleName: string | undefined): number {
  if (!roleName || roleName === 'Unassigned') return 999;
  const identity = getLeanIdentity(roleName);
  return 100 + (identity.charCodeAt(0) || 0);
}

/**
 * Kernfunktion zur automatischen Extraktion von Rolle und Aufgabenname.
 * Verhindert Duplikate durch strikte Identitätsprüfung.
 */
export function extractRoleAndCleanName(text: string): { role?: string; cleanName: string; roleIdentity?: string } {
  if (!text) return { cleanName: '' };

  const cleanText = normalizeRoleName(text);
  let role: string | undefined;
  let taskName: string = cleanText;

  // 1. Muster: [Rolle] Aufgabe
  const bracketMatch = cleanText.match(/^\[(.*?)\]\s*(.*)$/);
  if (bracketMatch) {
    role = normalizeRoleName(bracketMatch[1]);
    taskName = normalizeRoleName(bracketMatch[2]) || role;
  }
  // 2. Muster: Rolle: Aufgabe
  else {
    const colonMatch = cleanText.match(/^([^:]{2,30}):\s*(.*)$/);
    if (colonMatch) {
      role = normalizeRoleName(colonMatch[1]);
      taskName = normalizeRoleName(colonMatch[2]);
    }
    // 3. Muster: Rolle - Aufgabe
    else {
      const dashMatch = cleanText.match(/^([^-]{2,25})\s*-\s*(.*)$/);
      if (dashMatch) {
        role = normalizeRoleName(dashMatch[1]);
        taskName = normalizeRoleName(dashMatch[2]);
      }
    }
  }

  return {
    role,
    cleanName: taskName,
    // Diese Identity sollte im Mapper als Key für die Map verwendet werden!
    roleIdentity: role ? getLeanIdentity(role) : undefined
  };
}

/**
 * Validiert einen Rollennamen.
 */
export function getRoleFromName(name: string): string | undefined {
  const normalized = normalizeRoleName(name);
  return normalized.length > 0 ? normalized : undefined;
}