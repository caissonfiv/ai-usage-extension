// MiniMax Coding Plan scraper
// Target: https://platform.minimaxi.com/user-center/payment/coding-plan
// New page structure (2026):
//   "当前使用"
//     "文本生成"
//       "5 小时"   (tab label)
//       "时间范围: 15:00-20:00(UTC+8)"
//       "重置时间: 3 小时后重置"
//       [progress bar]  "155/600"  "26%"

(function () {
  const SOURCE = 'minimax';

  function scrape() {
    const data = { source: SOURCE, metrics: [], scrapedAt: Date.now(), url: location.href };
    const bodyText = document.body.innerText || '';

    // Match "XXX/YYY" usage ratio (e.g. "155/600")
    const ratioRegex = /(\d{1,6})\s*\/\s*(\d{1,6})/g;
    let m;
    const candidates = [];
    while ((m = ratioRegex.exec(bodyText)) !== null) {
      const used = parseInt(m[1]);
      const total = parseInt(m[2]);
      // Filter out noise (must be plausible usage numbers, total > used)
      if (total > used && total >= 10) {
        candidates.push({ used, total, pos: m.index });
      }
    }

    for (const c of candidates) {
      // Get surrounding context
      const before = bodyText.slice(Math.max(0, c.pos - 300), c.pos);
      const after  = bodyText.slice(c.pos, c.pos + 150);

      // Find percentage nearby (e.g. "26%")
      const pctMatch = after.match(/(\d{1,3})\s*%/);
      const pct = pctMatch ? parseInt(pctMatch[1]) : Math.round((c.used / c.total) * 100);

      // Find time window: "时间范围: 15:00-20:00(UTC+8)"
      const timeMatch = (before + after).match(/时间范围[：:]\s*([^\n]{5,30})/);
      const timeWindow = timeMatch ? timeMatch[1].trim() : '';

      // Find reset: "重置时间: 3 小时后重置" or "X 小时 X 分钟后重置"
      const resetMatch = (before + after).match(/重置时间[：:]\s*([^\n]{2,20})/);
      const resetAt = resetMatch ? resetMatch[1].trim() : '';

      // Find section label: look for "5 小时" / "文本生成" etc. before this block
      const beforeLines = before.split('\n').map(l => l.trim()).filter(Boolean);
      let label = '文本生成';
      for (let i = beforeLines.length - 1; i >= 0; i--) {
        const line = beforeLines[i];
        if (line.match(/^[\d]+\s*小时$/) || line === '文本生成' || line === '当前使用') {
          label = line;
          break;
        }
      }

      const resetStr = [timeWindow, resetAt].filter(Boolean).join(' · ');

      data.metrics.push({
        label,
        used: c.used,
        limit: c.total,
        remaining: 100 - pct,
        unit: '',
        resetAt: resetStr
      });
    }

    // Deduplicate by label
    const seen = new Set();
    data.metrics = data.metrics.filter(m => {
      if (seen.has(m.label)) return false;
      seen.add(m.label);
      return true;
    });

    if (data.metrics.length > 0) {
      browser.runtime.sendMessage({ type: 'USAGE_UPDATE', data });
    }
  }

  setTimeout(scrape, 1500);
  setTimeout(scrape, 3000);

  const observer = new MutationObserver(() => {
    clearTimeout(window._mmTimer);
    window._mmTimer = setTimeout(scrape, 1000);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
