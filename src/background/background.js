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
    const configs = await getConfig(true);

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
async function getConfig(shouldTransform = false) {
  try {
    const result = await chrome.storage.sync.get(["jsonConfig"]);
    const raw = result.jsonConfig || [];

    if (!Array.isArray(raw)) return [];

    const normalized = raw
      // Step 1: unified pre-filter (only structurally valid entries)
      .filter(item =>
        // legacy object
        (item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          ("from" in item || "to" in item)) ||

        // array format
        (Array.isArray(item) && item.length === 2)
      )

      // Step 2: normalize shape → always { from, to }
      .map(item => {
        if (Array.isArray(item)) {
          return {
            from: String(item[0] ?? "").trim(),
            to: String(item[1] ?? "").trim()
          };
        }

        return {
          from: String(item.from ?? "").trim(),
          to: String(item.to ?? "").trim()
        };
      })

      // Step 3: normalize values
      .map(({ from, to }) => {
        let normalizedFrom = from;
        let normalizedTo = to;

        // normalize `from`
        if (!normalizedFrom.startsWith("||")) {
          normalizedFrom = "||" + normalizedFrom;
        }
        if (!normalizedFrom.endsWith("^")) {
          normalizedFrom = normalizedFrom + "^";
        }

        // normalize `to`
        if (
          !normalizedTo.startsWith("http://") &&
          !normalizedTo.startsWith("https://")
        ) {
          normalizedTo = "http://" + normalizedTo;
        }

        return {
          from: normalizedFrom,
          to: normalizedTo
        };
      })

      // Step 4: final hard validation (must have both)
      .filter(item => Boolean(item.from) && Boolean(item.to));

    return normalized;
  } catch (error) {
    console.error("Failed to get config:", error);
    return [];
  }
}
