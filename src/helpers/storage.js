const DEFAULT_SYNC_URL =
  import.meta.env.VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL || "https://synle.github.io/fav/url-porter.json";

export { DEFAULT_SYNC_URL };

export function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["jsonConfig"], (result) => {
      if (result.jsonConfig) {
        return resolve(result.jsonConfig);
      }
      resolve([]);
    });
  });
}

export function stripJsonComments(jsonString) {
  return jsonString
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? "" : m))
    .trim();
}

export function setConfig(input_value) {
  return new Promise((resolve, reject) => {
    if (!input_value) {
      input_value = `[]`;
    }

    let jsonConfig;
    try {
      const cleanedJson = stripJsonComments(input_value);
      jsonConfig = JSON.parse(cleanedJson);
    } catch (e) {
      reject("Invalid JSON: " + e.message);
      return;
    }

    chrome.storage.sync.set({ jsonConfig }, () => {
      resolve();
    });
  });
}

export function getHomepageUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get("homepageUrl", (result) => {
      resolve(result.homepageUrl || "");
    });
  });
}

export function saveHomepageUrl(input_value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ homepageUrl: input_value }, () => {
      resolve();
    });
  });
}

export function getSyncUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get("syncUrl", (result) => {
      resolve(result.syncUrl || DEFAULT_SYNC_URL);
    });
  });
}

export function setSyncUrlToStorage(input_value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ syncUrl: input_value }, () => {
      resolve();
    });
  });
}

export function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch {
    return false;
  }
}

