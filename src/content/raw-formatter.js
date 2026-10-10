/** Raw-page formatter: on plain-text responses (JSON, JS, CSS, XML, YAML, ...) shows a floating "Format <lang> ▾" split button that pretty-prints (or reverts) the page with bundled Prettier, plus wrap / copy / download actions. */
(function () {
  const api = globalThis.UrlPorterFormat;
  if (!api || !document.body || document.contentType === "text/html") return;
  // Chrome renders raw text responses as <body><pre>…</pre></body>.
  const pre = document.body.querySelector(":scope > pre");
  if (!pre) return;

  const { LANGUAGES, detectLanguage, formatText, markdownToHtmlDocument } = api;
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
  /** Whether long lines soft-wrap. Chrome's raw view wraps by default. @type {boolean} */
  let wrap = true;
  /** Language ids that can be rendered as an HTML preview. @type {string[]} */
  const PREVIEWABLE = ["markdown", "mdx"];
  /** Whether the rendered Markdown preview replaces the <pre>. @type {boolean} */
  let preview = false;
  /** Whether the page uses the dark theme; starts from the OS preference. @type {boolean} */
  let dark = !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  // Preview renders in a script-less sandboxed iframe so markup in the page text can never run in the page origin.
  const previewFrame = document.createElement("iframe");
  previewFrame.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
  // Pinned to the viewport (and page overflow hidden while shown) so only one scrollbar appears: the frame's, at the window edge.
  previewFrame.style.cssText =
    "display:none;position:fixed;inset:0;border:0;width:100%;height:100%;background:#fff;";
  document.body.appendChild(previewFrame);

  // Hide Chrome's own JSON viewer chrome (the "Pretty-print" checkbox + its formatted pane, Chrome 131+);
  // it's injected as body siblings of the raw <pre>, so keep only the <pre> visible.
  for (const el of document.body.children) {
    if (el !== pre) /** @type {HTMLElement} */ (el).style.display = "none";
  }
  pre.style.display = "block";
  // Fixed box model / size so formatted output lines up regardless of Chrome's default <pre> styling.
  pre.style.padding = "0";
  pre.style.margin = "0";
  pre.style.fontSize = "1rem";

  /** Apply wrap + font styles to the <pre>; formatted output is always monospace. @returns {void} */
  function applyPreStyle() {
    document.body.style.background = dark ? "#1e1e1e" : "#fff";
    document.body.style.color = dark ? "#d4d4d4" : "#000";
    // The sandboxed preview can't be restyled from here, so invert it (hue-rotate keeps colors natural).
    previewFrame.style.filter = dark ? "invert(1) hue-rotate(180deg)" : "";
    pre.style.whiteSpace = wrap ? "pre-wrap" : "pre";
    pre.style.overflowWrap = wrap ? "anywhere" : "normal";
    pre.style.fontFamily = formatted
      ? "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
      : "";
  }

  /**
   * Label for a language id.
   * @param {string} id - Language id.
   * @returns {string} Display label.
   */
  const langLabel = (id) => LANGUAGES.find((l) => l.id === id).label;

  // UI lives in a shadow root so page CSS can't touch it.
  const host = document.createElement("div");
  // user-select:none keeps the button out of Cmd/Ctrl+A and mouse selections of the page content.
  host.style.cssText =
    "position:fixed;top:12px;right:12px;z-index:2147483647;user-select:none;-webkit-user-select:none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host, * { user-select:none; -webkit-user-select:none; }
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
      .menu hr { border:0; border-top:1px solid #ddd; margin:2px 0; }
      .err { color:#c62828; background:#fff; padding:2px 6px; margin-top:2px; font:11px system-ui,sans-serif; max-width:320px; border-radius:4px; }
      .toast { position:fixed; bottom:16px; left:50%; transform:translateX(-50%); background:rgba(33,33,33,.92); color:#fff; padding:6px 12px; border-radius:4px; font:12px system-ui,sans-serif; box-shadow:0 1px 4px rgba(0,0,0,.3); pointer-events:none; white-space:nowrap; }
    </style>
    <div class="wrap"><button class="main"></button><button class="caret" title="Format, wrap, copy, download, or choose syntax">&#9662;</button><div class="menu"></div></div>
    <div class="err" hidden></div>
    <div class="toast" hidden></div>`;
  /** @type {HTMLButtonElement} */
  const mainBtn = root.querySelector(".main");
  /** @type {HTMLButtonElement} */
  const caretBtn = root.querySelector(".caret");
  /** @type {HTMLDivElement} */
  const menu = root.querySelector(".menu");
  /** @type {HTMLDivElement} */
  const errBox = root.querySelector(".err");
  /** @type {HTMLDivElement} */
  const toastBox = root.querySelector(".toast");
  /** How long a toast stays visible. @type {number} */
  const TOAST_MS = 2000;
  /** Pending hide timer for the current toast. @type {ReturnType<typeof setTimeout> | undefined} */
  let toastTimer;

  /**
   * Show a short non-selectable status toast at the bottom; replaces any toast already showing.
   * @param {string} message - Text to show.
   * @returns {void}
   */
  function toast(message) {
    clearTimeout(toastTimer);
    toastBox.textContent = message;
    toastBox.hidden = false;
    toastTimer = setTimeout(() => {
      toastBox.hidden = true;
    }, TOAST_MS);
  }

  /** Flip soft wrap and announce the new state. @returns {void} */
  function toggleWrap() {
    wrap = !wrap;
    render();
    toast(`Word wrap ${wrap ? "ON" : "OFF"}`);
  }

  /** Shortcut hints shown next to menu labels. @type {Record<string, string>} */
  const SHORTCUTS = {
    format: "Alt + S / Option + S",
    wrap: "Ctrl + Shift + Enter / Cmd + Shift + Enter",
    copy: "Ctrl + C / Cmd + C",
    download: "Ctrl + S / Cmd + S",
    preview: "Alt + M / Option + M",
    theme: "Shift + Esc",
  };

  /**
   * Build a clickable menu row that closes the menu then runs an action.
   * @param {string} text - Row label.
   * @param {() => void} action - Click handler.
   * @param {string} [className] - Optional CSS class.
   * @returns {HTMLDivElement} The row element.
   */
  function menuItem(text, action, className) {
    const item = document.createElement("div");
    item.textContent = text;
    if (className) item.className = className;
    item.addEventListener("click", () => {
      menu.classList.remove("open");
      action();
    });
    return item;
  }

  /**
   * Prefix a label with a check-mark column (check when on, em-space when off).
   * @param {boolean} on - Toggle state.
   * @param {string} label - Label text.
   * @returns {string} Label with check column.
   */
  const checked = (on, label) => `${on ? "\u2713" : "\u2003"} ${label}`;

  /** Flip dark/light theme and announce it. @returns {void} */
  function toggleTheme() {
    dark = !dark;
    render();
    toast(`${dark ? "Dark" : "Light"} mode`);
  }

  /** Refresh button label and menu selection. @returns {void} */
  function render() {
    // Label stays "Format <syntax>"; clicking while formatted reverts to the original text.
    mainBtn.textContent = `Format ${langLabel(langId)}`;
    mainBtn.title = formatted
      ? "Formatted — click to revert to original"
      : `Format as ${langLabel(langId)}`;
    applyPreStyle();
    const actionItems = [
      menuItem(
        checked(formatted, `Format ${langLabel(langId)} (${SHORTCUTS.format})`),
        toggleFormat,
        "format",
      ),
      menuItem(checked(wrap, `Wrap lines (${SHORTCUTS.wrap})`), toggleWrap, "wrap"),
      menuItem(checked(dark, `Dark mode (${SHORTCUTS.theme})`), toggleTheme, "theme"),
    ];
    const extraItems = [];
    if (PREVIEWABLE.includes(langId)) {
      const previewItem = document.createElement("div");
      previewItem.className = "preview";
      previewItem.textContent = checked(preview, `Preview Markdown (${SHORTCUTS.preview})`);
      previewItem.addEventListener("click", () => {
        menu.classList.remove("open");
        togglePreview();
      });
      extraItems.push(previewItem);
    }
    menu.replaceChildren(
      ...actionItems,
      ...extraItems,
      menuItem(checked(false, `Copy to clipboard (${SHORTCUTS.copy})`), copyAll, "copy"),
      menuItem(checked(false, `Download (${SHORTCUTS.download})`), download, "download"),
      document.createElement("hr"),
      ...LANGUAGES.map((l) => {
        const item = document.createElement("div");
        item.textContent = l.label;
        if (l.id === langId) item.className = "sel";
        item.addEventListener("click", () => {
          langId = l.id;
          if (!PREVIEWABLE.includes(langId)) setPreview(false);
          menu.classList.remove("open");
          applyFormat();
        });
        return item;
      }),
    );
  }

  /**
   * Show or hide the rendered preview in place of the <pre>.
   * @param {boolean} on - Whether the preview is visible.
   * @returns {void}
   */
  function setPreview(on) {
    preview = on;
    previewFrame.style.display = on ? "block" : "none";
    pre.style.display = on ? "none" : "block";
    document.documentElement.style.overflow = on ? "hidden" : "";
  }

  /** Flip the Markdown preview on/off and announce it. @returns {Promise<void>} */
  async function togglePreview() {
    if (preview) {
      setPreview(false);
      toast("Markdown preview OFF");
      render();
      return;
    }
    try {
      previewFrame.srcdoc = await markdownToHtmlDocument(original);
      setPreview(true);
      toast("Markdown preview ON");
    } catch (e) {
      console.warn("url-porter: markdown preview failed", e);
      toast("Could not preview Markdown");
    }
    render();
  }

  /** Format page text with the current language; show parse errors inline. @returns {Promise<void>} */
  async function applyFormat() {
    errBox.hidden = true;
    setPreview(false);
    try {
      pre.textContent = await formatText(original, langId);
      formatted = true;
      toast(`Content formatted as ${langLabel(langId)}`);
    } catch (e) {
      pre.textContent = original;
      formatted = false;
      errBox.textContent = `${langLabel(langId)}: ${String(e?.message || e).split("\n")[0]}`;
      errBox.hidden = false;
      toast(`Could not format as ${langLabel(langId)}`);
    }
    render();
  }

  /** Revert to the original unformatted text and announce it. @returns {void} */
  function revertFormat() {
    errBox.hidden = true;
    setPreview(false);
    pre.textContent = original;
    formatted = false;
    toast("Reverted to original (unformatted)");
    render();
  }

  /** Format if showing original text, otherwise revert to original. @returns {Promise<void>} */
  async function toggleFormat() {
    if (formatted) revertFormat();
    else await applyFormat();
  }

  /**
   * File name for downloads: last URL path segment, else `content.txt`.
   * @returns {string} Download file name.
   */
  function downloadName() {
    const last = decodeURIComponent(location.pathname.split("/").pop() || "");
    return last || "content.txt";
  }

  /** Download the displayed text as-is (formatted if formatted, original otherwise). @returns {void} */
  function download() {
    const blob = new Blob([pre.textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    toast(`Downloaded ${formatted ? "formatted" : "original"} content as ${a.download}`);
  }

  mainBtn.addEventListener("click", () => toggleFormat());
  caretBtn.addEventListener("click", () => menu.classList.toggle("open"));

  /**
   * Copy the whole displayed content (raw or formatted) verbatim — textContent keeps every space and newline.
   * @returns {void}
   */
  function copyAll() {
    navigator.clipboard
      .writeText(pre.textContent)
      .then(() => toast("All content copied to clipboard"))
      .catch((err) => {
        console.warn("url-porter: copy failed", err);
        toast("Copy failed");
      });
  }

  // Native copy of a selection: write plain text only, so rich-text paste targets can't collapse the
  // <pre>'s indentation (HTML clipboard payloads drop white-space:pre when pasted).
  document.addEventListener("copy", (e) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !pre.contains(sel.anchorNode)) return;
    e.clipboardData.setData("text/plain", sel.toString());
    e.preventDefault();
  });

  // Keyboard shortcuts (only registered on pages we can format):
  // - Cmd/Ctrl+Shift+Enter: toggle soft wrap.
  // - Cmd/Ctrl+S: download the displayed content.
  // - Alt+S: toggle format (format / revert to original).
  // - Alt+M: toggle Markdown preview (Markdown/MDX only). Shift+Escape: toggle dark/light mode.
  // - Cmd/Ctrl+C or Alt+C: copy the entire content (unless the user selected part of it).
  // e.code is used because macOS Option+letter yields a symbol in e.key.
  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Enter" && e.shiftKey && !e.altKey && mod) {
      e.preventDefault();
      toggleWrap();
      return;
    }
    if (e.key === "Escape" && e.shiftKey && !mod && !e.altKey) {
      e.preventDefault();
      toggleTheme();
      return;
    }
    if (e.shiftKey || !(mod || e.altKey) || (mod && e.altKey)) return;
    if (e.code === "KeyS") {
      e.preventDefault();
      if (mod) download();
      else toggleFormat();
      return;
    }
    if (e.altKey && !mod && e.code === "KeyM" && PREVIEWABLE.includes(langId)) {
      e.preventDefault();
      togglePreview();
      return;
    }
    if (e.code === "KeyC") {
      const sel = String(window.getSelection() || "");
      const partial = mod && sel !== "" && sel !== pre.textContent;
      if (partial) return; // keep native copy of a partial selection
      e.preventDefault();
      copyAll();
    }
  });
  render();
  document.documentElement.appendChild(host);
})();
