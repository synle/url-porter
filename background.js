let configs = [];

// Fetch initial configuration
getConfig().then((_configs) => (configs = _configs));

// Listener for handling web requests
chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    const url = new URL(details.url);
    let { hostname } = url;

    // Check each configuration
    for (const config of configs) {
      let { from, to, type = "equal", ignoreCase = true } = config;

      if (from && to && type) {
        switch (type) {
          case "regex":
            const regexFrom = new RegExp(from, ignoreCase ? "i" : null);
            if (regexFrom.test(url)) {
              return { redirectUrl: to };
            }
            break;
          case "equal":
          default:
            if (ignoreCase === true) {
              from = from.toLowerCase();
              hostname = hostname.toLowerCase();
            }

            if (from === hostname) {
              return { redirectUrl: to };
            }
            break;
        }
      }
    }
  },
  { urls: ["*://*/*"] }, // Match all URLs
  ["blocking"], // Block the request and perform the redirection
);

// Listener for runtime messages
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.type === "Myevent.updateConfig") {
    configs = (await getConfig()) || [];
  }
});

// Function to retrieve configuration
function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["jsonConfig"], (result) => {
      if (result.jsonConfig) {
        resolve(result.jsonConfig);
      } else {
        resolve(null);
      }
    });
  });
}
