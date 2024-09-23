document.addEventListener("DOMContentLoaded", async () => {
  const homepageUrlInput = document.getElementById("homepage-input");
  const jsonConfigInput = document.getElementById("json-input");
  const saveButton = document.getElementById("save");

  saveButton.addEventListener("click", async () => {
    try {
      await setConfig(jsonConfigInput.value.trim());
      await setHomepageUrl(homepageUrlInput.value.trim());
      chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
      _refresh();
      alert("Options Saved!");
    } catch (err) {
      alert(err);
    }
  });

  document.querySelector(".close").addEventListener("click", async (e) => {
    const modalId = e.target.closest(".modal").id;
    toggleModal("modal-add-link", false); // open modal
  });

  document
    .getElementById("modal-add-link-button")
    .addEventListener("click", async () => {
      toggleModal("modal-add-link", true); // open modal

      document.getElementById("link-from").value = "";
      document.getElementById("link-from").focus();
      document.getElementById("link-to").value = "";
    });

  document
    .getElementById("form-add-link")
    .addEventListener("submit", async (e) => {
      e.preventDefault();

      const newConfigs = await getConfig();
      newConfigs.push({
        from: `||${document.getElementById("link-from").value.trim()}^`,
        to: document.getElementById("link-to").value.trim(),
      });

      try {
        await setConfig(JSON.stringify(newConfigs));
        chrome.runtime.sendMessage({ type: "Myevent.updateConfig" });
        _refresh();
        alert("New Link Added!");

        document.getElementById("link-from").value = "";
        document.getElementById("link-to").value = "";

        // close modal
        toggleModal("modal-add-link", false); // close modal
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

  function toggleModal(modalId, open) {
    document.getElementById(modalId).style.display = !!open ? "block" : "none";
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
