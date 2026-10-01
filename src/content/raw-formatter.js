/** Raw-page formatter: on plain-text responses (JSON, JS, CSS, XML, YAML, ...) shows a floating "Format <lang> ▾" split button that pretty-prints the page with bundled Prettier. */
/* global chrome */
(function () {
  const api = globalThis.UrlPorterFormat;
  if (!api || !document.body || document.contentType === "text/html") return;
  // Chrome renders raw text responses as <body><pre>…</pre></body>.
  const pre = document.body.querySelector(":scope > pre");
  if (!pre) return;

  const { LANGUAGES, detectLanguage, formatXml } = api;
  /** Path of the vendored Prettier ESM bundles inside the extension. @type {string} */
  const VENDOR_BASE = "vendor/prettier/";
  /** Language used when detection finds nothing. @type {string} */
  const FALLBACK_LANGUAGE = "json";
  const original = pre.textContent;
  let langId =
    detectLanguage({
      contentType: document.contentType,
      url: location.href,
      text: original,
    }) || FALLBACK_LANGUAGE;
  let formatted = false;

  /**
   * Label for a language id.
   * @param {string} id - Language id.
   * @returns {string} Display label.
   */
  const langLabel = (id) => LANGUAGES.find((l) => l.id === id).label;

  /**
   * Lazily import Prettier standalone plus the plugins a language needs.
   * @param {string[]} pluginNames - Plugin file stems under vendor/prettier/plugins/.
   * @returns {Promise<{prettier: any, plugins: any[]}>} Loaded modules.
   */
  async function loadPrettier(pluginNames) {
    const url = (p) => chrome.runtime.getURL(VENDOR_BASE + p);
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
   * @throws {Error} When the parser rejects the input.
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
    return prettier.format(text, {
      parser: lang.parser,
      plugins,
      printWidth: 100,
    });
  }

  // UI lives in a shadow root so page CSS can't touch it.
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;top:8px;right:12px;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      .wrap { display:flex; font:12px system-ui,sans-serif; box-shadow:0 1px 4px rgba(0,0,0,.3); border-radius:4px; position:relative; }
      button { font:inherit; border:0; background:#1976d2; color:#fff; padding:4px 8px; cursor:pointer; }
      button:hover { background:#1565c0; }
      .main { border-radius:4px 0 0 4px; }
      .caret { border-left:1px solid rgba(255,255,255,.4); border-radius:0 4px 4px 0; padding:4px 6px; }
      .menu { display:none; position:absolute; top:100%; right:0; margin-top:2px; background:#fff; color:#222; border:1px solid #ccc; border-radius:4px; max-height:70vh; overflow:auto; min-width:120px; font:12px system-ui,sans-serif; }
      .menu.open { display:block; }
      .menu div { padding:4px 10px; cursor:pointer; white-space:nowrap; }
      .menu div:hover { background:#e3f2fd; }
      .menu div.sel { font-weight:bold; }
      .err { color:#c62828; background:#fff; padding:2px 6px; margin-top:2px; font:11px system-ui,sans-serif; max-width:320px; border-radius:4px; }
    </style>
    <div class="wrap"><button class="main"></button><button class="caret" title="Choose syntax">&#9662;</button><div class="menu"></div></div>
    <div class="err" hidden></div>`;
  /** @type {HTMLButtonElement} */
  const mainBtn = root.querySelector(".main");
  /** @type {HTMLButtonElement} */
  const caretBtn = root.querySelector(".caret");
  /** @type {HTMLDivElement} */
  const menu = root.querySelector(".menu");
  /** @type {HTMLDivElement} */
  const errBox = root.querySelector(".err");

  /** Refresh button label and menu selection. @returns {void} */
  function render() {
    mainBtn.textContent = formatted ? "Raw" : `Format ${langLabel(langId)}`;
    menu.replaceChildren(
      ...LANGUAGES.map((l) => {
        const item = document.createElement("div");
        item.textContent = l.label;
        if (l.id === langId) item.className = "sel";
        item.addEventListener("click", () => {
          langId = l.id;
          menu.classList.remove("open");
          applyFormat();
        });
        return item;
      }),
    );
  }

  /** Format page text with the current language; show parse errors inline. @returns {Promise<void>} */
  async function applyFormat() {
    errBox.hidden = true;
    try {
      pre.textContent = await formatText(original, langId);
      formatted = true;
    } catch (e) {
      pre.textContent = original;
      formatted = false;
      errBox.textContent = `${langLabel(langId)}: ${String(e?.message || e).split("\n")[0]}`;
      errBox.hidden = false;
    }
    render();
  }

  mainBtn.addEventListener("click", () => {
    if (!formatted) return applyFormat();
    pre.textContent = original;
    formatted = false;
    render();
  });
  caretBtn.addEventListener("click", () => menu.classList.toggle("open"));
  render();
  document.documentElement.appendChild(host);
})();
