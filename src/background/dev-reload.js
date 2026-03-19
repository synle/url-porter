/**
 * Dev-only auto-reload script.
 * Polls reload-timestamp.txt and reloads the extension when it changes.
 * This file is only included in the manifest during dev/watch builds.
 */

const POLL_INTERVAL = 1000;
let lastTimestamp = null;

async function checkForUpdates() {
  try {
    const url = chrome.runtime.getURL("reload-timestamp.txt");
    const res = await fetch(url, { cache: "no-store" });
    const timestamp = await res.text();

    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    } else if (timestamp !== lastTimestamp) {
      console.log("[dev-reload] Change detected, reloading extension...");
      chrome.runtime.reload();
    }
  } catch {
    // File might not exist yet during first build
  }
}

setInterval(checkForUpdates, POLL_INTERVAL);
console.log("[dev-reload] Watching for changes...");
