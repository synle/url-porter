/* Dynamically find and tag the note modal so CSS can style it */
const TAG = "[url-porter]";

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

function getNoteContent(modal) {
  let text = modal.innerText || "";
  // Strip trailing metadata (Edited date, button labels, etc.)
  text = text.replace(/\n{2,}(Edited .+\n.*|Preview\n.*|Close.*)$/s, "").trim();
  return text;
}

function openMarkdownPreview(modal) {
  const md = getNoteContent(modal);
  if (!md) {
    console.log(TAG, "no content found");
    return;
  }
  console.log(TAG, "opening markdown preview");
  const body = markdownToHtml(md);
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Markdown Preview</title>
<style>
  body { font-family: "Fira Code", "Courier New", Courier, monospace; max-width: 98vw; margin: 2rem auto; padding: 0 20px; background: #1e1e1e; color: #d4d4d4;  }
  p {margin: 0}
  h1, h2, h3, h4, h5 { color: #f0b132; border-bottom: 1px solid #333; padding-bottom: 4px; }
  a { color: #6cb6ff; }
  code { background: #2d2d2d; padding: 2px 6px; border-radius: 3px; font-size: 14px; }
  pre { background: #2d2d2d; padding: 16px; border-radius: 6px; overflow-x: auto; }
  pre code { padding: 0; background: none; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #444; padding: 8px 12px; text-align: left; }
  th { background: #2d2d2d; }
  hr { border: none; border-top: 1px solid #444; margin: 24px 0; }
  blockquote { border-left: 3px solid #444; margin: 0; padding-left: 16px; color: #999; }
  ul, ol { padding-left: 24px; }
  li { margin: 4px 0; }
</style>
</head>
<body>${body}</body>
</html>`;
  const blob = new Blob([html], { type: "text/html" });
  window.open(URL.createObjectURL(blob), "_blank");
}

function injectPreviewButton(modal) {
  if (modal.querySelector(".url-porter-preview-btn")) return;
  const closeBtn = Array.from(modal.querySelectorAll('[role="button"]')).find((b) => b.textContent.trim() === "Close");
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
function scheduleScan(source) {
  console.log(TAG, source + ", scanning in 0.5s");
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scan, 500);
}

document.addEventListener("click", () => scheduleScan("click detected"));
window.addEventListener("focus", () => scheduleScan("window focused"));

console.log(TAG, "content script loaded");
scheduleScan("initial load");
