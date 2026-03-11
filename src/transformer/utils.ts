/**
 * Utility to sanitize IDs to be BPMN compliant (Alphanumeric, starts with a letter).
 */
export function sanitizeId(id: string): string {
  // Ensure it starts with a letter. If not, prefix with 'id_'
  let sanitized = id.replace(/[^a-zA-Z0-9]/g, '_');
  if (!/^[a-zA-Z]/.test(sanitized)) {
    sanitized = 'sid-' + sanitized;
  }
  return sanitized;
}
