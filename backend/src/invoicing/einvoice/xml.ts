/** Minimal, dependency-free XML writer. Pure: same input always yields the same bytes. */

const XML_ESCAPES = new Map<string, string>([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&apos;'],
]);

/** Control characters other than tab/LF/CR are not representable in XML 1.0. */
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML_CHARS, '')
    .replace(/[&<>"']/g, (char) => XML_ESCAPES.get(char) ?? char);
}

export type XmlAttributes = Record<string, string | undefined>;

function renderAttributes(attributes: XmlAttributes): string {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => ` ${name}="${escapeXml(value)}"`)
    .join('');
}

function indent(block: string): string {
  return block
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

/** Container element. Children that are `null` are dropped, so optional blocks stay readable. */
export function element(
  name: string,
  attributes: XmlAttributes,
  children: Array<string | null>,
): string {
  const present = children.filter((child): child is string => child !== null);
  const attributeText = renderAttributes(attributes);
  if (present.length === 0) {
    return `<${name}${attributeText}/>`;
  }
  return `<${name}${attributeText}>\n${present.map(indent).join('\n')}\n</${name}>`;
}

/** Leaf element carrying a text value. */
export function textElement(
  name: string,
  value: string,
  attributes: XmlAttributes = {},
): string {
  return `<${name}${renderAttributes(attributes)}>${escapeXml(value)}</${name}>`;
}

/** Leaf element that disappears entirely when the value is absent. */
export function optionalTextElement(
  name: string,
  value: string | null | undefined,
  attributes: XmlAttributes = {},
): string | null {
  const trimmed = value?.trim();
  return trimmed ? textElement(name, trimmed, attributes) : null;
}

export function xmlDocument(root: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${root}\n`;
}
