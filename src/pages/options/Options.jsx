import { useState, useEffect } from "react";
import "./options.scss";

const DEFAULT_SYNC_URL =
  import.meta.env.VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL ||
  "https://synle.github.io/fav/url-porter.json";

export default function Options() {
  const [homepageUrl, setHomepageUrl] = useState("");
  const [jsonConfig, setJsonConfig] = useState("");
  const [showAddLinkModal, setShowAddLinkModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [linkFrom, setLinkFrom] = useState("");
  const [linkTo, setLinkTo] = useState("");
  const [syncUrl, setSyncUrl] = useState(DEFAULT_SYNC_URL);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const config = await getConfig();
    const homepage = await getHomepageUrl();
    const savedSyncUrl = await getSyncUrl();
    setHomepageUrl(homepage);
    setJsonConfig(config ? JSON.stringify(config, null, 2) : "");
    setSyncUrl(savedSyncUrl);
  };

  const handleSave = async () => {
    try {
      await setConfig(jsonConfig.trim());
      await saveHomepageUrl(homepageUrl.trim());
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
      await loadSettings();
      alert("Options Saved!");
    } catch (err) {
      alert(err);
    }
  };

  const handleSyncClick = () => {
    setShowSyncModal(true);
  };

  const handleSyncSubmit = async (e) => {
    e.preventDefault();

    // Validate URL
    if (!isValidUrl(syncUrl)) {
      alert("Please enter a valid URL starting with http:// or https://");
      return;
    }

    // Save the sync URL
    await setSyncUrlToStorage(syncUrl);

    // Perform sync
    try {
      const res = await fetch(syncUrl, { method: "GET" });

      if (!res.ok) throw new Error("Failed to sync settings from server");

      const ajaxResponse = await res.json();

      if (!("homepage" in ajaxResponse) || !("configs" in ajaxResponse)) {
        throw new Error("Invalid response format");
      }

      setHomepageUrl((ajaxResponse.homepage || "").trim());
      setJsonConfig(JSON.stringify(ajaxResponse.configs ?? [], null, 2));

      await setConfig(JSON.stringify(ajaxResponse.configs ?? []));
      await saveHomepageUrl((ajaxResponse.homepage || "").trim());
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
      await loadSettings();

      setShowSyncModal(false);
      alert("Settings synced successfully!");
    } catch (err) {
      alert("Sync failed: " + err.message);
    }
  };

  const handleAddLink = async (e) => {
    e.preventDefault();

    const newConfigs = await getConfig();
    newConfigs.push({
      from: `||${linkFrom.trim()}^`,
      to: ensureHttpProtocol(linkTo.trim()),
    });

    try {
      await setConfig(JSON.stringify(newConfigs));
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
      await loadSettings();
      alert("New Link Added!");

      setLinkFrom("");
      setLinkTo("");
      setShowAddLinkModal(false);
    } catch (err) {
      alert(err);
    }
  };

  const isValidUrl = (url) => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === "http:" || urlObj.protocol === "https:";
    } catch {
      return false;
    }
  };

  const ensureHttpProtocol = (url) => {
    if (!url) return url;
    const trimmedUrl = url.trim();
    if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
      return trimmedUrl;
    }
    return `http://${trimmedUrl}`;
  };

  return (
    <div className="options-container">
      <div className="options-content">
        <h1>
          URL Porter Options{" "}
          <button className="link-button" onClick={handleSyncClick}>
            Sync Settings
          </button>
        </h1>

        <section>
          <h2>Homepage URL</h2>
          <input
            type="text"
            value={homepageUrl}
            onChange={(e) => setHomepageUrl(e.target.value)}
            placeholder="Enter your Homepage URL here"
            className="input-field"
          />
        </section>

        <section>
          <h2>
            JSON Config Extension{" "}
            <button
              className="link-button"
              onClick={() => {
                setShowAddLinkModal(true);
                setTimeout(() => document.getElementById("link-from")?.focus(), 100);
              }}
            >
              Add a link
            </button>
          </h2>
          <textarea
            value={jsonConfig}
            onChange={(e) => setJsonConfig(e.target.value)}
            placeholder="Enter your JSON config here"
            className="textarea-field"
          />
          <button onClick={handleSave} className="save-button">
            Save
          </button>
        </section>
      </div>

      {showAddLinkModal && (
        <div className="modal" onClick={() => setShowAddLinkModal(false)}>
          <form
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAddLink}
          >
            <button
              type="button"
              className="close-button"
              onClick={() => setShowAddLinkModal(false)}
            >
              ×
            </button>
            <h2>Add a single link</h2>
            <input
              id="link-from"
              type="text"
              value={linkFrom}
              onChange={(e) => setLinkFrom(e.target.value)}
              placeholder="Link alias"
              className="input-field"
              required
            />
            <input
              type="text"
              value={linkTo}
              onChange={(e) => setLinkTo(e.target.value)}
              placeholder="Full URL"
              className="input-field"
              required
            />
            <button type="submit" className="add-button">
              Add
            </button>
          </form>
        </div>
      )}

      {showSyncModal && (
        <div className="modal" onClick={() => setShowSyncModal(false)}>
          <form
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSyncSubmit}
          >
            <button
              type="button"
              className="close-button"
              onClick={() => setShowSyncModal(false)}
            >
              ×
            </button>
            <h2>Sync Settings</h2>
            <p className="modal-description">
              Enter the URL of your settings configuration file
            </p>
            <input
              type="url"
              value={syncUrl}
              onChange={(e) => setSyncUrl(e.target.value)}
              placeholder="Server URL (http:// or https://)"
              className="input-field"
              required
            />
            <button type="submit" className="add-button">
              Sync Now
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// Helper functions
function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["jsonConfig"], (result) => {
      if (result.jsonConfig) {
        return resolve(result.jsonConfig);
      }
      resolve([]);
    });
  });
}

function stripJsonComments(jsonString) {
  // Remove single-line comments (//)
  // Remove multi-line comments (/* */)
  return jsonString
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) =>
      g ? "" : m
    )
    .trim();
}

function setConfig(input_value) {
  return new Promise((resolve, reject) => {
    if (!input_value) {
      input_value = `[]`;
    }

    let jsonConfig;
    try {
      // Strip comments before parsing
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

function getHomepageUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get("homepageUrl", (result) => {
      resolve(result.homepageUrl || "");
    });
  });
}

function saveHomepageUrl(input_value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ homepageUrl: input_value }, () => {
      resolve();
    });
  });
}

function getSyncUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get("syncUrl", (result) => {
      resolve(result.syncUrl || DEFAULT_SYNC_URL);
    });
  });
}

function setSyncUrlToStorage(input_value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ syncUrl: input_value }, () => {
      resolve();
    });
  });
}
