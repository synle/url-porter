/** Cleans and normalizes a url-porter JSON config file for import. */
const fs = require("fs");

const INPUT_FILE = "url-porter.json";
const OUTPUT_FILE = INPUT_FILE;
const DEFAULT_HOME_PAGE = "https://synle.github.io/fav/";

try {
  const rawData = fs.readFileSync(INPUT_FILE, "utf8");

  // Strip comments (single-line // and multi-line /* */) so JSON.parse works
  const jsonWithoutComments = rawData.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? "" : m));
  const parsedData = JSON.parse(jsonWithoutComments);

  // Support both { configs: [...] } and bare array formats
  let configs = [];
  if (parsedData.configs && Array.isArray(parsedData.configs)) {
    configs = parsedData.configs;
  } else if (Array.isArray(parsedData)) {
    configs = parsedData;
  }

  // Transform each entry into a normalized [from, to] pair
  const transformedConfigs = configs.map((entry) => {
    let fromValue = "";
    let toValue = "";

    if (Array.isArray(entry) && entry.length === 2) {
      [fromValue, toValue] = entry;
    } else {
      fromValue = entry.from?.trim() || "";
      toValue = entry.to?.trim() || "";
    }

    if (fromValue) {
      fromValue = fromValue
        .replace(/^\|\|/, "")
        .replace(/^\^|\^$/g, "")
        .replace(/[^\x20-\x7E]/g, "")
        .replace(/\|\|/g, "")
        .replace(/\^/g, "")
        .trim()
        .toLowerCase();
    }

    if (toValue) {
      if (!/^https?:\/\//i.test(toValue)) {
        toValue = `http://${toValue}`;
      }
      toValue = toValue.replace(/\/+$/, "");
    }

    return [fromValue, toValue];
  });

  // Deduplicate entries with the same fromValue and toValue
  const seen = new Set();
  const dedupedConfigs = transformedConfigs.filter(([from, to]) => {
    const key = `${from}\t${to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const duplicatesRemoved = transformedConfigs.length - dedupedConfigs.length;

  const result = {
    homepage: parsedData.homepage || DEFAULT_HOME_PAGE,
    configs: dedupedConfigs,
  };

  // Retain optional settings if they exist in the source
  if (Array.isArray(parsedData.bookmarkRules)) {
    result.bookmarkRules = parsedData.bookmarkRules;
  }
  if (typeof parsedData.bookmarkFolderName === "string" && parsedData.bookmarkFolderName.trim()) {
    result.bookmarkFolderName = parsedData.bookmarkFolderName.trim();
  }
  if (typeof parsedData.historyAliasLimit === "number" && parsedData.historyAliasLimit >= 1) {
    result.historyAliasLimit = parsedData.historyAliasLimit;
  }
  if (typeof parsedData.historyEntryLimit === "number" && parsedData.historyEntryLimit >= 1) {
    result.historyEntryLimit = parsedData.historyEntryLimit;
  }
  if (typeof parsedData.githubOrgThreshold === "number" && parsedData.githubOrgThreshold >= 1) {
    result.githubOrgThreshold = parsedData.githubOrgThreshold;
  }
  if (typeof parsedData.statsVisitThreshold === "number" && parsedData.statsVisitThreshold >= 1) {
    result.statsVisitThreshold = parsedData.statsVisitThreshold;
  }
  if (typeof parsedData.statsMaxResults === "number" && parsedData.statsMaxResults >= 1) {
    result.statsMaxResults = parsedData.statsMaxResults;
  }
  if (typeof parsedData.statsLookbackMonths === "number" && parsedData.statsLookbackMonths >= 1) {
    result.statsLookbackMonths = parsedData.statsLookbackMonths;
  }

  console.log(JSON.stringify(result, null, 2));
  if (duplicatesRemoved > 0) {
    console.log(`\nRemoved ${duplicatesRemoved} duplicate(s).`);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), "utf8");
  console.log(`Successfully updated ${OUTPUT_FILE}`);
} catch (error) {
  console.error("Error processing the JSON file:", error.message);
}
