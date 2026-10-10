/** Viewer page for context-menu selections: renders handed-off text as a Markdown preview or as formatted monospace code. */
/* global chrome */

/**
 * Render the viewer from its query string (`mode`, `lang`, `key` → chrome.storage.session entry).
 * @returns {Promise<void>}
 */
async function renderViewer() {
  const { LANGUAGES, formatText, markdownToHtmlDocument } = globalThis.UrlPorterFormat;
  const params = new URLSearchParams(location.search);
  const key = params.get("key") || "";
  const out = document.getElementById("out");
  const err = document.getElementById("err");
  const preview = /** @type {HTMLIFrameElement} */ (document.getElementById("preview"));

  /**
   * Show an error line above the content.
   * @param {string} message - Error text.
   * @returns {void}
   */
  const showError = (message) => {
    err.textContent = message;
    err.hidden = false;
  };

  const stored = await chrome.storage.session.get(key);
  const text = stored[key];
  if (typeof text !== "string") {
    showError("Selection is no longer available (the browser was restarted or it was pruned).");
    return;
  }

  /**
   * Attach the shared Format toolbar (menu + keyboard shortcuts) for the shown content.
   * @param {{langId?: string, formatted?: boolean, preview?: boolean}} state - Initial toolbar state.
   * @returns {void}
   */
  const mountToolbar = (state) =>
    globalThis.UrlPorterRawFormatter?.mount(out, {
      original: text,
      previewFrame: preview,
      fileName: "selection.txt",
      ...state,
    });

  if (params.get("mode") === "markdown") {
    document.title = "Markdown Preview";
    out.textContent = text;
    try {
      preview.srcdoc = await markdownToHtmlDocument(text);
      preview.hidden = false;
      mountToolbar({ langId: "markdown", preview: true });
    } catch (e) {
      showError(`Could not render Markdown: ${String(e?.message || e)}`);
      out.hidden = false;
      mountToolbar({ langId: "markdown" });
    }
    return;
  }

  const lang = LANGUAGES.find((l) => l.id === params.get("lang"));
  out.hidden = false;
  if (!lang) {
    showError(`Unknown syntax "${params.get("lang")}"; showing the selection as-is.`);
    out.textContent = text;
    mountToolbar({});
    return;
  }
  document.title = `Formatted ${lang.label}`;
  try {
    out.textContent = await formatText(text, lang.id);
    mountToolbar({ langId: lang.id, formatted: true });
  } catch (e) {
    showError(`${lang.label}: ${String(e?.message || e).split("\n")[0]}`);
    out.textContent = text;
    mountToolbar({ langId: lang.id });
  }
}

globalThis.UrlPorterViewerReady = renderViewer();
