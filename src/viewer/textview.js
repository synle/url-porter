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

  if (params.get("mode") === "markdown") {
    document.title = "Markdown Preview";
    try {
      preview.srcdoc = await markdownToHtmlDocument(text);
      preview.hidden = false;
    } catch (e) {
      showError(`Could not render Markdown: ${String(e?.message || e)}`);
      out.textContent = text;
      out.hidden = false;
    }
    return;
  }

  const lang = LANGUAGES.find((l) => l.id === params.get("lang"));
  out.hidden = false;
  if (!lang) {
    showError(`Unknown syntax "${params.get("lang")}"; showing the selection as-is.`);
    out.textContent = text;
    return;
  }
  document.title = `Formatted ${lang.label}`;
  try {
    out.textContent = await formatText(text, lang.id);
  } catch (e) {
    showError(`${lang.label}: ${String(e?.message || e).split("\n")[0]}`);
    out.textContent = text;
  }
}

globalThis.UrlPorterViewerReady = renderViewer();
