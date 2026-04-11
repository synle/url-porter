/** Utility functions for browser history statistics grouping. */

/**
 * Group browser history items by stripped URL (origin + pathname).
 * Query strings and hash fragments are removed for grouping but preserved in variants.
 *
 * @param {Array<{url: string, title?: string, visitCount?: number, lastVisitTime?: number}>} items - Raw chrome.history.search results
 * @returns {Array<{strippedUrl: string, title: string, totalVisitCount: number, lastVisitTime: number, variants: Array<{url: string, title: string, visitCount: number, lastVisitTime: number}>}>}
 */
export function groupHistoryItems(items) {
  const map = new Map();

  for (const item of items) {
    if (!item.url) continue;

    let strippedUrl;
    try {
      const parsed = new URL(item.url);
      strippedUrl = parsed.origin + parsed.pathname;
    } catch {
      strippedUrl = item.url;
    }

    const variant = {
      url: item.url,
      title: item.title || "",
      visitCount: item.visitCount || 0,
      lastVisitTime: item.lastVisitTime || 0,
    };

    const existing = map.get(strippedUrl);
    if (existing) {
      existing.variants.push(variant);
      existing.totalVisitCount += variant.visitCount;
      if (variant.lastVisitTime > existing.lastVisitTime) {
        existing.lastVisitTime = variant.lastVisitTime;
        if (variant.title) {
          existing.title = variant.title;
        }
      }
    } else {
      map.set(strippedUrl, {
        strippedUrl,
        title: variant.title,
        totalVisitCount: variant.visitCount,
        lastVisitTime: variant.lastVisitTime,
        variants: [variant],
      });
    }
  }

  return Array.from(map.values());
}
