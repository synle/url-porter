// Initialize redirect rules on installation
chrome.runtime.onInstalled.addListener(async () => {
  await updateRedirectRules();
});

// Listen for configuration updates
chrome.runtime.onMessage.addListener(async (request) => {
  if (request.type === "Myevent.updateConfig") {
    await updateRedirectRules();
  }
});

// Update dynamic redirect rules based on configuration
async function updateRedirectRules() {
  try {
    const configs = await getConfig();

    if (!configs || configs.length === 0) {
      console.log("No redirect rules to apply");
      return;
    }

    // Build redirect rules from config
    const rules = configs
      .filter((config) => config.from && config.to)
      .map((config, index) => ({
        id: index + 1,
        condition: {
          urlFilter: config.from,
          resourceTypes: ["main_frame"],
        },
        action: {
          type: "redirect",
          redirect: {
            url: config.to,
          },
        },
      }));

    if (rules.length === 0) {
      console.log("No valid redirect rules found");
      return;
    }

    // Get existing rules to remove
    const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = oldRules.map((rule) => rule.id);

    // Update rules
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: rules,
    });

    console.log(`Updated ${rules.length} redirect rule(s)`, rules);
  } catch (error) {
    console.error("Failed to update redirect rules:", error);
  }
}

// Retrieve configuration from storage
async function getConfig() {
  try {
    const result = await chrome.storage.sync.get(["jsonConfig"]);
    return result.jsonConfig || [];
  } catch (error) {
    console.error("Failed to get config:", error);
    return [];
  }
}
