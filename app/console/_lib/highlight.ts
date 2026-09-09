import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { LanguageRegistration, ThemeRegistration } from "shiki";

export type CodeLanguage = "cedar" | "typescript" | "text";

const cedar: LanguageRegistration = {
  name: "cedar",
  scopeName: "source.cedar",
  patterns: [
    { name: "comment.line.double-slash.cedar", match: "//.*$" },
    { name: "comment.block.cedar", begin: "/\\*", end: "\\*/" },
    {
      name: "string.quoted.double.cedar",
      begin: '"',
      end: '"',
      patterns: [{ name: "constant.character.escape.cedar", match: "\\\\." }],
    },
    { name: "entity.name.function.annotation.cedar", match: "@[a-zA-Z_][\\w]*" },
    { name: "keyword.control.permit.cedar", match: "\\bpermit\\b" },
    { name: "keyword.control.forbid.cedar", match: "\\bforbid\\b" },
    {
      name: "keyword.control.cedar",
      match: "\\b(when|unless|in|has|like|is|if|then|else|namespace|entity|action|appliesTo|tags|type)\\b",
    },
    { name: "variable.language.cedar", match: "\\b(principal|resource|context)\\b" },
    { name: "constant.language.cedar", match: "\\b(true|false)\\b" },
    { name: "constant.numeric.cedar", match: "\\b[0-9]+\\b" },
    { name: "entity.name.type.cedar", match: "\\b[A-Z][\\w]*(?:::[A-Z][\\w]*)*\\b" },
    { name: "entity.name.function.cedar", match: "\\b[a-zA-Z_][\\w]*(?=\\s*\\()" },
    { name: "keyword.operator.cedar", match: "&&|\\|\\||==|!=|<=|>=|[!<>+*=-]" },
  ],
};

const theme: ThemeRegistration = {
  name: "orderdesk",
  type: "light",
  colors: { "editor.foreground": "var(--foreground)", "editor.background": "var(--code)" },
  tokenColors: [
    { scope: "comment", settings: { foreground: "var(--muted-foreground)", fontStyle: "italic" } },
    { scope: ["keyword", "storage", "variable.language"], settings: { foreground: "var(--code-keyword)" } },
    { scope: ["string", "constant.character"], settings: { foreground: "var(--code-string)" } },
    { scope: ["constant.numeric", "constant.language"], settings: { foreground: "var(--code-keyword)" } },
    { scope: ["entity.name.function", "support.function", "entity.name.type", "support.type"], settings: { foreground: "var(--code-type)" } },
    { scope: "keyword.control.permit.cedar", settings: { foreground: "var(--permit)", fontStyle: "bold" } },
    { scope: "keyword.control.forbid.cedar", settings: { foreground: "var(--forbid)", fontStyle: "bold" } },
  ],
};

let highlighter: ReturnType<typeof createHighlighterCore> | undefined;

export async function highlightCode(code: string, language: CodeLanguage) {
  highlighter ??= createHighlighterCore({
    themes: [theme],
    langs: [cedar, import("shiki/langs/typescript.mjs")],
    engine: createJavaScriptRegexEngine(),
  }).catch((error: unknown) => {
    highlighter = undefined;
    throw error;
  });
  return (await highlighter).codeToTokens(code, { lang: language, theme: "orderdesk" }).tokens;
}
