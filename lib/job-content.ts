const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  nbsp: " ",
  quot: "\"",
  rdquo: "”",
  rsquo: "’",
};

function decodeEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const radix = entity[1]?.toLowerCase() === "x" ? 16 : 10;
      const digits = radix === 16 ? entity.slice(2) : entity.slice(1);
      const codePoint = Number.parseInt(digits, radix);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function safeLink(href: string, label: string) {
  try {
    const url = new URL(decodeEntities(href));
    return ["http:", "https:"].includes(url.protocol)
      ? `[${label.trim() || url.toString()}](${url.toString()})`
      : label;
  } catch {
    return label;
  }
}

/** Converts provider HTML to a safe, readable plain-text/Markdown subset. */
export function normalizePostingContent(value: string) {
  if (!value) return "";
  // Some ATS APIs return HTML with the markup itself entity-escaped.
  let text = decodeEntities(decodeEntities(value)).replace(/\r\n?/g, "\n");

  text = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template|svg|canvas)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<img\b[^>]*>/gi, "");

  text = text.replace(
    /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (_match, quoted, singleQuoted, bare, label) =>
      safeLink(quoted ?? singleQuoted ?? bare ?? "", decodeEntities(label.replace(/<[^>]+>/g, ""))),
  );

  for (let level = 1; level <= 6; level += 1) {
    const heading = new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}\\s*>`, "gi");
    text = text.replace(heading, (_match, content) => `\n${"#".repeat(Math.min(level + 1, 6))} ${content}\n`);
  }

  text = text
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|section|article|header|footer|main|ul|ol|dl|dt|dd|blockquote|table|thead|tbody|tfoot|tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function plainPostingText(value: string) {
  return normalizePostingContent(value)
    .replace(/^#{2,6}\s+/gm, "")
    .replace(/^\s*-\s+/gm, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1");
}
