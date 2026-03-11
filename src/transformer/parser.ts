import { XMLParser } from 'fast-xml-parser';

/**
 * Converts ANY XML into a clean JSON structure.
 * 
 * @param xml - The XML string.
 * @returns The converted JSON object.
 */
export async function convertFromBpmnXml(xml: string): Promise<any> {
  const parser = new XMLParser({
    ignoreAttributes: false, // Important to keep IDs and styles
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    parseAttributeValue: true,
    trimValues: true,
  });

  const jsonObj = parser.parse(xml);
  return jsonObj;
}
