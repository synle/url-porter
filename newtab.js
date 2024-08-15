document.addEventListener("DOMContentLoaded", async () => {
  const url = await getHomepageUrl();

  if (url) {
    chrome.tabs.getCurrent(function (tab) {
      chrome.tabs.update(tab.id, {
        url: url,
        highlighted: true,
      });
    });

    return;
  }

  document.body.style.visibility = "visible";
});

function getHomepageUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get("homepageUrl", (result) => {
      resolve(result.homepageUrl || "");
    });
  });
}
