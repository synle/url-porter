document.addEventListener("DOMContentLoaded", async () => {
  const homepageUrlInput = document.getElementById("homepage-input");
  const jsonConfigInput = document.getElementById("json-input");
  const saveButton = document.getElementById("save");

  saveButton.addEventListener("click", async () => {
    try {
      await setConfig(jsonConfigInput.value.trim());
      await setHomepageUrl(homepageUrlInput.value.trim());
      alert("Options Saved!");
    } catch (err) {
      alert(err);
    }
  });

  // Load the JSON config from storage
  _refresh();

  async function _refresh() {
    const config = await getConfig();
    homepageUrlInput.value = await getHomepageUrl();
    jsonConfigInput.value = config ? JSON.stringify(config, null, 2) : "";
  }
});

function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["jsonConfig"], (result) => {
      if (result.jsonConfig) {
        return resolve(result.jsonConfig);
      }

      resolve(null);
    });
  });
}

function setConfig(input_value) {
  return new Promise((resolve, reject) => {
    if (!input_value) {
      input_value = `[]`;
    }

    let jsonConfig;
    try {
      jsonConfig = JSON.parse(input_value);
    } catch (e) {
      reject("Invalid JSON");
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

function setHomepageUrl(input_value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ homepageUrl: input_value }, () => {
      resolve();
    });
  });
}
