// Chrome/Edge MV3 compatibility shim
if (typeof browser === 'undefined') var browser = chrome;

// Claude usage scraper
// Target: https://claude.ai/settings/usage
// English UI:
//   "Plan usage limits"
//     "Current session" + "Resets in 3 hr 44 min" + "19% used"
//   "Weekly limits"
//     "All models" + "Resets Mon 11:00 AM" + "7% used"

(function () {
  const SOURCE = 'claude';
  let lastSentKey = '';
  let lastUrl = location.href;

  function scrape() {
    if (!location.pathname.includes('settings')) return;

    const data = { source: SOURCE, metrics: [], scrapedAt: Date.now(), url: location.href };
    const bodyText = document.body.innerText || '';

    // Strategy: chunk by section headers, then find "XX% used" in each chunk
    // Section anchors we know
    const sections = [
      { anchor: 'Current session', label: 'Current session' },
      { anchor: 'All models',      label: 'All models'      },
    ];

    for (const sec of sections) {
      const pos = bodyText.indexOf(sec.anchor);
      if (pos === -1) continue;

      // Chunk: from this anchor to 300 chars later (well within one card)
      const chunk = bodyText.slice(pos, pos + 300);

      const pctMatch = chunk.match(/(\d{1,3})\s*%\s*used/i);
      if (!pctMatch) continue;
      const used = parseInt(pctMatch[1]);

      // Reset time: "Resets in X hr Y min" or "Resets Mon HH:MM AM/PM"
      const resetMatch = chunk.match(/Resets[^\n]{3,40}/i);
      const resetAt = resetMatch ? resetMatch[0].trim() : '';

      data.metrics.push({
        label: sec.label,
        used,
        remaining: 100 - used,
        resetAt
      });
    }

    if (data.metrics.length === 0) return;
    const key = JSON.stringify(data.metrics);
    if (key === lastSentKey) return;
    lastSentKey = key;
    browser.runtime.sendMessage({ type: 'USAGE_UPDATE', data });
  }

  // Run immediately and with retries
  function tryMultiple() {
    setTimeout(scrape, 500);
    setTimeout(scrape, 1500);
    setTimeout(scrape, 3500);
  }

  tryMultiple();

  // SPA URL polling — most reliable way to detect navigation in React apps
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastSentKey = ''; // allow re-send after navigation
      tryMultiple();
    }
  }, 500);

  // Also watch DOM for content changes on the same URL
  const observer = new MutationObserver(() => {
    clearTimeout(window._claudeTimer);
    window._claudeTimer = setTimeout(scrape, 800);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
