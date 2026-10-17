/** Viewer page for context-menu selections: formats handed-off text with the chosen syntax. */
/* global chrome */

/**
 * Render the viewer from its query string (`mode`, `lang`, `key` → chrome.storage.session entry).
 * @returns {Promise<void>}
 */
async function renderViewer() {
  const { LANGUAGES, formatText } = globalThis.UrlPorterFormat;
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
   * @param {{langId?: string, formatted?: boolean, preview?: boolean, autoPreview?: boolean}} state - Initial toolbar state.
   * @returns {void}
   */
  const mountToolbar = (state) =>
    globalThis.UrlPorterRawFormatter?.mount(out, {
      original: text,
      previewFrame: preview,
      fileName: "selection.txt",
      ...state,
    });

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
