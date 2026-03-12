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

/**
 * Basic XML beautifier using regex.
 */
export function beautifyXml(xml: string): string {
  let formatted = '';
  let indent = '';
  const tab = '  ';
  xml.split(/>\s*</).forEach((node) => {
    if (node.match(/^\/\w/)) indent = indent.substring(tab.length);
    formatted += indent + '<' + node + '>\r\n';
    if (node.match(/^<?\w[^>]*[^\/]$/)) indent += tab;
  });
  return formatted.substring(1, formatted.length - 3);
}

/**
 * Inserts line breaks into a string to ensure it doesn't exceed a maximum width.
 */
export function wordWrap(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  
  const words = text.split(' ');
  let currentLine = '';
  let result = '';
  
  words.forEach(word => {
    if ((currentLine + word).length > maxLength) {
      result += (result ? '\n' : '') + currentLine.trim();
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  });
  
  result += (result ? '\n' : '') + currentLine.trim();
  return result;
}
