/** JSON tree page: framed by the Format toolbar's JSON preview; renders posted JSON text with the vendored @andypf/json-viewer (collapsible tree + search toolbar). */

/** postMessage type the toolbar sends to this frame. @type {string} */
const JSON_VIEW_MESSAGE = "url-porter:json-view";

/**
 * Render one posted message into the tree.
 * Data is always set as a parsed object via the `.data` property — never as a string,
 * because the component treats a string `data` as a URL and fetches it.
 * @param {{text?: unknown, dark?: unknown}} msg - Posted payload; `dark` is a boolean (default: OS theme).
 * @returns {void}
 */
function renderJsonView(msg) {
  const tree = document.getElementById("tree");
  const err = document.getElementById("err");
  // Toolbar sends its theme; otherwise follow the OS.
  const dark =
    typeof msg.dark === "boolean"
      ? msg.dark
      : !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.body.classList.toggle("dark", dark);
  tree.setAttribute("theme", dark ? "default-dark" : "default-light");
  if (typeof msg.text !== "string") return;
  let value;
  try {
    value = JSON.parse(msg.text);
  } catch (e) {
    err.textContent = `Not valid JSON: ${String(e?.message || e)}`;
    err.hidden = false;
    tree.hidden = true;
    return;
  }
  err.hidden = true;
  tree.hidden = false;
  tree.data = typeof value === "object" && value !== null ? value : [value];
}

window.addEventListener("message", (e) => {
  const msg = e.data;
  if (!msg || typeof msg !== "object" || msg.type !== JSON_VIEW_MESSAGE) return;
  renderJsonView(msg);
});

// Pick the OS theme before any content arrives.
renderJsonView({});

// Tell the parent the listener is live so it can post the content.
window.parent.postMessage({ type: `${JSON_VIEW_MESSAGE}:ready` }, "*");
