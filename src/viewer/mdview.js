/** Markdown preview page: framed (sandboxed) by the Format toolbar; shows posted, pre-rendered Markdown HTML and copies a code block or inline code on double-click. */

/** postMessage type shared with raw-formatter.js. @type {string} */
const MD_VIEW_MESSAGE = "url-porter:md-view";

/** How long the "Copied" toast stays visible. @type {number} */
const MD_TOAST_MS = 1500;

/**
 * Replace the page content with a rendered Markdown document.
 * Parsed with DOMParser, so scripts in it never run; the extension CSP also blocks inline handlers.
 * @param {string} html - Full HTML document from markdownToHtmlDocument.
 * @returns {void}
 */
function renderMarkdownView(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  document.head.querySelectorAll("style[data-md]").forEach((el) => el.remove());
  for (const style of doc.querySelectorAll("style")) {
    style.dataset.md = "";
    document.head.append(style);
  }
  document.body.replaceChildren(...doc.body.childNodes);
}

/**
 * Show a short toast at the bottom of the preview.
 * @param {string} message - Text to show.
 * @returns {void}
 */
function mdToast(message) {
  let box = document.querySelector(".url-porter-toast");
  if (!box) {
    box = document.createElement("div");
    box.className = "url-porter-toast";
    document.documentElement.append(box);
  }
  box.textContent = message;
  box.hidden = false;
  clearTimeout(mdToast.timer);
  mdToast.timer = setTimeout(() => {
    box.hidden = true;
  }, MD_TOAST_MS);
}

/**
 * Copy text: async Clipboard API first, then execCommand on the current selection
 * (the sandboxed frame may lack the clipboard-write permission policy).
 * @param {string} text - Text to copy.
 * @returns {Promise<boolean>} Whether a copy succeeded.
 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

/**
 * Double-click on a code block (`<pre>`) or inline `<code>`: select all of it and copy it.
 * @param {MouseEvent} e - dblclick event.
 * @returns {Promise<void>}
 */
async function onCodeDoubleClick(e) {
  const target = /** @type {Element} */ (e.target);
  const hit = target?.closest?.("pre, code");
  if (!hit) return;
  const block = hit.closest("pre") || hit;
  const range = document.createRange();
  range.selectNodeContents(block);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const ok = await copyText(block.textContent.replace(/\n$/, ""));
  mdToast(ok ? "Copied to clipboard" : "Copy failed");
}

document.addEventListener("dblclick", onCodeDoubleClick);

window.addEventListener("message", (e) => {
  if (e.source !== window.parent) return;
  const msg = e.data;
  if (!msg || typeof msg !== "object" || msg.type !== MD_VIEW_MESSAGE) return;
  if (typeof msg.html === "string") renderMarkdownView(msg.html);
});

// Tell the parent the listener is live so it can post the content.
window.parent.postMessage({ type: `${MD_VIEW_MESSAGE}:ready` }, "*");
