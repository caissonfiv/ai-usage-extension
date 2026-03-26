// Chrome/Edge MV3 compatibility shim
if (typeof browser === 'undefined') var browser = chrome;

// Background: auto-refresh by reloading existing open tabs only

const AUTO_REFRESH_INTERVAL = 5; // minutes

const SOURCES = {
  claude:  { url: 'https://claude.ai/settings/usage' },
  chatgpt: { url: 'https://chatgpt.com/codex/settings/usage' },
  minimax: { url: 'https://platform.minimaxi.com/user-center/payment/token-plan' }
};

// ── Message handler ──────────────────────────────────────────────────────────
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'USAGE_UPDATE') {
    const { data } = msg;
    if (!data?.source) return;
    browser.storage.local.get(['usageData']).then(result => {
      const current = result.usageData || {};
      current[data.source] = data;
      browser.storage.local.set({ usageData: current });
    });
    return;
  }
  if (msg.type === 'GET_USAGE') {
    return browser.storage.local.get(['usageData']).then(r => r.usageData || {});
  }
  if (msg.type === 'CLEAR_SOURCE') {
    return browser.storage.local.get(['usageData']).then(result => {
      const current = result.usageData || {};
      delete current[msg.source];
      return browser.storage.local.set({ usageData: current });
    });
  }
  if (msg.type === 'SAVE_MANUAL') {
    return browser.storage.local.get(['usageData']).then(result => {
      const current = result.usageData || {};
      current[msg.source] = { ...msg.data, manual: true, scrapedAt: Date.now() };
      return browser.storage.local.set({ usageData: current });
    });
  }
  if (msg.type === 'GET_AUTO_REFRESH') {
    return browser.storage.local.get(['autoRefresh']).then(r => r.autoRefresh ?? true);
  }
  if (msg.type === 'SET_AUTO_REFRESH') {
    browser.storage.local.set({ autoRefresh: msg.enabled });
    msg.enabled ? scheduleAlarm() : browser.alarms.clear('autoRefresh');
    return Promise.resolve();
  }
  if (msg.type === 'REFRESH_NOW') {
    refreshAll();
    return Promise.resolve();
  }
  if (msg.type === 'GET_OPEN_SOURCES') {
    return getOpenSources();
  }
});

// ── Refresh: only reload already-open tabs ───────────────────────────────────
async function getOpenSources() {
  const open = [];
  for (const [source, cfg] of Object.entries(SOURCES)) {
    const tabs = await browser.tabs.query({ url: cfg.url + '*' }).catch(() => []);
    if (tabs.length > 0) open.push(source);
  }
  return open;
}

async function refreshAll() {
  for (const [source, cfg] of Object.entries(SOURCES)) {
    const tabs = await browser.tabs.query({ url: cfg.url + '*' }).catch(() => []);
    if (tabs.length > 0) {
      try { await browser.tabs.reload(tabs[0].id); } catch (e) {}
      // Small stagger between reloads
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// ── Alarm ────────────────────────────────────────────────────────────────────
function scheduleAlarm() {
  browser.alarms.create('autoRefresh', {
    delayInMinutes: AUTO_REFRESH_INTERVAL,
    periodInMinutes: AUTO_REFRESH_INTERVAL
  });
}

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'autoRefresh') return;
  const enabled = await browser.storage.local.get(['autoRefresh'])
    .then(r => r.autoRefresh ?? true);
  if (enabled) refreshAll();
});

browser.runtime.onStartup.addListener(async () => {
  const enabled = await browser.storage.local.get(['autoRefresh'])
    .then(r => r.autoRefresh ?? true);
  if (enabled) scheduleAlarm();
});

browser.runtime.onInstalled.addListener(async () => {
  const enabled = await browser.storage.local.get(['autoRefresh'])
    .then(r => r.autoRefresh ?? true);
  if (enabled) scheduleAlarm();
});
