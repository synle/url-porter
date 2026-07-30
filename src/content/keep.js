/** Content script for Google Keep — finds note modals and injects a markdown preview button. */
const TAG = "[url-porter]";

/**
 * Convert a markdown string to HTML.
 *
 * @param {string} md - Raw markdown text
 * @returns {string} HTML string
 */
function markdownToHtml(md) {
  let html = md;

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="${lang}">${code.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`;
  });

  // Tables
  html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (table) => {
    const rows = table.trim().split("\n");
    let out = "<table>";
    rows.forEach((row, i) => {
      if (row.replace(/[|\s-]/g, "") === "") return; // separator row
      const tag = i === 0 ? "th" : "td";
      const cells = row
        .split("|")
        .filter((c, j, a) => j > 0 && j < a.length - 1)
        .map((c) => `<${tag}>${c.trim()}</${tag}>`)
        .join("");
      out += `<tr>${cells}</tr>`;
    });
    out += "</table>";
    return out;
  });

  // Headers
  html = html.replace(/^##### (.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Horizontal rules
  html = html.replace(/^---+$/gm, "<hr>");

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Bare URLs
  html = html.replace(/(?<!="|'>)(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');

  // Unordered lists
  html = html.replace(/((?:^[\t ]*[-*] .+$\n?)+)/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((l) => `<li>${l.replace(/^[\t ]*[-*] /, "")}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  // Ordered lists
  html = html.replace(/((?:^[\t ]*\d+\. .+$\n?)+)/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .map((l) => `<li>${l.replace(/^[\t ]*\d+\. /, "")}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  });

  // Paragraphs (double newlines)
  html = html
    .split(/\n{2,}/)
    .map((p) => {
      p = p.trim();
      if (!p || /^<(h[1-5]|ul|ol|table|pre|hr|blockquote)/.test(p)) return p;
      return `<p>${p.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  return html;
}

/**
 * Extract the text content from a Keep note modal, stripping metadata.
 *
 * @param {HTMLElement} modal - The modal DOM element
 * @returns {string} The cleaned note text
 */
function getNoteContent(modal) {
  let text = modal.innerText || "";
  // Strip trailing metadata (Edited date, button labels, etc.)
  text = text.replace(/\n{2,}(Edited .+\n.*|Preview\n.*|Close.*)$/s, "").trim();
  return text;
}

/**
 * Open a new browser tab with a rendered HTML preview of the note's markdown.
 *
 * @param {HTMLElement} modal - The modal DOM element containing the note
 */
function openMarkdownPreview(modal) {
  const md = getNoteContent(modal);
  if (!md) {
    console.log(TAG, "no content found");
    return;
  }
  console.log(TAG, "opening markdown preview");
  const body = markdownToHtml(md);
  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Markdown Preview</title>
    <style>
      /* Global Reset & Base Styles */
      body {
        font-family: "Fira Code", "Courier New", Courier, monospace;
        max-width: 90vw;
        margin: 2rem auto;
        padding: 0 1.25rem;
        background: #1e1e1e;
        color: #d4d4d4;
        line-height: 1.6; /* Added for better readability */
      }

      /* Typography */
      h1,
      h2,
      h3,
      h4,
      h5 {
        color: #f0b132;
        border-bottom: 0.0625rem solid #333;
        padding-bottom: 0.25rem;
        margin: 0;
      }

      p {
        margin-bottom: 1rem;
      }

      a {
        color: #6cb6ff;
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      /* Code Blocks */
      code {
        background: #2d2d2d;
        padding: 0.125rem 0.375rem;
        border-radius: 0.1875rem;
        font-size: 0.875rem; /* Equivalent to 14px */
      }

      pre {
        background: #2d2d2d;
        padding: 1rem;
        border-radius: 0.375rem;
        overflow-x: auto;
      }

      pre code {
        padding: 0;
        background: none;
        font-size: 0.9rem;
      }

      /* Data & Layout Elements */
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 1rem 0;
      }

      th,
      td {
        border: 0.0625rem solid #444;
        padding: 0.5rem 0.75rem;
        text-align: left;
      }

      th {
        background: #2d2d2d;
      }

      hr {
        border: none;
        border-top: 0.0625rem solid #444;
        margin: 1.5rem 0;
      }

      blockquote {
        border-left: 0.1875rem solid #444;
        margin: 1rem 0;
        padding-left: 1rem;
        color: #999;
      }

      ul,
      ol {
        padding-left: 2rem;
        margin: 0 0 1rem 0;
      }

      li {
        margin: 0.5rem 0;
      }
    </style>
  </head>
  <body>${body}</body>
</html>
`;
  const blob = new Blob([html], { type: "text/html" });
  window.open(URL.createObjectURL(blob), "_blank");
}

/**
 * Inject a "Preview" button into a Keep note modal next to the Close button.
 *
 * @param {HTMLElement} modal - The modal DOM element
 */
function injectPreviewButton(modal) {
  if (modal.querySelector(".url-porter-preview-btn")) return;
  const closeBtn = Array.from(modal.querySelectorAll('[role="button"]')).find(
    (b) => b.textContent.trim() === "Close",
  );
  if (!closeBtn) return;
  const btn = document.createElement("div");
  btn.textContent = "Preview";
  btn.className = "url-porter-preview-btn " + closeBtn.className;
  btn.setAttribute("role", "button");
  btn.setAttribute("tabindex", "0");
  btn.style.cssText = closeBtn.style.cssText;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openMarkdownPreview(modal);
  });
  closeBtn.parentElement.insertBefore(btn, closeBtn);
  console.log(TAG, "injected preview button");
}

/**
 * Scan the DOM for fixed-position modals and inject preview buttons into them.
 * @returns {void}
 */
function scan() {
  console.log(TAG, "scanning for modals");
  for (const el of document.body.children) {
    if (el.nodeType !== 1 || el.parentElement !== document.body) continue;
    if (el.classList.contains("url-porter-keep-modal")) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed" || parseInt(cs.zIndex) < 1000) continue;
    const child = el.firstElementChild;
    if (!child) continue;
    const childCs = getComputedStyle(child);
    if (childCs.display === "flex" && childCs.flexDirection === "column") {
      console.log(TAG, "tagged modal", el);
      el.classList.add("url-porter-keep-modal");
      injectPreviewButton(el);
    }
  }
  // Also inject into already-tagged modals that might not have the button yet
  document.querySelectorAll(".url-porter-keep-modal").forEach(injectPreviewButton);
  console.log(TAG, "scan complete");
}

let scanTimer;
/**
 * Debounce a DOM scan for modals.
 *
 * @param {string} source - Label describing what triggered the scan
 * @returns {void}
 */
function scheduleScan(source) {
  console.log(TAG, source + ", scanning in 0.5s");
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scan, 500);
}

document.addEventListener("click", () => scheduleScan("click detected"));
window.addEventListener("focus", () => scheduleScan("window focused"));

console.log(TAG, "content script loaded");
scheduleScan("initial load");
