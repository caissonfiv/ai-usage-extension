// Chrome/Edge MV3 compatibility shim
if (typeof browser === 'undefined') var browser = chrome;

// ChatGPT Codex usage scraper
// Target: https://chatgpt.com/codex/settings/usage
// Page text flow (each card is a block separated by blank lines):
//   5 小时使用限额
//   82% 剩余
//   重置时间：17:18
//
//   每周使用限额
//   73% 剩余
//   重置时间：2026年3月20日 09:58
//
//   代码审查
//   100% 剩余

(function () {
  const SOURCE = 'chatgpt';
  let lastSentKey = '';

  function scrape() {
    const data = { source: SOURCE, metrics: [], scrapedAt: Date.now(), url: location.href };
    const bodyText = document.body.innerText || '';

    // Split into card-sized chunks by looking for known label boundaries
    // Each card starts with a known label line
    const knownLabels = ['5 小时使用限额', '5小时使用限额', '每周使用限额', '代码审查'];

    // Find positions of each known label in bodyText
    const labelPositions = [];
    for (const kl of knownLabels) {
      let idx = bodyText.indexOf(kl);
      while (idx !== -1) {
        labelPositions.push({ label: kl, pos: idx });
        idx = bodyText.indexOf(kl, idx + 1);
      }
    }

    // Sort by position
    labelPositions.sort((a, b) => a.pos - b.pos);

    // For each label, extract the chunk between it and the next label (or +300 chars)
    for (let i = 0; i < labelPositions.length; i++) {
      const { label, pos } = labelPositions[i];
      const nextPos = labelPositions[i + 1]?.pos ?? (pos + 300);
      const chunk = bodyText.slice(pos, nextPos);

      // Find percentage in this chunk
      const pctMatch = chunk.match(/(\d{1,3})\s*%\s*剩余/);
      if (!pctMatch) continue;
      const remaining = parseInt(pctMatch[1]);

      // Find reset time in this chunk only (not from adjacent card)
      const resetMatch = chunk.match(/重置时间[：:]\s*([^\n]{2,30})/);
      const resetAt = resetMatch ? resetMatch[1].trim() : '';

      data.metrics.push({ label, remaining, used: 100 - remaining, resetAt });
    }

    // Deduplicate by label
    const seen = new Set();
    data.metrics = data.metrics.filter(m => {
      if (seen.has(m.label)) return false;
      seen.add(m.label);
      return true;
    });

    if (data.metrics.length === 0) return;
    const key = JSON.stringify(data.metrics);
    if (key === lastSentKey) return;
    lastSentKey = key;
    browser.runtime.sendMessage({ type: 'USAGE_UPDATE', data });
  }

  setTimeout(scrape, 2000);
  setTimeout(scrape, 4000);

  const observer = new MutationObserver(() => {
    clearTimeout(window._gptTimer);
    window._gptTimer = setTimeout(scrape, 1200);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
