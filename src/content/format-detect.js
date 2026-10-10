/** Language catalog, detection, and shared format / Markdown-render helpers for the raw-page formatter and the selection viewer page. Classic script: exposes `globalThis.UrlPorterFormat`. */
/* global chrome */
(function () {
  /**
   * Supported languages. `parser` + `plugins` drive Prettier standalone; `xml` uses the built-in formatter.
   * @type {Array<{id: string, label: string, parser: string, plugins: string[]}>}
   */
  const LANGUAGES = [
    // One entry for JSON / JSON5: Prettier's json parser accepts JSON5 input (comments, unquoted keys, trailing commas).
    { id: "json", label: "JSON/JSON5", parser: "json", plugins: ["babel", "estree"] },
    // One entry for JS / TS / JSX / TSX: Prettier's typescript parser accepts all four.
    { id: "js", label: "JS/TS", parser: "typescript", plugins: ["typescript", "estree"] },
    { id: "flow", label: "Flow", parser: "flow", plugins: ["flow", "estree"] },
    { id: "css", label: "CSS", parser: "css", plugins: ["postcss"] },
    { id: "scss", label: "SCSS", parser: "scss", plugins: ["postcss"] },
    { id: "less", label: "Less", parser: "less", plugins: ["postcss"] },
    { id: "html", label: "HTML", parser: "html", plugins: ["html", "postcss", "babel", "estree"] },
    { id: "vue", label: "Vue", parser: "vue", plugins: ["html", "postcss", "babel", "estree"] },
    {
      id: "angular",
      label: "Angular",
      parser: "angular",
      plugins: ["angular", "html", "postcss", "babel", "estree"],
    },
    { id: "xml", label: "XML", parser: "xml", plugins: [] },
    { id: "yaml", label: "YAML", parser: "yaml", plugins: ["yaml"] },
    { id: "markdown", label: "Markdown", parser: "markdown", plugins: ["markdown"] },
    { id: "mdx", label: "MDX", parser: "mdx", plugins: ["markdown"] },
    { id: "graphql", label: "GraphQL", parser: "graphql", plugins: ["graphql"] },
    { id: "handlebars", label: "Handlebars", parser: "glimmer", plugins: ["glimmer"] },
  ];

  /** Content-type pattern → language id. First match wins; generic types (text/plain) match nothing. @type {Array<[RegExp, string]>} */
  const CONTENT_TYPE_RULES = [
    [/[/+]json5?$/, "json"],
    [/typescript|javascript|ecmascript|jsx/, "js"],
    [/^text\/css$/, "css"],
    [/scss/, "scss"],
    [/less/, "less"],
    [/[/+]xml$/, "xml"],
    [/yaml|yml/, "yaml"],
    [/markdown/, "markdown"],
    [/graphql/, "graphql"],
    [/^text\/html$/, "html"],
  ];

  /** File extension → language id. @type {Record<string, string>} */
  const EXTENSIONS = {
    json: "json",
    jsonc: "json",
    map: "json",
    har: "json",
    geojson: "json",
    webmanifest: "json",
    json5: "json",
    js: "js",
    mjs: "js",
    cjs: "js",
    jsx: "js",
    ts: "js",
    mts: "js",
    cts: "js",
    tsx: "js",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    htm: "html",
    xhtml: "html",
    vue: "vue",
    xml: "xml",
    svg: "xml",
    rss: "xml",
    atom: "xml",
    xsd: "xml",
    xsl: "xml",
    wsdl: "xml",
    plist: "xml",
    csproj: "xml",
    yml: "yaml",
    yaml: "yaml",
    md: "markdown",
    markdown: "markdown",
    mdx: "mdx",
    graphql: "graphql",
    gql: "graphql",
    hbs: "handlebars",
    handlebars: "handlebars",
  };

  /**
   * Language from a Content-Type value; generic types (text/plain, octet-stream) yield null.
   * @param {string} [contentType] - e.g. "application/json; charset=utf-8".
   * @returns {string|null} Language id or null.
   */
  function fromContentType(contentType) {
    const ct = String(contentType || "")
      .toLowerCase()
      .split(";")[0]
      .trim();
    if (!ct) return null;
    const rule = CONTENT_TYPE_RULES.find(([re]) => re.test(ct));
    return rule ? rule[1] : null;
  }

  /**
   * Language from the URL path extension (query string ignored).
   * @param {string} [url] - Full page URL.
   * @returns {string|null} Language id or null.
   */
  function fromUrl(url) {
    let path;
    try {
      path = new URL(String(url)).pathname;
    } catch {
      return null;
    }
    const match = /\.([a-z0-9]+)$/i.exec(path);
    return match ? EXTENSIONS[match[1].toLowerCase()] || null : null;
  }

  /**
   * Best-effort language guess from the text itself.
   * @param {string} [text] - Raw content.
   * @returns {string|null} Language id or null when nothing looks recognizable.
   */
  function fromContent(text) {
    const t = String(text || "").trim();
    if (!t) return null;
    if (/^[[{]/.test(t)) {
      try {
        JSON.parse(t);
        return "json";
      } catch {
        // Not strict JSON; keep sniffing.
      }
    }
    if (/^<\?xml\b/i.test(t)) return "xml";
    if (/^<!doctype html|^<html\b/i.test(t) || /<(head|body|div|script|span|p)\b[^>]*>/i.test(t)) {
      return "html";
    }
    if (/^<[A-Za-z_][\w:.-]*[\s>/]/.test(t)) return "xml";
    if (/^(query|mutation|subscription|fragment)\b[\s\S]*\{/.test(t)) return "graphql";
    if (
      /\b(interface|type)\s+\w+\s*(=|\{)|:\s*(string|number|boolean|any|unknown)\b|\bimport\s+type\b|\bas\s+const\b/.test(
        t,
      )
    ) {
      return "js";
    }
    if (/\b(function|const|let|var|import|export)\b|=>|\brequire\(/.test(t)) return "js";
    if (/^[.#@:\w\-[\]*,>\s]+\{[^{}]*:[^{}]*\}/.test(t)) return "css";
    if (/^#{1,6}\s/m.test(t)) return "markdown";
    if (/^---\s*$|^[\w"'-]+:\s/m.test(t) && !/[{};]\s*$/m.test(t)) return "yaml";
    if (/^[[{]/.test(t)) return "json";
    return null;
  }

  /**
   * Pick the best language: response content type, then URL extension, then content sniffing.
   * @param {{contentType?: string, url?: string, text?: string}} [input] - Page signals.
   * @returns {string|null} Language id or null when unknown.
   */
  function detectLanguage({ contentType, url, text } = {}) {
    return fromContentType(contentType) || fromUrl(url) || fromContent(text);
  }

  /**
   * Whether text is a real JSON blob: strict JSON.parse succeeds and yields an object or array
   * (bare strings / numbers / booleans don't count — they are just words).
   * @param {string} [text] - Candidate text.
   * @returns {boolean} True for a JSON object or array.
   */
  function isJsonBlob(text) {
    const t = String(text || "").trim();
    if (!/^[[{]/.test(t)) return false;
    try {
      const value = JSON.parse(t);
      return typeof value === "object" && value !== null;
    } catch {
      return false;
    }
  }

  /** Markdown block markers that alone make text Markdown (heading, fenced code, table separator row). @type {RegExp[]} */
  const MARKDOWN_STRONG = [
    /^#{1,6}\s+\S/m,
    /^\s*(```|~~~)/m,
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m,
  ];

  /** Weaker Markdown markers; at least two distinct ones are needed. @type {RegExp[]} */
  const MARKDOWN_WEAK = [
    /^\s*([-*+]|\d+[.)])\s+\S[^\n]*\n\s*([-*+]|\d+[.)])\s+\S/m, // a list of 2+ items
    /\[[^\]\n]+\]\([^)\s]+\)/, // [link](url)
    /^>\s/m, // blockquote
    /(\*\*|__)[^*_\n]+\1/, // bold
    /`[^`\n]+`/, // inline code
    /^\s*- \[[ xX]\]\s/m, // task list
  ];

  /**
   * Whether text plausibly is real Markdown, not prose that happens to contain a `*`.
   * Needs one strong block marker (heading, code fence, table) or two distinct weak markers. JSON never counts.
   * @param {string} [text] - Candidate text.
   * @returns {boolean} True when the text reads as Markdown.
   */
  function isMarkdownBlob(text) {
    const t = String(text || "").trim();
    if (!t || isJsonBlob(t)) return false;
    if (MARKDOWN_STRONG.some((re) => re.test(t))) return true;
    return MARKDOWN_WEAK.filter((re) => re.test(t)).length >= 2;
  }

  /** Language id → preview kind its toolbar toggle (Alt+M) opens. @type {Record<string, "markdown"|"json">} */
  const PREVIEW_KINDS = { markdown: "markdown", mdx: "markdown", json: "json" };

  /**
   * Preview kind for a selected syntax; the toolbar trusts the user's syntax choice, no content check.
   * @param {string} langId - Language id.
   * @returns {"markdown"|"json"|null} Preview kind, or null when the syntax has no preview.
   */
  function previewKind(langId) {
    return PREVIEW_KINDS[langId] || null;
  }

  /**
   * Minimal XML pretty-printer (Prettier core ships no XML parser). Indents elements by 2 spaces; leaf text stays inline.
   * @param {string} xml - Raw XML.
   * @returns {string} Indented XML ending with a newline.
   */
  function formatXml(xml) {
    const tokens =
      String(xml)
        .trim()
        .replace(/>\s+</g, "><")
        .match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || [];
    const lines = [];
    let depth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const isClose = tok.startsWith("</");
      const isOpen = !isClose && /^<[^!?]/.test(tok) && !tok.endsWith("/>");
      if (isClose) {
        depth = Math.max(0, depth - 1);
        lines.push("  ".repeat(depth) + tok);
        continue;
      }
      const pad = "  ".repeat(depth);
      if (!isOpen) {
        lines.push(pad + tok.trim());
        continue;
      }
      const next = tokens[i + 1];
      const after = tokens[i + 2];
      if (next && !next.startsWith("<") && after && after.startsWith("</")) {
        lines.push(pad + tok + next.trim() + after);
        i += 2;
        continue;
      }
      lines.push(pad + tok);
      depth++;
    }
    return lines.join("\n") + "\n";
  }

  /** Path of the vendored Prettier ESM bundles inside the extension. @type {string} */
  const PRETTIER_BASE = "vendor/prettier/";
  /** Path of the vendored marked ESM bundle inside the extension. @type {string} */
  const MARKED_PATH = "vendor/marked/marked.esm.js";

  /**
   * Lazily import Prettier standalone plus the plugins a language needs.
   * @param {string[]} pluginNames - Plugin file stems under vendor/prettier/plugins/.
   * @returns {Promise<{prettier: any, plugins: any[]}>} Loaded modules.
   */
  async function loadPrettier(pluginNames) {
    const url = (p) => chrome.runtime.getURL(PRETTIER_BASE + p);
    const [prettier, ...plugins] = await Promise.all([
      import(url("standalone.mjs")),
      ...pluginNames.map((n) => import(url(`plugins/${n}.mjs`))),
    ]);
    return { prettier, plugins: plugins.map((m) => m.default || m) };
  }

  /**
   * Format text for one language.
   * @param {string} text - Raw content.
   * @param {string} id - Language id from LANGUAGES.
   * @returns {Promise<string>} Formatted text.
   * @throws {Error} When the parser rejects the input or the Prettier bundle cannot load.
   */
  async function formatText(text, id) {
    const lang = LANGUAGES.find((l) => l.id === id);
    if (lang.id === "xml") return formatXml(text);
    if (lang.id === "json") {
      // Prettier keeps short objects on one line; always expand strict JSON like a JSON viewer.
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // Not strict JSON (comments, trailing commas); let Prettier try.
      }
    }
    const { prettier, plugins } = await loadPrettier(lang.plugins);
    return prettier.format(text, { parser: lang.parser, plugins, printWidth: 100 });
  }

  /** Light Markdown colors: black on white, standard blue links. @type {string} */
  const MD_LIGHT =
    "--fg:#000;--bg:#fff;--link:#0645ad;--visited:#5a3696;--muted:#555;--code-bg:#f2f2f2;--border:#ccc;";
  /** Dark Markdown colors: white on black, light blue links. @type {string} */
  const MD_DARK =
    "--fg:#fff;--bg:#000;--link:#8ab4f8;--visited:#c58af9;--muted:#aaa;--code-bg:#1a1a1a;--border:#444;";

  /**
   * Render Markdown to a standalone styled HTML document with vendored marked (GFM).
   * Colors follow the OS theme (prefers-color-scheme) unless `theme` pins one.
   * Callers must load it into a script-less sandboxed iframe (`srcdoc`) — the output is untrusted markup.
   * @param {string} text - Markdown source.
   * @param {"light"|"dark"} [theme] - Force a theme (the toolbar's Shift+Esc toggle); omit to follow the OS.
   * @returns {Promise<string>} Full HTML document.
   * @throws {Error} When the marked bundle cannot load.
   */
  async function markdownToHtmlDocument(text, theme) {
    const { marked } = await import(chrome.runtime.getURL(MARKED_PATH));
    const body = marked.parse(text, { gfm: true });
    const vars =
      theme === "dark"
        ? `:root{${MD_DARK}color-scheme:dark;}`
        : theme === "light"
          ? `:root{${MD_LIGHT}color-scheme:light;}`
          : `:root{${MD_LIGHT}color-scheme:light dark;}@media (prefers-color-scheme: dark){:root{${MD_DARK}}}`;
    return `<!doctype html><meta charset="utf-8"><base target="_blank"><style>${vars}
      html{background:var(--bg);color:var(--fg);}
      body{font:16px/1.6 system-ui,sans-serif;max-width:860px;margin:0 auto;padding:48px 24px;}
      a{color:var(--link);text-decoration:underline;}a:visited{color:var(--visited);}
      pre{background:var(--code-bg);padding:12px;border-radius:6px;overflow:auto;}
      code{background:var(--code-bg);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:85%;}
      table{border-collapse:collapse;}th,td{border:1px solid var(--border);padding:4px 10px;}
      hr{border:0;border-top:1px solid var(--border);}
      img{max-width:100%;}blockquote{color:var(--muted);border-left:4px solid var(--border);margin:0;padding:0 12px;}
    </style>${body}`;
  }

  globalThis.UrlPorterFormat = {
    LANGUAGES,
    fromContentType,
    fromUrl,
    fromContent,
    detectLanguage,
    isJsonBlob,
    isMarkdownBlob,
    previewKind,
    formatXml,
    formatText,
    markdownToHtmlDocument,
  };
})();
