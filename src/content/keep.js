/* Dynamically find and tag the note modal so CSS can style it */
const TAG = "[url-porter]";

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
    }
  }
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
