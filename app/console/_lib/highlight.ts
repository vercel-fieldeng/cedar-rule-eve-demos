import { parse } from "gpu-lexer";

export type CodeLanguage = "cedar" | "typescript" | "text";

type SyntaxType =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "type"
  | "function"
  | "constant"
  | "operator";

export interface HighlightToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

const TOKEN_COLORS: Record<SyntaxType, string | undefined> = {
  plain: undefined,
  comment: "var(--muted-foreground)",
  string: "var(--code-string)",
  number: "var(--code-number)",
  keyword: "var(--code-keyword)",
  type: "var(--code-type)",
  function: "var(--code-function)",
  constant: "var(--code-constant)",
  operator: "var(--code-operator)",
};

function token(content: string, type: SyntaxType = "plain"): HighlightToken {
  return {
    content,
    color: TOKEN_COLORS[type],
    fontStyle: type === "comment" ? 1 : undefined,
  };
}

export async function highlightCode(code: string, _language: CodeLanguage) {
  const spans = await parse(code);
  const tokens: HighlightToken[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start > cursor) tokens.push(token(code.slice(cursor, span.start)));
    tokens.push(token(code.slice(span.start, span.end), span.type));
    cursor = span.end;
  }

  if (cursor < code.length) tokens.push(token(code.slice(cursor)));

  const lines: HighlightToken[][] = [[]];
  for (const item of tokens) {
    const parts = item.content.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines.at(-1)?.push({ ...item, content: part });
    });
  }

  return lines;
}
