/* popup.js (MV3) */
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const DEFAULT_AI_SETTINGS = {
  provider: "openai",
  models: {
    openai: "gpt-5.2",
    gemini: "gemini-3-pro-preview",
    claude: "claude-opus-4-5"
  },
  apiKeys: {
    openai: "",
    gemini: "",
    claude: ""
  }
};

const MODEL_OPTIONS = {
  openai: ["gpt-5.2", "o3", "gpt-4.1"],
  gemini: ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash"],
  claude: ["claude-opus-4-5", "claude-sonnet-4-5"]
};

const cacheState = {
  items: [],
  page: 0,
  pageSize: 20,
  loaded: false
};

const cacheEls = {};

function contestFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/contests\/([^\/]+)(\/|$)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function sendToTab(tabId, msg) {
  return await chrome.tabs.sendMessage(tabId, msg);
}

async function getContestFromTab(tab) {
  const tabId = tab?.id;
  if (tabId === undefined || tabId === null) return null;
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: "get_contest" });
    if (res?.contest) return res.contest;
  } catch {
  }
  if (tab?.url) return contestFromUrl(tab.url);
  return null;
}

function normalizeSelfUser(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function sanitizeSelfUser(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_]/g, "");
}

let appSettings = { selfUser: null, targetMode: "absolute", targetModeOptions: { absolute: { k: 1, n: 3 }, relative: { k: 1000, n: 3 }, manual: { users: [] } } };
let aiState = { hasAnyKey: false, providerHasKey: false, provider: "openai" };
let isBusy = false;

function setStatus(s, isError=false) {
  const el = document.getElementById("status");
  el.textContent = s;
  el.style.color = isError ? "#c00" : "#0b5";
}

function setProgress(pct) {
  const clamped = Math.max(0, Math.min(100, Number(pct)));
  const bar = document.getElementById("progressBar");
  const text = document.getElementById("progressText");
  bar.style.width = `${clamped}%`;
  text.textContent = `${Math.round(clamped)}%`;
}

async function persistProgress(contest, partial, mode = null) {
  try {
    const data = await chrome.storage.local.get("progress_state");
    const state = data.progress_state || {};
    const prev = state[contest] || {};
    const updated = { ...prev, contest, ...partial, updatedAt: Date.now() };
    if (mode !== null) updated.mode = mode;
    state[contest] = updated;
    await chrome.storage.local.set({ progress_state: state });
  } catch {
    // ignore storage errors
  }
}

async function clearProgressState(contest) {
  try {
    const data = await chrome.storage.local.get("progress_state");
    const state = data.progress_state || {};
    if (contest && state[contest]) {
      delete state[contest];
      await chrome.storage.local.set({ progress_state: state });
    }
  } catch {
    // ignore storage errors
  }
}

function setBusy(isBusy) {
  isBusy = Boolean(isBusy);
  window.__busyFlag = isBusy;
  const btnReview = document.getElementById("btnRunAllReview");
  // JSON取得ボタンなど共通のBusy制御
  const btn = document.getElementById("btnRunAll");
  const btnCancel = document.getElementById("btnCancel");
  btn.disabled = isBusy;
  if (btnReview) btnReview.disabled = true; // busy時は常に無効
  // 比較対象モードの全UI要素をbusy時に無効化
  const targetIds = ["targetMode", "absK", "absN", "relK", "relN", "manualUsers"];
  targetIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = isBusy;
  });
  if (btnCancel) btnCancel.disabled = !isBusy;
  document.body.classList.toggle("busy", isBusy);
  if (isBusy) {
    window.onbeforeunload = (e) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };
  } else {
    window.onbeforeunload = null;
    updateAiButtons(); // Busy解除後にAIボタンの可否を再評価
  }
}

// コンテストURLが不明な場合に、実行系の操作をまとめて無効化する
function setContestControlsEnabled(enabled) {
  const disable = !enabled;
  const ids = ["btnRunAll", "btnRunAllReview", "btnCancel", "targetMode", "absK", "absN", "relK", "relN", "manualUsers", "selfUser", "provider", "model"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = disable;
  });
}

function readAndValidateTopN(inputEl) {
  const raw = inputEl?.value ?? "";
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 5) {
    throw new Error("1〜5の整数を入力してください (範囲: 1〜5)");
  }
  return n;
}

function showTargetOptions(mode) {
  const abs = document.getElementById("targetAbsolute");
  const rel = document.getElementById("targetRelative");
  const man = document.getElementById("targetManual");
  if (abs) abs.hidden = mode !== "absolute";
  if (rel) rel.hidden = mode !== "relative";
  if (man) man.hidden = mode !== "manual";
}

function readTargetConfig() {
  const mode = document.getElementById("targetMode")?.value || "absolute";
  if (mode === "absolute") {
    const k = parseInt(document.getElementById("absK")?.value) || 1;
    const n = parseInt(document.getElementById("absN")?.value) || 3;
    return { mode, k: Math.max(1, k), n: Math.max(1, Math.min(5, n)) };
  }
  if (mode === "relative") {
    const k = parseInt(document.getElementById("relK")?.value) || 1000;
    const n = parseInt(document.getElementById("relN")?.value) || 3;
    return { mode, k: Math.max(1, k), n: Math.max(1, Math.min(5, n)) };
  }
  if (mode === "manual") {
    const raw = document.getElementById("manualUsers")?.value || "";
    const all = raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    if (all.length === 0) throw new Error("比較対象のユーザー名を1名以上入力してください");
    // 重複除去（大文字小文字を区別しない）
    const seen = new Set();
    const users = [];
    for (const u of all) {
      const key = u.toLowerCase();
      if (!seen.has(key)) { seen.add(key); users.push(u); }
    }
    if (users.length > 5) throw new Error("ユーザー名は最大5名までです（現在 " + users.length + " 名）");
    return { mode, users, n: users.length };
  }
  return { mode: "absolute", k: 1, n: 3 };
}

async function saveTargetSettings() {
  try {
    const mode = document.getElementById("targetMode")?.value || "absolute";
    const absK = parseInt(document.getElementById("absK")?.value) || 1;
    const absN = parseInt(document.getElementById("absN")?.value) || 3;
    const relK = parseInt(document.getElementById("relK")?.value) || 5;
    const relN = parseInt(document.getElementById("relN")?.value) || 3;
    const rawUsers = document.getElementById("manualUsers")?.value || "";
    const users = rawUsers.split(/[,\s]+/).map(s => s.trim()).filter(Boolean).slice(0, 5);
    const data = await chrome.storage.local.get("app_settings");
    const current = data.app_settings || {};
    const updated = {
      ...current,
      targetMode: mode,
      targetModeOptions: {
        absolute: { k: Math.max(1, absK), n: Math.max(1, Math.min(5, absN)) },
        relative: { k: Math.max(1, relK), n: Math.max(1, Math.min(5, relN)) },
        manual: { users }
      }
    };
    await chrome.storage.local.set({ app_settings: updated });
  } catch {
    // ignore storage errors
  }
}

function restoreTargetSettings(settings) {
  const mode = settings.targetMode || "absolute";
  const opts = settings.targetModeOptions || {};
  const abs = opts.absolute || { k: 1, n: 3 };
  const rel = opts.relative || { k: 1000, n: 3 };
  const man = opts.manual || { users: [] };

  const modeEl = document.getElementById("targetMode");
  if (modeEl) modeEl.value = mode;

  const absKEl = document.getElementById("absK");
  const absNEl = document.getElementById("absN");
  if (absKEl) absKEl.value = String(abs.k || 1);
  if (absNEl) absNEl.value = String(abs.n || 3);

  const relKEl = document.getElementById("relK");
  const relNEl = document.getElementById("relN");
  if (relKEl) relKEl.value = String(rel.k || 1000);
  if (relNEl) relNEl.value = String(rel.n || 3);

  const manEl = document.getElementById("manualUsers");
  if (manEl) manEl.value = (man.users || []).join(", ");

  showTargetOptions(mode);
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function cacheElements() {
  cacheEls.cacheList = document.getElementById("cache-list");
  cacheEls.btnCacheRefresh = document.getElementById("btnCacheRefresh");
  cacheEls.btnCacheExportAll = document.getElementById("btnCacheExportAll");
  cacheEls.btnCacheDeleteAll = document.getElementById("btnCacheDeleteAll");
  cacheEls.btnCachePrev = document.getElementById("btnCachePrev");
  cacheEls.btnCacheNext = document.getElementById("btnCacheNext");
  cacheEls.cachePageInfo = document.getElementById("cachePageInfo");
}

function createCacheDataIcon(label, active, title, extraClass) {
  const span = document.createElement("span");
  const extra = extraClass ? ` ${extraClass}` : "";
  span.className = `cache-icon ${active ? "active" : "inactive"}${extra}`;
  span.textContent = label;
  span.title = title || label;
  span.setAttribute("aria-label", title || label);
  return span;
}

function getAiModelDisplayInfo(aiProvider, aiModel) {
  if (!aiProvider && !aiModel) {
    return { label: "—", title: "AI添削未実行", active: false, className: "" };
  }

  // プロバイダーのラベル
  const providerLabels = {
    openai: "GPT",
    gemini: "Gem",
    claude: "Cld"
  };
  const providerClasses = {
    openai: "ai-openai",
    gemini: "ai-gemini",
    claude: "ai-claude"
  };

  const label = providerLabels[aiProvider] || "AI";
  const modelInfo = aiModel || aiProvider || "不明";
  const title = `AI添削実行済 (${modelInfo})`;
  const className = providerClasses[aiProvider] || "";

  return { label, title, active: true, className };
}

function resolveCacheSelfUser(item) {
  const key = item?.selfUserKey;
  if (key === "__self__") return null;
  return item?.selfUser || null;
}

function getContestType(contestId) {
  if (!contestId) return 'algorithm';
  const lowerContest = contestId.toLowerCase();
  if (lowerContest.startsWith('ahc')) {
    return 'marathon';
  }
  return 'algorithm';
}

function renderCacheList(items) {
  if (!cacheEls.cacheList) return;
  cacheEls.cacheList.innerHTML = "";
  if (!items || items.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "キャッシュはありません。";
    empty.className = "helper";
    cacheEls.cacheList.appendChild(empty);
    return;
  }
  const sorted = items.slice().sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  cacheState.items = sorted;
  cacheState.page = Math.min(cacheState.page, Math.max(0, Math.floor((sorted.length - 1) / cacheState.pageSize)));
  const start = cacheState.page * cacheState.pageSize;
  const end = start + cacheState.pageSize;
  const pageItems = sorted.slice(start, end);
  const totalPages = Math.max(1, Math.ceil(sorted.length / cacheState.pageSize));
  if (cacheEls.cachePageInfo) {
    cacheEls.cachePageInfo.textContent = `${cacheState.page + 1} / ${totalPages}`;
  }
  if (cacheEls.btnCachePrev) cacheEls.btnCachePrev.disabled = cacheState.page <= 0;
  if (cacheEls.btnCacheNext) cacheEls.btnCacheNext.disabled = cacheState.page >= totalPages - 1;

  for (const it of pageItems) {
    const row = document.createElement("div");
    row.className = "cache-item";
    const meta = document.createElement("div");
    meta.className = "cache-meta";
    const isLogin = it.selfUserKey === "__self__";
    const userLabel = isLogin ? "ログインユーザ" : (it.selfUser ? `${it.selfUser}` : "ログインユーザ");
    const tasksCount = it.tasksCount || 0;
    const mySubsCount = it.mySubmissionsCount || 0;
    const topSubsCount = it.topSubmissionsCount || 0;
    const topUsersLabel = (it.topUserNames && it.topUserNames.length > 0)
      ? ` / vs. ${it.topUserNames.join(", ")}`
      : "";
    meta.innerHTML = `<strong>${it.contest}</strong><span>${userLabel} / ${formatDate(it.savedAt)} / 提出: ${mySubsCount}+${topSubsCount}${topUsersLabel}</span>`;
    const icons = document.createElement("div");
    icons.className = "cache-icons";
    const contestType = getContestType(it.contest);
    const typeIcon = document.createElement("span");
    typeIcon.className = `cache-icon active contest-${contestType}`;
    if (contestType === 'marathon') {
      typeIcon.textContent = "AHC";
      typeIcon.title = "マラソン系コンテスト";
      typeIcon.setAttribute("aria-label", "マラソン系コンテスト");
    } else {
      typeIcon.textContent = "Algo";
      typeIcon.title = "アルゴリズム系コンテスト";
      typeIcon.setAttribute("aria-label", "アルゴリズム系コンテスト");
    }
    icons.appendChild(typeIcon);
    const aiInfo = getAiModelDisplayInfo(it.aiProvider, it.aiModel);
    icons.appendChild(createCacheDataIcon(aiInfo.label, aiInfo.active, aiInfo.title, aiInfo.className));
    const hasJson = it.hasJson !== undefined ? Boolean(it.hasJson) : true;
    const hasPrompt = Boolean(it.hasPrompt) || hasJson;
    const hasMarkdown = Boolean(it.hasMarkdown);
    const hasHtml = Boolean(it.hasHtml) || hasMarkdown;
    icons.appendChild(createCacheDataIcon("JSON", hasJson, "クロールデータ (.json)"));
    icons.appendChild(createCacheDataIcon("TXT", hasPrompt, hasPrompt ? "プロンプト (.txt)" : "プロンプト (.txt)"));
    icons.appendChild(createCacheDataIcon("MD", hasMarkdown, "添削レポート (.md)"));
    icons.appendChild(createCacheDataIcon("HTML", hasHtml, "添削レポート (.html)"));
    meta.appendChild(icons);
    const actions = document.createElement("div");
    actions.className = "cache-actions";
    const reviewId = it.reviewId || null;
    const exportIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v10"/><path d="M8 10l4 4 4-4"/><path d="M4 20h16"/></svg>`;
    const deleteIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
    const btnExport = document.createElement("button");
    btnExport.className = "ghost small-btn icon-btn";
    btnExport.innerHTML = exportIcon;
    btnExport.title = "エクスポート";
    btnExport.setAttribute("aria-label", "エクスポート");
    btnExport.addEventListener("click", async () => {
      btnExport.disabled = true;
      try {
        const exportSelfUser = resolveCacheSelfUser(it);
        const ck = it.cacheKey;
        const reviewRes = await chrome.runtime.sendMessage({
          type: "get_cached_review",
          contest: it.contest,
          selfUser: exportSelfUser,
          cacheKey: ck,
          reviewId
        });
        if (reviewRes?.ok && reviewRes?.markdown && !reviewRes?.html) {
          const html = await generateReviewHtml(reviewRes.markdown, it.contest);
          const saveMsg = {
            type: "save_review_cache",
            contest: it.contest,
            selfUser: exportSelfUser,
            cacheKey: ck,
            markdown: reviewRes.markdown,
            reviewId,
            html
          };
          if (reviewRes.prompt) saveMsg.prompt = reviewRes.prompt;
          if (reviewRes.aiProvider) saveMsg.aiProvider = reviewRes.aiProvider;
          if (reviewRes.aiModel) saveMsg.aiModel = reviewRes.aiModel;
          await chrome.runtime.sendMessage(saveMsg);
        }
        await chrome.runtime.sendMessage({
          type: "export_cached_json",
          contest: it.contest,
          selfUser: exportSelfUser,
          cacheKey: ck,
          reviewId
        });
      } finally {
        btnExport.disabled = false;
      }
    });
    const btnDelete = document.createElement("button");
    btnDelete.className = "ghost small-btn danger icon-btn";
    btnDelete.innerHTML = deleteIcon;
    btnDelete.title = "削除";
    btnDelete.setAttribute("aria-label", "削除");
    btnDelete.addEventListener("click", async () => {
      btnDelete.disabled = true;
      const deleteSelfUser = resolveCacheSelfUser(it);
      await chrome.runtime.sendMessage({
        type: "delete_export",
        contest: it.contest,
        selfUser: deleteSelfUser,
        cacheKey: it.cacheKey,
        reviewId
      });
      await loadCacheList();
    });
    actions.appendChild(btnExport);
    actions.appendChild(btnDelete);
    row.appendChild(meta);
    row.appendChild(actions);
    cacheEls.cacheList.appendChild(row);
  }
}

async function loadCacheList() {
  if (!cacheEls.cacheList) return;
  try {
    const res = await chrome.runtime.sendMessage({ type: "list_exports" });
    cacheState.loaded = true;
    renderCacheList(res?.list || []);
  } catch {
    renderCacheList([]);
  }
}


function mergeAiSettings(saved = {}) {
  return {
    ...saved,
    provider: saved.provider || DEFAULT_AI_SETTINGS.provider,
    models: { ...DEFAULT_AI_SETTINGS.models, ...(saved.models || {}) },
    apiKeys: { ...DEFAULT_AI_SETTINGS.apiKeys, ...(saved.apiKeys || {}) },
    promptTemplate: saved.promptTemplate
  };
}

async function loadAiSettings() {
  const data = await chrome.storage.local.get("ai_settings");
  const saved = data.ai_settings || {};
  const merged = mergeAiSettings(saved);
  const needsPersist = !saved.provider || !saved.models;
  if (needsPersist) {
    await chrome.storage.local.set({ ai_settings: merged });
  }
  refreshAiState(merged);
  return merged;
}

async function saveAiSettings(partial = {}) {
  const current = await loadAiSettings();
  const merged = {
    ...current,
    ...partial,
    models: { ...current.models, ...(partial.models || {}) },
    apiKeys: { ...current.apiKeys, ...(partial.apiKeys || {}) }
  };
  await chrome.storage.local.set({ ai_settings: merged });
  return merged;
}

function setSelectValue(selectEl, value) {
  if (!selectEl) return;
  const exists = Array.from(selectEl.options).some((o) => o.value === value);
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    selectEl.appendChild(opt);
  }
  selectEl.value = value;
}

function setModelSelect(provider, settings) {
  const sel = document.getElementById("model");
  if (!sel) return null;
  const options = MODEL_OPTIONS[provider] || [];
  sel.innerHTML = "";
  for (const v of options) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  }
  const last = settings.models?.[provider];
  const fallback = options[0] || "";
  const chosen = options.includes(last) ? last : fallback;
  if (chosen) sel.value = chosen;
  return chosen;
}

function applyAiControls(settings) {
  const providerSel = document.getElementById("provider");
  const provider = settings.provider || DEFAULT_AI_SETTINGS.provider;
  setSelectValue(providerSel, provider);
  setModelSelect(provider, settings);
}

function providerDisplayName(id) {
  return { openai: "ChatGPT", gemini: "Gemini", claude: "Claude" }[id] || id || "AI";
}

function refreshAiState(settings) {
  const provider = settings.provider || DEFAULT_AI_SETTINGS.provider;
  const keys = settings.apiKeys || {};
  const hasAnyKey = Object.values(keys).some((k) => k && String(k).trim().length);
  const providerHasKey = Boolean(keys[provider] && String(keys[provider]).trim().length);
  aiState = { hasAnyKey, providerHasKey, provider };
}

function updateAiButtons(opts = {}) {
  const btnReview = document.getElementById("btnRunAllReview");
  const busy = Boolean(window.__busyFlag);
  const hasContest = opts.hasContest !== undefined ? opts.hasContest : window.__hasContest;
  const disableAi = busy || !aiState.hasAnyKey || !aiState.providerHasKey || !hasContest;
  if (btnReview) btnReview.disabled = disableAi;

  if (!busy) {
    if (!aiState.hasAnyKey) {
      setStatus("APIキーが未設定です。オプションで設定してください。", true);
    } else if (!aiState.providerHasKey) {
      setStatus(`選択中のプロバイダー (${providerDisplayName(aiState.provider)}) のAPIキーが未設定です。`, true);
    } else if (opts.resetOk) {
      setStatus("Ready", false);
    }
  }
}

function keepPopupOpenWhileRunning() {
  const refocus = () => {
    if (document.body.classList.contains("busy")) {
      window.focus();
    }
  };
  window.addEventListener("blur", refocus);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") refocus();
  });
}

async function loadAiSummary() {
  try {
    const s = await loadAiSettings();
    applyAiControls(s);
    updateAiButtons({ resetOk: true });
  } catch {
  }
}

function getCurrentSelfUser() {
  const input = document.getElementById("selfUser");
  const raw = input?.value || "";
  const cleaned = sanitizeSelfUser(raw);
  if (input && raw !== cleaned) input.value = cleaned;
  return normalizeSelfUser(cleaned);
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

const ALLOWED_HTML_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul"
]);

const STRIP_HTML_TAGS = new Set([
  "base",
  "embed",
  "iframe",
  "link",
  "meta",
  "object",
  "script",
  "style",
  "template"
]);

const GLOBAL_ALLOWED_ATTRS = new Set(["class"]);
const TAG_ALLOWED_ATTRS = {
  a: new Set(["href", "title", "target", "rel"]),
  th: new Set(["colspan", "rowspan", "align"]),
  td: new Set(["colspan", "rowspan", "align"])
};

function isSafeHref(value) {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function unwrapNode(node) {
  const parent = node.parentNode;
  if (!parent) return;
  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }
  parent.removeChild(node);
}

function sanitizeHtml(inputHtml) {
  if (!inputHtml) return "";
  const template = document.createElement("template");
  template.innerHTML = inputHtml;

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const tag = node.tagName.toLowerCase();
    if (!ALLOWED_HTML_TAGS.has(tag)) {
      if (STRIP_HTML_TAGS.has(tag)) {
        node.remove();
      } else {
        unwrapNode(node);
      }
      continue;
    }

    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith("on") || name === "style") {
        node.removeAttribute(attr.name);
        continue;
      }
      if (name === "href") {
        if (!isSafeHref(value)) {
          node.removeAttribute(attr.name);
          continue;
        }
      }
      const allowed =
        GLOBAL_ALLOWED_ATTRS.has(name)
        || (TAG_ALLOWED_ATTRS[tag] && TAG_ALLOWED_ATTRS[tag].has(name));
      if (!allowed) node.removeAttribute(attr.name);
    }

    if (tag === "a") {
      if (node.hasAttribute("href")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      } else {
        node.removeAttribute("target");
        node.removeAttribute("rel");
      }
    }
  }

  return template.innerHTML;
}

function normalizeCodeLanguage(raw) {
  if (!raw) return "";
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return "";
  let mapped = cleaned;
  if (cleaned === "c#" || cleaned === "cs") mapped = "csharp";
  else if (cleaned === "c++" || cleaned === "cpp" || cleaned === "cxx" || cleaned.startsWith("c++")) mapped = "cpp";
  else if (cleaned === "js") mapped = "javascript";
  else if (cleaned === "ts") mapped = "typescript";
  else if (cleaned === "py" || cleaned === "py3" || cleaned === "python3") mapped = "python";
  else if (cleaned === "rb") mapped = "ruby";
  else if (cleaned === "sh" || cleaned === "shell" || cleaned === "zsh") mapped = "bash";
  else if (cleaned === "txt" || cleaned === "text" || cleaned === "plain") mapped = "plaintext";
  return mapped.replace(/[^a-z0-9_-]/g, "");
}

function markdownToHtml(markdown) {
  if (!markdown) return "";
  let html = markdown;

  // エスケープが必要な部分を一時的に保護
  const codeBlocks = [];
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const normalized = match.replace(/\r\n/g, "\n");
    const firstLine = normalized.split("\n")[0] || "";
    const lang = firstLine.replace(/^```/, "").trim();
    codeBlocks.push({ raw: normalized, lang });
    return `\n___CODEBLOCK_${codeBlocks.length - 1}___\n`;
  });

  const inlineCodes = [];
  html = html.replace(/`([^`]+)`/g, (match, code) => {
    inlineCodes.push(code);
    return `___INLINECODE_${inlineCodes.length - 1}___`;
  });

  const mathBlocks = [];
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, body) => {
    mathBlocks.push(body);
    return `\n___MATHBLOCK_${mathBlocks.length - 1}___\n`;
  });

  const lines = html.split('\n');
  const result = [];
  let inList = false;
  let inTable = false;
  let tableRows = [];
  let isFirstTableRow = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // テーブル処理
    if (trimmed.match(/^\|.*\|$/)) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
        isFirstTableRow = true;
      }
      // 区切り行（:---など）はスキップ
      if (trimmed.match(/^\|[\s:-]+\|$/)) {
        continue;
      }
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
      const tag = isFirstTableRow ? 'th' : 'td';
      tableRows.push('<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>');
      isFirstTableRow = false;
      continue;
    } else if (inTable) {
      result.push('<table>' + tableRows.join('') + '</table>');
      inTable = false;
      tableRows = [];
      isFirstTableRow = true;
    }

    // リスト処理
    const listMatch = trimmed.match(/^(\*|-|\d+\.)\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        inList = true;
        result.push('<ul>');
      }
      result.push(`<li>${listMatch[2]}</li>`);
      continue;
    } else if (inList) {
      result.push('</ul>');
      inList = false;
    }

    // 見出し
    if (trimmed.match(/^###### /)) {
      result.push(trimmed.replace(/^###### (.+)$/, '<h6>$1</h6>'));
      continue;
    }
    if (trimmed.match(/^##### /)) {
      result.push(trimmed.replace(/^##### (.+)$/, '<h5>$1</h5>'));
      continue;
    }
    if (trimmed.match(/^#### /)) {
      result.push(trimmed.replace(/^#### (.+)$/, '<h4>$1</h4>'));
      continue;
    }
    if (trimmed.match(/^### /)) {
      result.push(trimmed.replace(/^### (.+)$/, '<h3>$1</h3>'));
      continue;
    }
    if (trimmed.match(/^## /)) {
      result.push(trimmed.replace(/^## (.+)$/, '<h2>$1</h2>'));
      continue;
    }
    if (trimmed.match(/^# /)) {
      result.push(trimmed.replace(/^# (.+)$/, '<h1>$1</h1>'));
      continue;
    }

    // 水平線
    if (trimmed === '---' || trimmed === '***') {
      result.push('<hr>');
      continue;
    }

    // 空行
    if (trimmed === '') {
      result.push('');
      continue;
    }

    // 通常のテキスト行
    result.push(line);
  }

  // 最後のリストやテーブルを閉じる
  if (inList) result.push('</ul>');
  if (inTable) result.push('<table>' + tableRows.join('') + '</table>');

  html = result.join('\n');

  // 太字
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // リンク
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // 数式ブロックを復元
  mathBlocks.forEach((body, i) => {
    const escaped = escapeHtml(body);
    html = html.replace(`___MATHBLOCK_${i}___`, `<div class="math-block">$$${escaped}$$</div>`);
  });

  // 段落化（連続する行をpタグで囲む）
  const paragraphs = html.split('\n\n');
  html = paragraphs.map(para => {
    const trimmed = para.trim();
    if (!trimmed) return '';
    if (trimmed.match(/^<(h[1-6]|ul|ol|table|hr|pre|div)/)) return trimmed;
    const lines = trimmed.split('\n').filter(l => l.trim());
    if (lines.length === 0) return '';
    return '<p>' + lines.join('<br>') + '</p>';
  }).join('\n');

  // コードブロックを復元
  codeBlocks.forEach((block, i) => {
    const match = block.raw.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
    const code = match ? match[1] : block.raw.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
    const lang = normalizeCodeLanguage(block.lang);
    const classAttr = lang ? ` class="language-${lang}"` : "";
    html = html.replace(`___CODEBLOCK_${i}___`, `<pre><code${classAttr}>${escapeHtml(code)}</code></pre>`);
  });

  // インラインコードを復元
  inlineCodes.forEach((code, i) => {
    html = html.replace(`___INLINECODE_${i}___`, `<code>${escapeHtml(code)}</code>`);
  });

  return html;
}

function renderMarkdownWithKatex(markdown) {
  const html = sanitizeHtml(markdownToHtml(markdown));
  try {
    const container = document.createElement("div");
    container.innerHTML = html;
    if (typeof renderMathInElement === "function") {
      renderMathInElement(container, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false }
        ],
        throwOnError: false
      });
    }
    if (typeof hljs === "object" && typeof hljs.highlightElement === "function") {
      const blocks = container.querySelectorAll("pre code");
      blocks.forEach((block) => {
        const match = block.className.match(/\blanguage-([a-z0-9_-]+)\b/);
        if (match && typeof hljs.getLanguage === "function" && !hljs.getLanguage(match[1])) {
          block.classList.remove(`language-${match[1]}`);
        }
        try {
          hljs.highlightElement(block);
        } catch {
        }
      });
    }
    return container.innerHTML;
  } catch {
    return html;
  }
}

let katexCssInlinePromise = null;
async function getKatexInlineCss() {
  if (katexCssInlinePromise) return katexCssInlinePromise;
  katexCssInlinePromise = (async () => {
    const cssUrl = chrome.runtime.getURL("vendor/katex/katex.min.css");
    let cssText = await fetch(cssUrl).then(r => r.text());
    const fontMatches = Array.from(new Set(cssText.match(/fonts\/[^)]+\.woff2/g) || []));
    const fontMap = {};
    await Promise.all(fontMatches.map(async (path) => {
      const url = chrome.runtime.getURL(`vendor/katex/${path}`);
      const buf = await fetch(url).then(r => r.arrayBuffer());
      let binary = "";
      const bytes = new Uint8Array(buf);
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const b64 = btoa(binary);
      fontMap[path] = `data:font/woff2;base64,${b64}`;
    }));
    for (const path of fontMatches) {
      const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      cssText = cssText.replace(new RegExp(`url\\(${escaped}\\)`, "g"), `url(${fontMap[path]})`);
    }
    return cssText;
  })();
  return katexCssInlinePromise;
}

let highlightCssInlinePromise = null;
async function getHighlightInlineCss() {
  if (highlightCssInlinePromise) return highlightCssInlinePromise;
  highlightCssInlinePromise = (async () => {
    try {
      const cssUrl = chrome.runtime.getURL("vendor/highlightjs/styles/github.min.css");
      return await fetch(cssUrl).then(r => r.text());
    } catch {
      return "";
    }
  })();
  return highlightCssInlinePromise;
}

async function generateReviewHtml(markdown, contest) {
  const bodyHtml = renderMarkdownWithKatex(markdown);
  const katexCss = await getKatexInlineCss();
  const highlightCss = await getHighlightInlineCss();
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src data:; connect-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AtCoder ${contest} - AI添削レポート</title>
  <style>
    ${katexCss}
    ${highlightCss}
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #fafbfc;
      color: #333;
      line-height: 1.7;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      margin: 24px 0 12px 0;
      color: #111;
      border-bottom: 3px solid #0b63d1;
      padding-bottom: 8px;
    }
    h2 {
      font-size: 22px;
      font-weight: 600;
      margin: 20px 0 10px 0;
      color: #222;
      border-left: 4px solid #0b63d1;
      padding-left: 12px;
    }
    h3 {
      font-size: 18px;
      font-weight: 600;
      margin: 16px 0 8px 0;
      color: #333;
    }
    h4 {
      font-size: 16px;
      font-weight: 600;
      margin: 14px 0 6px 0;
      color: #333;
    }
    h5, h6 {
      font-size: 14px;
      font-weight: 600;
      margin: 12px 0 6px 0;
      color: #444;
    }
    p {
      margin: 12px 0;
      color: #333;
    }
    ul, ol {
      margin: 12px 0;
      padding-left: 28px;
    }
    li {
      margin: 6px 0;
      color: #333;
    }
    code {
      background: #f0f1f4;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 13px;
      color: #c7254e;
    }
    pre {
      background: #f6f8fa;
      color: inherit;
      padding: 0;
      border-radius: 8px;
      overflow-x: auto;
      margin: 16px 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    pre code {
      background: transparent;
      padding: 0;
      color: inherit;
      font-size: 13px;
    }
    a {
      color: #0b63d1;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    th, td {
      border: 1px solid #e6e8ef;
      padding: 10px 12px;
      text-align: left;
    }
    th {
      background: #f6f7f9;
      font-weight: 600;
      color: #111;
    }
    hr {
      border: none;
      border-top: 2px solid #e6e8ef;
      margin: 24px 0;
    }
    blockquote {
      border-left: 4px solid #0b63d1;
      padding-left: 16px;
      margin: 16px 0;
      color: #555;
      font-style: italic;
    }
    strong {
      font-weight: 600;
      color: #111;
    }
    .math-block {
      margin: 12px 0;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

async function ensureAiConfigured() {
  const s = await loadAiSettings();
  const provider = s.provider;
  const model = (s.models && s.models[provider]) || s.model;
  const key = s.apiKeys && (s.apiKeys[provider] || "").trim();
  if (!provider || !model || !key) {
    const reason = !provider ? "プロバイダが未設定です" :
      (!model ? "モデルが未設定です" : "APIキーが未設定です");
    throw new Error(`AI設定を確認してください (${reason})`);
  }
  return { provider, model, key };
}

document.addEventListener("DOMContentLoaded", async () => {
  keepPopupOpenWhileRunning();
  let currentMode = null; // 'data-only' or 'with-review'
  // オプションはコンテストページ外でも開けるように、最優先でバインドする
  document.getElementById("btnOpenSettings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  cacheElements();
  if (cacheEls.btnCacheRefresh) cacheEls.btnCacheRefresh.addEventListener("click", loadCacheList);
  if (cacheEls.btnCacheExportAll) {
    cacheEls.btnCacheExportAll.addEventListener("click", async () => {
      cacheEls.btnCacheExportAll.disabled = true;
      try {
        setStatus("全件エクスポート中…");
        const res = await chrome.runtime.sendMessage({ type: "list_exports" });
        const list = res?.list || [];
        for (const it of list) {
          const reviewId = it.reviewId || null;
          const reviewRes = await chrome.runtime.sendMessage({
            type: "get_cached_review",
            contest: it.contest,
            selfUser: it.selfUser || null,
            reviewId
          });
          if (reviewRes?.ok && reviewRes?.markdown && !reviewRes?.html) {
            const html = await generateReviewHtml(reviewRes.markdown, it.contest);
            const saveMsg = {
              type: "save_review_cache",
              contest: it.contest,
              selfUser: it.selfUser || null,
              markdown: reviewRes.markdown,
              reviewId,
              html
            };
            if (reviewRes.prompt) saveMsg.prompt = reviewRes.prompt;
            if (reviewRes.aiProvider) saveMsg.aiProvider = reviewRes.aiProvider;
            if (reviewRes.aiModel) saveMsg.aiModel = reviewRes.aiModel;
            await chrome.runtime.sendMessage(saveMsg);
          }
        }
        const exportRes = await chrome.runtime.sendMessage({ type: "export_all_cached_zip" });
        if (exportRes?.ok) {
          setStatus("全件エクスポートを開始しました");
        } else {
          setStatus(exportRes?.error || "全件エクスポートに失敗しました", true);
        }
      } catch (e) {
        setStatus(String(e?.message || e), true);
      } finally {
        cacheEls.btnCacheExportAll.disabled = false;
      }
    });
  }
  if (cacheEls.btnCacheDeleteAll) {
    cacheEls.btnCacheDeleteAll.addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "clear_exports" });
      await loadCacheList();
    });
  }
  if (cacheEls.btnCachePrev) {
    cacheEls.btnCachePrev.addEventListener("click", () => {
      if (cacheState.page > 0) {
        cacheState.page -= 1;
        renderCacheList(cacheState.items);
      }
    });
  }
  if (cacheEls.btnCacheNext) {
    cacheEls.btnCacheNext.addEventListener("click", () => {
      const maxPage = Math.max(0, Math.ceil(cacheState.items.length / cacheState.pageSize) - 1);
      if (cacheState.page < maxPage) {
        cacheState.page += 1;
        renderCacheList(cacheState.items);
      }
    });
  }

  const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
  const tabMain = document.getElementById("tab-main");
  const tabHistory = document.getElementById("tab-history");
  const setActiveTab = (name) => {
    tabButtons.forEach((btn) => {
      const active = btn.dataset.tab === name;
      btn.classList.toggle("active", active);
    });
    if (tabMain) tabMain.hidden = name !== "main";
    if (tabHistory) tabHistory.hidden = name !== "history";
    if (name === "history" && !cacheState.loaded) loadCacheList();
  };
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });
  setActiveTab("main");
  const selfUserEl = document.getElementById("selfUser");
  if (selfUserEl) {
    const sanitizeInput = () => {
      const cleaned = sanitizeSelfUser(selfUserEl.value);
      if (selfUserEl.value !== cleaned) {
        selfUserEl.value = cleaned;
        const pos = cleaned.length;
        if (selfUserEl.setSelectionRange) selfUserEl.setSelectionRange(pos, pos);
      }
    };
    selfUserEl.addEventListener("input", sanitizeInput);
    selfUserEl.addEventListener("blur", sanitizeInput);
  }
  const tab = await getActiveTab();
  const contest = await getContestFromTab(tab);
  document.getElementById("contest").textContent = contest || "-";
  setBusy(false);
  const hasContest = Boolean(contest);
  window.__hasContest = hasContest;
  setContestControlsEnabled(hasContest);
  if (!hasContest) {
    setStatus("AtCoderの /contests/<id>/... を開いてください", true);
  }

  try {
    if (hasContest) {
      const data = await chrome.storage.local.get("progress_state");
      const state = data.progress_state || {};
      const saved = state[contest];
      if (saved) {
        if (saved.text) setStatus(saved.text, Boolean(saved.isError));
        if (saved.progress !== undefined && saved.progress !== null) {
          setProgress(saved.progress);
        }
        if (saved.running) {
          setBusy(true);
          currentMode = saved.mode || null;
        }
        // ポップアップを閉じて再度開いた場合の復元処理
        if (saved.done && !saved.isError && saved.mode) {
          console.log("Restoring completed state, mode:", saved.mode);
          currentMode = saved.mode;
          if (saved.mode === 'data-only') {
            // データ取得完了後の処理を実行
            setTimeout(() => handleDataOnlyComplete(contest), 100);
          } else if (saved.mode === 'with-review') {
            // AI添削は既に完了しているはずなので、特に何もしない
            // （review_completeメッセージは既に送られているが、ポップアップが閉じていた）
            setTimeout(async () => {
              try {
                const res = await chrome.runtime.sendMessage({
                  type: "get_cached_review",
                  contest,
                  selfUser: saved.selfUser ?? getCurrentSelfUser()
                });
                if (res?.ok && res?.markdown) {
                  showReviewResult(res.markdown, contest);
                  setStatus("AI添削が完了しました");
                  if (!res.html) {
                    const html = await generateReviewHtml(res.markdown, contest);
                    const saveMsg = {
                      type: "save_review_cache",
                      contest,
                      selfUser: saved.selfUser ?? getCurrentSelfUser(),
                      markdown: res.markdown,
                      prompt: res.prompt || null,
                      html
                    };
                    if (res.aiProvider) saveMsg.aiProvider = res.aiProvider;
                    if (res.aiModel) saveMsg.aiModel = res.aiModel;
                    await chrome.runtime.sendMessage(saveMsg);
                  }
                }
              } catch {
              }
            }, 100);
          }
        }
      }
    }
  } catch {
    // ignore storage errors
  }

  // 比較対象モードの設定を復元
  try {
    const appData = await chrome.storage.local.get("app_settings");
    const savedAppSettings = appData.app_settings || {};
    restoreTargetSettings(savedAppSettings);
  } catch {
    // ignore storage errors
  }

  // モード切替・パラメータ変更時に設定を保存
  const targetModeEl = document.getElementById("targetMode");
  if (targetModeEl) {
    targetModeEl.addEventListener("change", () => {
      showTargetOptions(targetModeEl.value);
      saveTargetSettings();
    });
  }
  ["absK", "absN", "relK", "relN"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", saveTargetSettings);
  });
  const manualUsersEl = document.getElementById("manualUsers");
  if (manualUsersEl) manualUsersEl.addEventListener("blur", saveTargetSettings);

  loadAiSummary();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "review_complete" && msg?.contest === contest) {
      if (msg?.markdown) {
        showReviewResult(msg.markdown, contest);
        setStatus("AI添削が完了しました");
        const reviewSelfUser = msg.selfUser ?? getCurrentSelfUser();
        (async () => {
          try {
            const html = await generateReviewHtml(msg.markdown, contest);
            const saveMsg = {
              type: "save_review_cache",
              contest,
              selfUser: reviewSelfUser,
              markdown: msg.markdown,
              prompt: msg.prompt || null,
              html
            };
            if (msg.aiProvider) saveMsg.aiProvider = msg.aiProvider;
            if (msg.aiModel) saveMsg.aiModel = msg.aiModel;
            await chrome.runtime.sendMessage(saveMsg);
            cacheState.loaded = false;
            if (tabHistory && !tabHistory.hidden) loadCacheList();
          } catch {
          }
        })();
      }
      currentMode = null;
      return;
    }
    if (msg?.type !== "progress" || msg?.contest !== contest) return;
    setStatus(msg.text || "取得中…", Boolean(msg.isError));
    if (msg.progress !== undefined && msg.progress !== null) {
      setProgress(msg.progress);
    }
    persistProgress(contest, {
      text: msg.text || "取得中…",
      isError: Boolean(msg.isError),
      done: Boolean(msg.done),
      running: !msg.done,
      progress: msg.progress
    }, currentMode);
    if (msg.done) {
      setBusy(false);
      cacheState.loaded = false;
      if (tabHistory && !tabHistory.hidden) loadCacheList();
      // データ取得完了時の処理
      console.log("Data fetch done. currentMode:", currentMode, "isError:", msg.isError);
      if (currentMode === 'data-only' && !msg.isError) {
        handleDataOnlyComplete(contest);
      } else if (currentMode === 'data-only' && msg.isError) {
        // エラーで終了した場合もモードをクリア
        currentMode = null;
      }
    }
  });

  async function handleDataOnlyComplete(contest) {
    console.log("handleDataOnlyComplete called for contest:", contest);
    try {
      setStatus("プロンプトを生成中…");
      // キャッシュ保存が完全に完了するまで少し待つ
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log("Requesting prompt from service worker...");
      const res = await chrome.runtime.sendMessage({
        type: "get_prompt",
        contest,
        selfUser: getCurrentSelfUser()
      });
      console.log("get_prompt response:", res);

      if (res?.ok && res?.prompt) {
        console.log("Showing prompt result, length:", res.prompt.length);
        showPromptResult(res.prompt, contest);
        setStatus("プロンプトを生成しました");
      } else {
        console.error("get_prompt failed:", res);
        setStatus(res?.error || "プロンプトの生成に失敗しました", true);
      }
    } catch (e) {
      console.error("handleDataOnlyComplete error:", e);
      setStatus(String(e?.message || e), true);
    } finally {
      currentMode = null;
    }
  }

  function showPromptResult(prompt, contest) {
    console.log("showPromptResult called");
    const resultCard = document.getElementById("resultCard");
    const promptResult = document.getElementById("promptResult");
    const reviewResult = document.getElementById("reviewResult");
    const promptTextarea = document.getElementById("promptTextarea");

    console.log("DOM elements:", { resultCard, promptResult, reviewResult, promptTextarea });
    promptTextarea.value = prompt;
    promptResult.hidden = false;
    reviewResult.hidden = true;
    resultCard.hidden = false;
    console.log("Prompt result displayed");

    // ダウンロードボタンの設定
    const btnDownload = document.getElementById("btnDownloadPrompt");
    if (btnDownload) {
      btnDownload.onclick = () => downloadPromptZip(prompt, contest);
    }
  }

  function showReviewResult(markdown, contest) {
    const resultCard = document.getElementById("resultCard");
    const promptResult = document.getElementById("promptResult");
    const reviewResult = document.getElementById("reviewResult");
    const reviewHtmlContainer = document.getElementById("reviewHtmlContainer");

    const html = renderMarkdownWithKatex(markdown);
    reviewHtmlContainer.innerHTML = html;
    promptResult.hidden = true;
    reviewResult.hidden = false;
    resultCard.hidden = false;

    // スクロール位置をリセット
    reviewHtmlContainer.scrollTop = 0;
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;

    // ダウンロードボタンの設定
    const btnDownload = document.getElementById("btnDownloadReview");
    const btnOpen = document.getElementById("btnOpenReview");

    btnDownload.onclick = () => downloadReviewZip(markdown, contest);
    btnOpen.onclick = () => openReviewInNewTab(markdown, contest);
  }

  async function downloadReviewZip(markdown, contest) {
    try {
      setStatus("ZIPを準備中…");
      // 既存のキャッシュからaiProvider/aiModelを取得
      const cached = await chrome.runtime.sendMessage({
        type: "get_cached_review",
        contest,
        selfUser: getCurrentSelfUser()
      });
      // markdownとhtmlをキャッシュに保存
      const html = await generateReviewHtml(markdown, contest);
      const saveMsg = {
        type: "save_review_cache",
        contest,
        selfUser: getCurrentSelfUser(),
        markdown: markdown,
        html
      };
      if (cached?.prompt) saveMsg.prompt = cached.prompt;
      if (cached?.aiProvider) saveMsg.aiProvider = cached.aiProvider;
      if (cached?.aiModel) saveMsg.aiModel = cached.aiModel;
      await chrome.runtime.sendMessage(saveMsg);

      // zipエクスポートを実行
      const res = await chrome.runtime.sendMessage({
        type: "export_cached_json",
        contest,
        selfUser: getCurrentSelfUser()
      });

      if (res?.ok) {
        setStatus("ZIPをダウンロードしました");
      } else {
        setStatus(res?.error || "ZIPのダウンロードに失敗しました", true);
      }
    } catch (e) {
      setStatus(String(e?.message || e), true);
    }
  }

  async function downloadPromptZip(prompt, contest) {
    try {
      setStatus("ZIPを準備中…");
      // promptをキャッシュに保存（データ収集のみの場合）
      await chrome.runtime.sendMessage({
        type: "save_review_cache",
        contest,
        selfUser: getCurrentSelfUser(),
        prompt: prompt
      });

      // zipエクスポートを実行
      const res = await chrome.runtime.sendMessage({
        type: "export_cached_json",
        contest,
        selfUser: getCurrentSelfUser()
      });

      if (res?.ok) {
        setStatus("ZIPをダウンロードしました");
      } else {
        setStatus(res?.error || "ZIPのダウンロードに失敗しました", true);
      }
    } catch (e) {
      setStatus(String(e?.message || e), true);
    }
  }

  async function openReviewInNewTab(markdown, contest) {
    const html = await generateReviewHtml(markdown, contest);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    chrome.tabs.create({ url }, () => {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
  }

  document.getElementById("btnRunAll").addEventListener("click", async () => {
    try {
      const targetConfig = readTargetConfig();
      currentMode = 'data-only';
      // 結果エリアを非表示にする
      document.getElementById("resultCard").hidden = true;
      setBusy(true);
      setStatus("取得を開始しました…");
      setProgress(0);
      persistProgress(contest, {
        text: "取得を開始しました…",
        isError: false,
        done: false,
        running: true,
        progress: 0,
        selfUser: getCurrentSelfUser()
      }, 'data-only');
      const res = await sendToTab(tab.id, {
        type: "start_run_all",
        contest,
        topN: targetConfig.n,
        targetConfig,
        selfUser: getCurrentSelfUser()
      });
      if (!res?.ok) {
        setBusy(false);
        setStatus(res?.error || "取得に失敗しました", true);
        currentMode = null;
      }
    } catch (e) {
      setBusy(false);
      setStatus(String(e?.message || e), true);
      currentMode = null;
    }
  });

  document.getElementById("btnRunAllReview").addEventListener("click", async () => {
    try {
      await ensureAiConfigured();
    } catch (e) {
      setStatus(String(e?.message || e), true);
      return;
    }
    try {
      const targetConfig = readTargetConfig();
      currentMode = 'with-review';
      // 結果エリアを非表示にする
      document.getElementById("resultCard").hidden = true;
      setBusy(true);
      setStatus("取得を開始しました…");
      setProgress(0);
      persistProgress(contest, {
        text: "取得を開始しました…",
        isError: false,
        done: false,
        running: true,
        progress: 0,
        selfUser: getCurrentSelfUser()
      }, 'with-review');
      const res = await sendToTab(tab.id, {
        type: "start_run_all",
        contest,
        topN: targetConfig.n,
        targetConfig,
        selfUser: getCurrentSelfUser(),
        withReview: true
      });
      if (!res?.ok) {
        setBusy(false);
        setStatus(res?.error || "取得に失敗しました", true);
        currentMode = null;
      }
    } catch (e) {
      setBusy(false);
      setStatus(String(e?.message || e), true);
      currentMode = null;
    }
  });

  document.getElementById("provider").addEventListener("change", async (e) => {
    const provider = e.target.value;
    const settings = await loadAiSettings();
    const model = setModelSelect(provider, settings);
    const merged = await saveAiSettings({ provider, models: { [provider]: model } });
    refreshAiState(merged);
    updateAiButtons({ resetOk: true });
  });
  document.getElementById("model").addEventListener("change", async (e) => {
    const provider = document.getElementById("provider").value;
    const merged = await saveAiSettings({ models: { [provider]: e.target.value } });
    refreshAiState(merged);
    updateAiButtons({ resetOk: true });
  });

  document.getElementById("btnCancel").addEventListener("click", async () => {
    try {
      setStatus("中止しています…");
      const tasks = [];
      if (tab?.id) {
        tasks.push(sendToTab(tab.id, { type: "cancel_run_all", contest }));
      }
      tasks.push(chrome.runtime.sendMessage({ type: "cancel_ai_review", contest }));
      await Promise.allSettled(tasks);
      await clearProgressState(contest);
      setBusy(false);
      setProgress(0);
      setStatus("Ready");
    } catch (e) {
      setBusy(false);
      setStatus(`中止に失敗しました: ${String(e?.message || e)}`, true);
    }
  });

  document.getElementById("btnCopyPrompt")?.addEventListener("click", async () => {
    const textarea = document.getElementById("promptTextarea");
    if (!textarea || !textarea.value) return;
    try {
      await navigator.clipboard.writeText(textarea.value);
      const btn = document.getElementById("btnCopyPrompt");
      const originalText = btn.textContent;
      btn.textContent = "コピーしました！";
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    } catch (e) {
      setStatus("クリップボードへのコピーに失敗しました", true);
    }
  });

  document.getElementById("btnDownloadJson")?.addEventListener("click", async () => {
    try {
      setStatus("JSONをダウンロード中…");
      const res = await chrome.runtime.sendMessage({
        type: "export_json",
        contest,
        selfUser: getCurrentSelfUser()
      });
      if (res?.ok) {
        setStatus("JSONをダウンロードしました");
      } else {
        setStatus(res?.error || "JSONのダウンロードに失敗しました", true);
      }
    } catch (e) {
      setStatus(String(e?.message || e), true);
    }
  });

});
