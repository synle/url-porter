/** Raw-page formatter: on plain-text responses (JSON, JS, CSS, XML, YAML, ...) shows a floating "Format <lang> ▾" split button that pretty-prints (or reverts) the page with bundled Prettier, plus wrap / copy / download actions. */
/* Also exposes `globalThis.UrlPorterRawFormatter.mount` so the selection viewer page reuses the same toolbar + shortcuts. */
(function () {
  /** Language used when detection finds nothing. @type {string} */
  const FALLBACK_LANGUAGE = "json";

  /**
   * Mount the floating toolbar (and its keyboard shortcuts) for a content <pre>.
   * @param {HTMLPreElement} pre - Element showing the content.
   * @param {object} [opts] - Mount options; omit all for a Chrome raw text page.
   * @param {string} [opts.original] - Original text (default: pre's current text).
   * @param {string} [opts.langId] - Selected syntax id (default: detected).
   * @param {boolean} [opts.formatted] - Whether pre already shows formatted text.
   * @param {HTMLIFrameElement} [opts.previewFrame] - Existing sandboxed preview frame to reuse.
   * @param {boolean} [opts.preview] - Whether that frame is already showing a (Markdown) preview.
   * @param {boolean} [opts.autoPreview] - Open the selected syntax's preview right after mounting (e.g. JSON tree).
   * @param {string} [opts.fileName] - Download file name (default: last URL path segment).
   * @returns {void}
   */
  function mount(pre, opts = {}) {
    const rawPage = !opts.previewFrame;
    const { LANGUAGES, detectLanguage, formatText, markdownToHtmlDocument, previewKind } =
      globalThis.UrlPorterFormat;
    const original = opts.original ?? pre.textContent;
    let langId =
      opts.langId ||
      detectLanguage({
        contentType: document.contentType,
        url: location.href,
        text: original,
      }) ||
      FALLBACK_LANGUAGE;
    let formatted = !!opts.formatted;
    /** Whether long lines soft-wrap. Chrome's raw view wraps by default. @type {boolean} */
    let wrap = true;
    /** Toolbar label per preview kind; the selected syntax decides the kind (see previewKind). @type {Record<string, string>} */
    const PREVIEW_LABELS = { markdown: "Preview Markdown", json: "View JSON Tree" };
    /** Toast name per preview kind ("<name> ON/OFF"). @type {Record<string, string>} */
    const PREVIEW_TOASTS = { markdown: "Markdown preview", json: "JSON tree" };
    /** Whether a preview (Markdown render or JSON tree) replaces the <pre>. @type {boolean} */
    let preview = !!opts.preview;
    /** Kind of the preview currently shown; null when hidden. @type {"markdown"|"json"|null} */
    let shownKind = preview ? previewKind(langId) : null;
    /** Extension page that renders the JSON tree; created on first use. @type {HTMLIFrameElement|null} */
    let jsonFrame = null;
    /** Whether the page uses the dark theme; follows the OS preference (Shift+Esc overrides). @type {boolean} */
    let dark = !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    // Preview renders in a script-less sandboxed iframe so markup in the page text can never run in the page origin.
    const previewFrame = opts.previewFrame || document.createElement("iframe");
    if (rawPage) {
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
    }

    /** Apply wrap + font styles to the <pre>; formatted output is always monospace. @returns {void} */
    function applyPreStyle() {
      previewFrame.style.background = dark ? "#000" : "#fff";
      // Plain view: white on black (dark) or black on white (light), nothing fancier.
      document.body.style.background = dark ? "#000" : "#fff";
      document.body.style.color = dark ? "#fff" : "#000";
      postJson({ dark });
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
      .menu div.action { display:grid; grid-template-columns:1.2em auto 1fr; align-items:baseline; column-gap:4px; }
      .menu .kbd { justify-self:end; padding-left:24px; opacity:.55; font-size:11px; }
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
     * Build an action row in two columns: check mark + label on the left, the keyboard shortcut dimmed on the right.
     * @param {boolean} on - Toggle state (check mark shown when true).
     * @param {string} label - Action label.
     * @param {string} shortcut - Shortcut hint from SHORTCUTS.
     * @param {() => void} action - Click handler.
     * @param {string} className - Row CSS class (also identifies the row).
     * @returns {HTMLDivElement} The row element.
     */
    function actionItem(on, label, shortcut, action, className) {
      const item = menuItem("", action, `action ${className}`);
      const check = document.createElement("span");
      check.className = "check";
      check.textContent = on ? "\u2713" : "";
      const text = document.createElement("span");
      text.className = "label";
      text.textContent = label;
      const kbd = document.createElement("span");
      kbd.className = "kbd";
      kbd.textContent = shortcut;
      item.append(check, text, kbd);
      return item;
    }

    /** Flip dark/light theme and announce it. @returns {void} */
    function toggleTheme() {
      setDark(!dark);
      toast(`${dark ? "Dark" : "Light"} mode`);
    }

    /**
     * Apply a theme everywhere: plain view, JSON tree, and (re-rendered) Markdown preview.
     * @param {boolean} on - Whether dark mode is on.
     * @returns {void}
     */
    function setDark(on) {
      dark = on;
      if (shownKind === "markdown") {
        markdownToHtmlDocument(original, dark ? "dark" : "light")
          .then((doc) => {
            previewFrame.srcdoc = doc;
          })
          .catch((e) => console.warn("url-porter: markdown re-theme failed", e));
      }
      render();
    }

    /** Refresh button label and menu selection. @returns {void} */
    function render() {
      // Label stays "Format <syntax>"; clicking while formatted reverts to the original text.
      mainBtn.textContent = `Format ${langLabel(langId)}`;
      mainBtn.title = formatted
        ? "Formatted — click to revert to original"
        : `Format as ${langLabel(langId)}`;
      applyPreStyle();
      const kind = previewKind(langId);
      menu.replaceChildren(
        actionItem(
          formatted,
          `Format ${langLabel(langId)}`,
          SHORTCUTS.format,
          toggleFormat,
          "format",
        ),
        actionItem(wrap, "Wrap lines", SHORTCUTS.wrap, toggleWrap, "wrap"),
        actionItem(dark, "Dark mode", SHORTCUTS.theme, toggleTheme, "theme"),
        ...(kind
          ? [actionItem(preview, PREVIEW_LABELS[kind], SHORTCUTS.preview, togglePreview, "preview")]
          : []),
        actionItem(false, "Copy to clipboard", SHORTCUTS.copy, copyAll, "copy"),
        actionItem(false, "Download", SHORTCUTS.download, download, "download"),
        document.createElement("hr"),
        ...LANGUAGES.map((l) => {
          const item = document.createElement("div");
          item.textContent = l.label;
          if (l.id === langId) item.className = "sel";
          item.addEventListener("click", () => {
            langId = l.id;
            if (previewKind(langId) !== shownKind) setPreview(false);
            menu.classList.remove("open");
            applyFormat();
          });
          return item;
        }),
      );
    }

    /**
     * Show or hide a preview in place of the <pre>.
     * @param {boolean} on - Whether a preview is visible.
     * @param {"markdown"|"json"} [kind] - Which preview to show when `on` (default: Markdown).
     * @returns {void}
     */
    function setPreview(on, kind = "markdown") {
      preview = on;
      shownKind = on ? kind : null;
      previewFrame.style.display = on && kind === "markdown" ? "block" : "none";
      if (jsonFrame) jsonFrame.style.display = on && kind === "json" ? "block" : "none";
      pre.style.display = on ? "none" : "block";
      document.documentElement.style.overflow = on ? "hidden" : "";
    }

    /** postMessage type shared with viewer/jsonview.js. @type {string} */
    const JSON_VIEW_MESSAGE = "url-porter:json-view";
    /** Origin of the extension page inside jsonFrame; messages go only there. @type {string} */
    // String-derived: URL#origin is "null" for non-special schemes in some runtimes.
    const extensionOrigin = chrome.runtime.getURL("").replace(/\/+$/, "");
    /** Last payload for the JSON frame, re-sent once it reports ready. @type {{text?: string, dark: boolean}} */
    let jsonPayload = { dark };
    /** Whether the JSON frame has loaded and is listening. @type {boolean} */
    let jsonReady = false;

    /**
     * Merge into the JSON frame payload and post it if the frame is ready (else it goes on the ready handshake).
     * @param {{text?: string, dark?: boolean}} patch - Fields to update.
     * @returns {void}
     */
    function postJson(patch) {
      jsonPayload = { ...jsonPayload, ...patch };
      dropDetachedJsonFrame();
      if (jsonFrame && jsonReady) {
        jsonFrame.contentWindow.postMessage(
          { type: JSON_VIEW_MESSAGE, ...jsonPayload },
          extensionOrigin,
        );
      }
    }

    /** Forget the JSON frame if something removed it from the page (its window is dead); it is recreated on next use. @returns {void} */
    function dropDetachedJsonFrame() {
      if (jsonFrame && !jsonFrame.isConnected) {
        jsonFrame = null;
        jsonReady = false;
      }
    }

    /**
     * Create the JSON tree frame (extension page viewer/jsonview.html) on first use.
     * Framed rather than inlined because content scripts can't define custom elements in their isolated world.
     * @returns {void}
     */
    function ensureJsonFrame() {
      dropDetachedJsonFrame();
      if (jsonFrame) return;
      jsonFrame = document.createElement("iframe");
      jsonFrame.title = "JSON tree";
      jsonFrame.style.cssText =
        "display:none;position:fixed;inset:0;border:0;width:100%;height:100%;background:transparent;";
      window.addEventListener("message", (e) => {
        if (!jsonFrame || e.source !== jsonFrame.contentWindow) return;
        if (e.data?.type !== `${JSON_VIEW_MESSAGE}:ready`) return;
        jsonReady = true;
        postJson({});
      });
      jsonFrame.src = chrome.runtime.getURL("viewer/jsonview.html");
      document.body.appendChild(jsonFrame);
    }

    /**
     * Flip the preview for the selected syntax on/off and announce it:
     * Markdown/MDX → rendered Markdown, JSON → collapsible JSON tree.
     * @returns {Promise<void>}
     */
    async function togglePreview() {
      const kind = previewKind(langId);
      if (preview || !kind) {
        if (preview) toast(`${PREVIEW_TOASTS[shownKind]} OFF`);
        setPreview(false);
        render();
        return;
      }
      if (kind === "json") {
        ensureJsonFrame();
        postJson({ text: original, dark });
        setPreview(true, "json");
        toast(`${PREVIEW_TOASTS.json} ON`);
        render();
        return;
      }
      try {
        previewFrame.srcdoc = await markdownToHtmlDocument(original, dark ? "dark" : "light");
        setPreview(true, "markdown");
        toast(`${PREVIEW_TOASTS.markdown} ON`);
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
      if (opts.fileName) return opts.fileName;
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
    // - Alt+M: toggle the preview for the selected syntax (Markdown/MDX → rendered, JSON → tree). Shift+Escape: toggle dark/light mode.
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
      if (e.altKey && !mod && e.code === "KeyM" && previewKind(langId)) {
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
    if (opts.preview) setPreview(true, shownKind || "markdown");
    // Follow OS light/dark changes live (Shift+Esc still overrides until the OS flips again).
    window
      .matchMedia?.("(prefers-color-scheme: dark)")
      .addEventListener?.("change", (e) => setDark(e.matches));
    render();
    document.documentElement.appendChild(host);
    if (opts.autoPreview && !preview) togglePreview();
  }

  globalThis.UrlPorterRawFormatter = { mount };

  /** Debounce for selection reports, so dragging a selection doesn't spam the background. @type {number} */
  const SELECTION_REPORT_MS = 150;

  /**
   * Report what the current selection is (real JSON / real Markdown) so the background can show only the
   * matching context-menu preview items. Sends only on change; re-sends on tab focus because menus are global.
   * @returns {void}
   */
  function watchSelectionKind() {
    const { isJsonBlob, isMarkdownBlob } = globalThis.UrlPorterFormat;
    let last = "";
    let timer;
    /** @param {boolean} force - Send even when unchanged (tab regained focus). @returns {void} */
    const report = (force) => {
      const el = document.activeElement;
      const text =
        el && /^(TEXTAREA|INPUT)$/.test(el.tagName) && typeof el.selectionStart === "number"
          ? el.value.slice(el.selectionStart, el.selectionEnd)
          : String(window.getSelection() || "");
      const kind = { json: isJsonBlob(text), markdown: isMarkdownBlob(text) };
      const sig = JSON.stringify(kind);
      if (!force && sig === last) return;
      last = sig;
      try {
        chrome.runtime.sendMessage({ type: "Myevent.selectionKind", ...kind })?.catch?.(() => {});
      } catch {
        // Extension reloaded under this page; the context is gone and nothing can be reported.
      }
    };
    document.addEventListener("selectionchange", () => {
      clearTimeout(timer);
      timer = setTimeout(() => report(false), SELECTION_REPORT_MS);
    });
    window.addEventListener("focus", () => report(true));
  }

  if (globalThis.UrlPorterFormat && typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    watchSelectionKind();
  }

  // Auto-mount only on Chrome raw text responses, rendered as <body><pre>…</pre></body>.
  if (!globalThis.UrlPorterFormat || !document.body || document.contentType === "text/html") return;
  const pre = document.body.querySelector(":scope > pre");
  if (pre) mount(pre);
})();
