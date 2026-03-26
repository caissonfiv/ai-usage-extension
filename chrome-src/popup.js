// Chrome/Edge MV3 compatibility shim
if (typeof browser === 'undefined') var browser = chrome;

function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);font-size:11px;padding:6px 14px;border-radius:20px;z-index:200;opacity:0;pointer-events:none;transition:opacity 0.2s;white-space:nowrap';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2000);
}
// popup.js

const SOURCES = {
  claude: {
    name: 'Claude Code',
    icon: '🤖',
    url: 'https://claude.ai/settings/usage',
    label: '打开 Claude 设置'
  },
  chatgpt: {
    name: 'ChatGPT Codex',
    icon: '✨',
    url: 'https://chatgpt.com/codex/settings/usage',
    label: '打开 Codex 用量'
  },
  minimax: {
    name: 'MiniMax',
    icon: '💡',
    url: 'https://platform.minimaxi.com/user-center/payment/token-plan',
    label: '打开 MiniMax 控制台'
  }
};

const LABEL_MAP = {
  'Current session': '当前会话',
  'All models': '全部模型',
  'Weekly limits': '每周限额',
  'Plan usage limits': '套餐用量',
};

const RESET_MAP = [
  [/Resets in (\d+) hr (\d+) min/i, (_, h, m) => `${h} 小时 ${m} 分钟后重置`],
  [/Resets in (\d+) min/i,          (_, m)    => `${m} 分钟后重置`],
  [/Resets in (\d+) hr/i,           (_, h)    => `${h} 小时后重置`],
  [/Resets (Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i, (s) => s
    .replace('Mon','周一').replace('Tue','周二').replace('Wed','周三')
    .replace('Thu','周四').replace('Fri','周五').replace('Sat','周六').replace('Sun','周日')
    .replace('Resets ','').replace(/(\d+):(\d+) (AM|PM)/i, (_, h, m, ap) => {
      let hr = parseInt(h); if (ap.toUpperCase()==='PM' && hr<12) hr+=12; if (ap.toUpperCase()==='AM' && hr===12) hr=0;
      return `${String(hr).padStart(2,'0')}:${m} 重置`;
    })
  ],
];

function translateLabel(s) {
  return LABEL_MAP[s] || LABEL_MAP[s.trim()] || s;
}
function translateReset(s) {
  if (!s) return s;
  for (const [re, fn] of RESET_MAP) {
    if (re.test(s)) return s.replace(re, fn);
  }
  return s;
}



const STALE_MS = 10 * 60 * 1000; // 10 minutes

function fmtNum(n) {
  if (n === undefined || n === null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}

function fmtAge(ts) {
  if (!ts) return '从未';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + ' 小时前';
  return Math.floor(hr / 24) + ' 天前';
}

function barColor(pct) {
  if (pct < 60) return '#22c55e';
  if (pct < 85) return '#f59e0b';
  return '#ef4444';
}

function renderMetric(m) {
  // Normalize: compute pct used
  let usedPct = null;
  let valueStr = '';
  let subStr = '';

  if (m.remaining !== undefined && m.limit === undefined) {
    // percentage remaining only
    usedPct = 100 - m.remaining;
    valueStr = m.remaining + '% 剩余';
    subStr = m.resetAt ? '重置：' + translateReset(m.resetAt) : '';
  } else if (m.used !== undefined && m.limit !== undefined && m.limit > 0) {
    usedPct = Math.min(100, (m.used / m.limit) * 100);
    const unit = m.unit ? ' ' + m.unit : '';
    valueStr = fmtNum(m.used) + unit + ' / ' + fmtNum(m.limit) + unit;
    subStr = m.resetAt ? '重置：' + translateReset(m.resetAt) : '';
  } else if (m.value !== undefined) {
    valueStr = fmtNum(m.value) + (m.unit ? ' ' + m.unit : '');
  } else if (m.used !== undefined) {
    const unit = m.unit ? ' ' + m.unit : '';
    valueStr = fmtNum(m.used) + unit + (m.limit ? ' / ' + fmtNum(m.limit) + unit : '');
  } else {
    return '';
  }

  const color = usedPct !== null ? barColor(usedPct) : '#60a5fa';

  return `
  <div class="metric">
    <div class="metric-row">
      <span class="metric-label">${esc(translateLabel(m.label))}</span>
      <span class="metric-value" style="color:${color}">${esc(valueStr)}</span>
    </div>
    ${subStr ? `<div class="metric-sub">${esc(subStr)}</div>` : ''}
    ${usedPct !== null ? `<div class="bar"><div class="bar-fill" style="width:${usedPct.toFixed(1)}%;background:${color}"></div></div>` : ''}
  </div>`;
}

function renderSource(key, data) {
  const cfg = SOURCES[key] || { name: key, icon: '📊', url: '#' };
  const isStale = data.scrapedAt && (Date.now() - data.scrapedAt > STALE_MS);
  const metricsHTML = (data.metrics || []).map(renderMetric).filter(Boolean).join('');

  return `
  <div class="source-block" id="source-${key}">
    <div class="source-header">
      <div class="source-identity">
        <span class="source-icon">${cfg.icon}</span>
        <span class="source-name">${cfg.name}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="source-time">${fmtAge(data.scrapedAt)}</span>
        <button class="source-link" id="reload-btn-${key}" onclick="refreshSource('${key}')" style="cursor:pointer;border:1px solid rgba(96,165,250,0.2);background:none;color:var(--blue);font-size:11px;padding:2px 6px;border-radius:4px;" title="刷新此页面">↻</button>
        <a class="source-link" href="${cfg.url}" target="_blank">打开</a>
      </div>
    </div>
    <div class="metrics-list">
      ${metricsHTML || '<div style="color:var(--text3);font-size:11px;padding:2px 0">暂无数据</div>'}
    </div>
    ${isStale ? `<div class="stale-notice">⚠ 数据超过 10 分钟，请重新打开页面刷新</div>` : ''}
  </div>`;
}

function renderEmpty() {
  const links = Object.entries(SOURCES).map(([key, cfg]) => `
    <a class="open-link" href="${cfg.url}" target="_blank">
      <div class="open-link-left">
        <span style="font-size:16px">${cfg.icon}</span>
        <span>${cfg.label}</span>
      </div>
      <span class="open-link-arrow">→</span>
    </a>`).join('');

  return `
  <div class="empty-state">
    <div class="big">📊</div>
    <p>还没有数据。<br>打开以下页面后会自动抓取：</p>
  </div>
  <div class="empty-links">${links}</div>`;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadAndRender() {
  const usageData = await browser.runtime.sendMessage({ type: 'GET_USAGE' });
  const content = document.getElementById('content');

  if (!usageData || Object.keys(usageData).length === 0) {
    content.innerHTML = renderEmpty();
    return;
  }

  // Render in defined order, plus any extra sources
  const order = ['claude', 'chatgpt', 'minimax'];
  const allKeys = [...new Set([...order, ...Object.keys(usageData)])];
  const html = allKeys
    .filter(k => usageData[k])
    .map(k => renderSource(k, usageData[k]))
    .join('');

  content.innerHTML = html || renderEmpty();

  // Update footer
  const latest = Object.values(usageData).reduce((a, d) => d.scrapedAt > a ? d.scrapedAt : a, 0);
  document.getElementById('footer-text').textContent =
    latest ? '最后更新：' + fmtAge(latest) : '打开对应页面后自动抓取';
}

// ---- Manual edit modal ----

let manualData = {};

function openManualModal() {
  browser.runtime.sendMessage({ type: 'GET_USAGE' }).then(usageData => {
    manualData = usageData || {};
    const form = document.getElementById('manual-form');

    // For each known source, show editable fields
    const fields = Object.entries(SOURCES).map(([key, cfg]) => {
      const d = manualData[key];
      const metrics = d?.metrics || [];
      const metricRows = metrics.map((m, i) => `
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <input type="text" placeholder="名称" value="${esc(m.label || '')}"
            data-src="${key}" data-idx="${i}" data-field="label"
            style="flex:2;font-size:12px;padding:5px 8px;border-radius:5px;border:1px solid var(--border2);background:var(--bg);color:var(--text);font-family:inherit">
          <input type="number" placeholder="已用" value="${m.used ?? m.value ?? ''}"
            data-src="${key}" data-idx="${i}" data-field="used"
            style="flex:1;font-size:12px;padding:5px 8px;border-radius:5px;border:1px solid var(--border2);background:var(--bg);color:var(--text);font-family:inherit">
          <input type="number" placeholder="限额" value="${m.limit ?? ''}"
            data-src="${key}" data-idx="${i}" data-field="limit"
            style="flex:1;font-size:12px;padding:5px 8px;border-radius:5px;border:1px solid var(--border2);background:var(--bg);color:var(--text);font-family:inherit">
        </div>`).join('');

      return `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:6px;display:flex;align-items:center;gap:5px">
            ${cfg.icon} ${cfg.name}
          </div>
          <div id="manual-metrics-${key}">${metricRows}</div>
          <button onclick="addManualMetric('${key}')"
            style="font-size:11px;color:var(--blue);background:none;border:none;cursor:pointer;padding:2px 0;font-family:inherit">
            + 添加指标
          </button>
        </div>`;
    }).join('');

    form.innerHTML = fields;
    document.getElementById('modal').classList.add('open');
  });
}

window.addManualMetric = function(key) {
  const container = document.getElementById(`manual-metrics-${key}`);
  const idx = container.querySelectorAll('[data-idx]').length;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
  row.innerHTML = `
    <input type="text" placeholder="名称" data-src="${key}" data-idx="${idx}" data-field="label"
      style="flex:2;font-size:12px;padding:5px 8px;border-radius:5px;border:1px solid var(--border2);background:var(--bg);color:var(--text);font-family:inherit">
    <input type="number" placeholder="已用" data-src="${key}" data-idx="${idx}" data-field="used"
      style="flex:1;font-size:12px;padding:5px 8px;border-radius:5px;border:1px solid var(--border2);background:var(--bg);color:var(--text);font-family:inherit">
    <input type="number" placeholder="限额" data-src="${key}" data-idx="${idx}" data-field="limit"
      style="flex:1;font-size:12px;padding:5px 8px;border-radius:5px;border:1px solid var(--border2);background:var(--bg);color:var(--text);font-family:inherit">`;
  container.appendChild(row);
};

function saveManual() {
  const inputs = document.querySelectorAll('[data-src][data-idx][data-field]');
  const bySource = {};

  for (const inp of inputs) {
    const { src, idx, field } = inp.dataset;
    const i = parseInt(idx);
    if (!bySource[src]) bySource[src] = {};
    if (!bySource[src][i]) bySource[src][i] = {};
    bySource[src][i][field] = inp.value;
  }

  const saves = Object.entries(bySource).map(([src, rows]) => {
    const metrics = Object.values(rows)
      .filter(r => r.label?.trim())
      .map(r => ({
        label: r.label.trim(),
        used: parseFloat(r.used) || 0,
        limit: parseFloat(r.limit) || 0,
        unit: ''
      }));
    return browser.runtime.sendMessage({
      type: 'SAVE_MANUAL',
      source: src,
      data: { source: src, metrics }
    });
  });

  Promise.all(saves).then(() => {
    document.getElementById('modal').classList.remove('open');
    loadAndRender();
  });
}

async function refreshSource(key) {
  const cfg = SOURCES[key];
  if (!cfg) return;
  const tabs = await browser.tabs.query({ url: cfg.url + '*' }).catch(() => []);
  if (tabs.length > 0) {
    await browser.tabs.reload(tabs[0].id);
    showToast('已刷新 ' + cfg.name);
  } else {
    showToast('请先打开 ' + cfg.name + ' 页面');
  }
}

function refreshAll() {
  Object.keys(SOURCES).forEach(key => refreshSource(key));
}


function popout() {
  const isStandalone = window.location.search.includes('standalone');
  if (isStandalone) return; // already in standalone window

  const url = browser.runtime.getURL('popup.html') + '?standalone=1';
  browser.windows.create({
    url,
    type: 'popup',
    width: 380,
    height: 600,
    focused: true
  });
  window.close(); // close the extension popup
}

// Event listeners
document.getElementById('refresh-btn').addEventListener('click', () => {
  triggerRefresh();
});

let refreshCountdown = null;

function triggerRefresh() {
  browser.runtime.sendMessage({ type: 'REFRESH_NOW' });
  startRefreshCountdown(30);
}

function startRefreshCountdown(secs) {
  // Cancel any existing countdown
  if (refreshCountdown) clearInterval(refreshCountdown);

  const btn = document.getElementById('refresh-btn');
  const footerText = document.getElementById('footer-text');
  let remaining = secs;

  // Disable button and show countdown on it
  btn.disabled = true;
  btn.style.opacity = '0.5';
  btn.style.cursor = 'default';

  function tick() {
    btn.textContent = remaining + 's 后更新';
    footerText.textContent = '页面刷新中，等待数据…';
    remaining--;
    if (remaining < 0) {
      clearInterval(refreshCountdown);
      refreshCountdown = null;
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = '';
      btn.textContent = '立即刷新';
      loadAndRender();
    }
  }

  tick();
  refreshCountdown = setInterval(tick, 1000);
}
document.getElementById('popout-btn').addEventListener('click', popout);
document.getElementById('refresh-all-btn').addEventListener('click', refreshAll);
document.getElementById('manual-btn').addEventListener('click', openManualModal);
document.getElementById('modal-close').addEventListener('click', () =>
  document.getElementById('modal').classList.remove('open'));
document.getElementById('modal-cancel').addEventListener('click', () =>
  document.getElementById('modal').classList.remove('open'));
document.getElementById('modal-save').addEventListener('click', saveManual);

// Links in popup need special handling in Chrome extensions too
document.addEventListener('click', e => {
  const a = e.target.closest('a[href]');
  if (a && a.target === '_blank') {
    e.preventDefault();
    browser.tabs.create({ url: a.href });
  }
});


async function markOpenSources() {
  const open = await browser.runtime.sendMessage({ type: 'GET_OPEN_SOURCES' }).catch(() => []);
  for (const [key] of Object.entries(SOURCES)) {
    const btn = document.getElementById('reload-btn-' + key);
    if (!btn) continue;
    if (open.includes(key)) {
      btn.style.color = 'var(--green)';
      btn.style.borderColor = 'rgba(34,197,94,0.3)';
      btn.title = '刷新此页面';
    } else {
      btn.style.color = 'var(--text3)';
      btn.style.borderColor = 'var(--border2)';
      btn.title = '页面未打开';
    }
  }
}

// ── Auto-refresh toggle & countdown ─────────────────────────────────────────
const REFRESH_INTERVAL_MIN = 5;
let autoRefreshEnabled = true;
let countdownInterval = null;

async function initAutoRefresh() {
  autoRefreshEnabled = await browser.runtime.sendMessage({ type: 'GET_AUTO_REFRESH' });
  updateToggleUI();
  startCountdown();
}

function updateToggleUI() {
  const btn = document.getElementById('auto-toggle-wrap');
  const label = document.getElementById('auto-label');
  if (btn) btn.classList.toggle('on', autoRefreshEnabled);
  if (label) label.textContent = autoRefreshEnabled ? '自动刷新' : '已暂停';
}

function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  const el = document.getElementById('countdown');
  if (!el) return;

  async function tick() {
    if (!autoRefreshEnabled) { el.textContent = ''; return; }
    try {
      const alarm = await browser.alarms.get('autoRefresh');
      if (!alarm) { el.textContent = ''; return; }
      const secsLeft = Math.max(0, Math.round((alarm.scheduledTime - Date.now()) / 1000));
      const m = Math.floor(secsLeft / 60);
      const s = secsLeft % 60;
      el.textContent = m + ':' + String(s).padStart(2, '0') + ' 后刷新';
    } catch (e) { el.textContent = ''; }
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

document.getElementById('auto-toggle-wrap').addEventListener('click', async () => {
  autoRefreshEnabled = !autoRefreshEnabled;
  updateToggleUI();
  await browser.runtime.sendMessage({ type: 'SET_AUTO_REFRESH', enabled: autoRefreshEnabled });
  startCountdown();
});

// Poll storage for updates (catches alarm-triggered refreshes)
let lastKnownTs = 0;
setInterval(async () => {
  const data = await browser.runtime.sendMessage({ type: 'GET_USAGE' }).catch(() => ({}));
  const latestTs = Object.values(data).reduce((a, d) => Math.max(a, d.scrapedAt || 0), 0);
  if (latestTs > lastKnownTs) {
    lastKnownTs = latestTs;
    loadAndRender();
  }
}, 5000);

async function init() {
  await loadAndRender();
  markOpenSources();
  initAutoRefresh();
}
init();


// Standalone window adjustments
if (window.location.search.includes('standalone')) {
  document.body.style.width = '100%';
  document.body.style.minWidth = '320px';
  // Hide popout button (already in standalone)
  const pb = document.getElementById('popout-btn');
  if (pb) { pb.title = '已独立'; pb.style.opacity = '0.3'; pb.style.cursor = 'default'; }
}
