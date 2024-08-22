let configs = [];

// Fetch initial configuration
chrome.runtime.onInstalled.addListener(() => {
  getConfig()
    .then((_configs) => (configs = _configs))
    .then(updateRedirectRules);
});

// Listener for runtime messages
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.type === "Myevent.updateConfig") {
    configs = await getConfig();
    updateRedirectRules();
  }
});

function updateRedirectRules() {
  let i = 1;
  const rules = [];
  configs = configs || [];
  for (const config of configs) {
    let { from, to, ignoreCase = true } = config;

    let redirectUrl = "";
    let urlFilter = "";

    if (from && to) {
      urlFilter = from;
      redirectUrl = to;
    }

    if (redirectUrl) {
      rules.push({
        id: i,
        condition: {
          urlFilter: `${urlFilter}`,
          resourceTypes: ["main_frame"],
        },
        action: {
          type: "redirect",
          redirect: {
            url: redirectUrl,
          },
        },
      });

      i++;
    }
  }

  console.log(
    "chrome.declarativeNetRequest.updateDynamicRules",
    configs,
    rules,
  );
  if (rules.length > 0) {
    // Remove all existing dynamic rules
    chrome.declarativeNetRequest.getDynamicRules((oldRules) => {
      chrome.declarativeNetRequest.updateDynamicRules(
        {
          removeRuleIds: oldRules.map((rule) => rule.id),
          addRules: rules,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(
              "chrome.declarativeNetRequest.updateDynamicRules",
              chrome.runtime.lastError,
            );
          }
        },
      );
    });
  }
}

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
