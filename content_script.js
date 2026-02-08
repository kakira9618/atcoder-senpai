/* content_script.js
   Runs on https://atcoder.jp/contests/* and fetches pages using the tab's session.
*/
const ORIGIN = "https://atcoder.jp";
let isRunAllRunning = false;
let currentRunCtx = null;
const contestWindowSent = new Set();

function contestFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/contests\/([^\/]+)(\/|$)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function startRunContext(contest) {
  if (currentRunCtx?.controller) currentRunCtx.controller.abort();
  const controller = new AbortController();
  currentRunCtx = { contest, controller, cancelled: false };
  return currentRunCtx;
}

function cancelRunContext(contest) {
  if (!currentRunCtx) return false;
  if (contest && currentRunCtx.contest && currentRunCtx.contest !== contest) {
    currentRunCtx.cancelled = true;
    if (currentRunCtx.controller) currentRunCtx.controller.abort();
    return false;
  }
  currentRunCtx.cancelled = true;
  if (currentRunCtx.controller) currentRunCtx.controller.abort();
  return true;
}

function getActiveSignal() {
  return currentRunCtx?.controller?.signal || null;
}

function isCancelled() {
  const sig = getActiveSignal();
  return Boolean(currentRunCtx?.cancelled || (sig && sig.aborted));
}

function throwIfCancelled() {
  if (isCancelled()) {
    const err = new Error("RUN_CANCELLED");
    err.name = "RunAllCancelled";
    throw err;
  }
}

function sleep(ms, signal = getActiveSignal()) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const id = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    }
  });
}

function isRunCancelledError(e) {
  return e?.name === "AbortError" || e?.name === "RunAllCancelled";
}

async function fetchWithRetry(url, options = {}, retryOptions = {}) {
  const {
    retries = 3,
    baseDelayMs = 800,
    maxDelayMs = 8000,
    backoffFactor = 2
  } = retryOptions;
  const signal = (options && options.signal) || getActiveSignal();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal });
      if (res.ok) return res;

      const retriable = [429, 500, 502, 503, 504].includes(res.status);
      if (!retriable || attempt >= retries) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") throw e;
      if (attempt >= retries) throw e;
    }

    const delay = Math.min(maxDelayMs, baseDelayMs * (backoffFactor ** attempt));
    const jitter = Math.random() * 200;
    await sleep(delay + jitter, signal);
  }
  throw new Error(`Retry exhausted for ${url}`);
}

async function fetchHtml(pathOrUrl) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : (ORIGIN + pathOrUrl);
  const res = await fetchWithRetry(url, { credentials: "include" });
  return await res.text();
}

function parseDoc(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

function text(el) {
  return (el?.textContent || "").replace(/\s+/g, " ").trim();
}

function unique(arr) {
  return [...new Set(arr)];
}

function parseIsoDateOrNull(str) {
  if (!str) return null;
  const replaced = str.includes("T") ? str : str.replace(" ", "T");
  const d = new Date(replaced);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function extractContestWindowFromHtml(html, doc = null) {
  if (!html) return null;
  const startMatch = html.match(/startTime\s*=\s*moment\("([^"]+)"\)/);
  const endMatch = html.match(/endTime\s*=\s*moment\("([^"]+)"\)/);
  let startAt = startMatch ? parseIsoDateOrNull(startMatch[1]) : null;
  let endAt = endMatch ? parseIsoDateOrNull(endMatch[1]) : null;

  try {
    const d = doc || parseDoc(html);
    if (!startAt || !endAt) {
      const times = Array.from(d.querySelectorAll(".contest-duration time.fixtime-full, .contest-duration time.fixtime"));
      if (times.length >= 2) {
        startAt = startAt || parseIsoDateOrNull(text(times[0]));
        endAt = endAt || parseIsoDateOrNull(text(times[1]));
      }
    }
  } catch {
    // ignore parse failures
  }
  if (startAt && endAt) return { startAt, endAt };
  return null;
}

async function fetchJson(pathOrUrl) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : (ORIGIN + pathOrUrl);
  const res = await fetchWithRetry(url, { credentials: "include", headers: { "Accept": "application/json" } });
  return await res.json();
}

function normalizeSelfUser(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function canonicalUser(value) {
  const n = normalizeSelfUser(value);
  return n ? n.toLowerCase() : null;
}

function getLoginUserFromPage() {
  // AtCoderページのscriptタグから var userScreenName = "..." を抽出
  try {
    for (const script of document.querySelectorAll("script:not([src])")) {
      const m = script.textContent.match(/var\s+userScreenName\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

async function loadAppSettings() {
  try {
    const data = await chrome.storage.local.get("app_settings");
    const s = data.app_settings || {};
    return { selfUser: normalizeSelfUser(s.selfUser) };
  } catch {
    return { selfUser: null };
  }
}

async function storeContestWindow(contest, window) {
  if (!contest || !window || !window.startAt || !window.endAt) return;
  if (contestWindowSent.has(contest)) return;
  try {
    await chrome.runtime.sendMessage({ type: "set_contest_window", contest, window });
    contestWindowSent.add(contest);
  } catch {
    // ignore send failures
  }
}

function clampProgress(value) {
  return Math.max(0, Math.min(100, Number(value)));
}

function progressParts(topN, withReview = false) {
  const n = Math.max(1, Math.min(5, Math.floor(Number(topN) || 1)));
  // Stage 1: 自分の提出を取得
  const baseStage1 = 80 * (1 / (n + 1));
  // Stage 2: 問題を取得
  const baseStage2 = 15;
  // Stage 3: 順位表から上位ユーザー名を取得
  const baseStage3 = 5;
  // Stage 4: 上位ユーザーの提出を取得
  const baseStage4 = 80 * (n / (n + 1));
  if (withReview) {
    const scale = 0.85; // keep collection at 85%, reserve 15% for export/review
    return {
      stage1: baseStage1 * scale,
      stage2: baseStage2 * scale,
      stage3: baseStage3 * scale,
      stage4: baseStage4 * scale,
      stageExport: 5,
      stageReview: 10
    };
  }
  return { stage1: baseStage1, stage2: baseStage2, stage3: baseStage3, stage4: baseStage4, stageExport: 0, stageReview: 0 };
}

async function reportProgress(contest, text, isError = false, done = false, progress = null) {
  try {
    await chrome.runtime.sendMessage({
      type: "progress",
      contest,
      text,
      isError,
      done,
      progress: progress === null ? null : clampProgress(progress)
    });
  } catch {
    // ignore if popup is closed
  }
  try {
    const data = await chrome.storage.local.get("progress_state");
    const state = data.progress_state || {};
    const prev = state[contest] || {};
    const next = {
      ...prev,
      contest,
      text,
      isError,
      done,
      running: !done,
      progress: progress === null ? prev.progress : clampProgress(progress),
      updatedAt: Date.now()
    };
    state[contest] = next;
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

function extractContestFromDoc(doc) {
  // best-effort; not always needed
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
  if (canonical) {
    const m = canonical.match(/\/contests\/([^\/]+)/);
    if (m) return m[1];
  }
  return null;
}

function extractTasksFromListDoc(doc, contest) {
  const links = Array.from(doc.querySelectorAll(`a[href^="/contests/${contest}/tasks/"]`));
  const tasks = [];
  for (const a of links) {
    const href = a.getAttribute("href");
    const m = href.match(new RegExp(`^/contests/${contest}/tasks/([^/?#]+)$`));
    if (!m) continue;
    const taskId = m[1];
    const title = text(a);
    tasks.push({
      contest,
      taskId,
      title: title || null,
      url: ORIGIN + href
    });
  }
  return unique(tasks.map(t => t.taskId)).map(id => tasks.find(t => t.taskId === id)).filter(Boolean);
}

function extractTaskDetail(doc) {
  const titleEl = doc.querySelector("span.h2") || doc.querySelector("h2") || doc.querySelector("h1");
  const title = text(titleEl) || null;

  const statementEl = doc.querySelector("#task-statement");
  const statementText = statementEl ? text(statementEl) : null;

  const baseText = statementText || text(doc.body);
  let timeLimit = null;
  let memoryLimit = null;
  const enMatch = baseText.match(/Time Limit\s*[:：]?\s*([^/]+?)\s*\/\s*Memory Limit\s*[:：]?\s*([^\n]+)/i);
  const jpMatch = baseText.match(/実行時間制限\s*[:：]?\s*([^/]+?)\s*\/\s*メモリ制限\s*[:：]?\s*([^\n]+)/);
  const m = enMatch || jpMatch;
  if (m) {
    timeLimit = m[1].trim();
    memoryLimit = m[2].trim();
  }

  return { title, statementText, timeLimit, memoryLimit };
}

function submissionIdsFromListDoc(doc, contest) {
  const links = Array.from(doc.querySelectorAll(`a[href^="/contests/${contest}/submissions/"]`));
  const ids = [];
  for (const a of links) {
    const m = a.getAttribute("href").match(new RegExp(`^/contests/${contest}/submissions/(\\d+)$`));
    if (m) ids.push(m[1]);
  }
  return unique(ids);
}

function usersFromStandingsDoc(doc, topN) {
  const links = Array.from(doc.querySelectorAll('a[href^="/users/"]'));
  const users = [];
  for (const a of links) {
    const href = a.getAttribute("href");
    const m = href.match(/^\/users\/([A-Za-z0-9_]+)$/);
    if (m) users.push({ user: m[1], rank: null });
  }
  // standings contains many user links (e.g. nav), so we try to read table rows first
  const table = doc.querySelector("table");
  if (table) {
    const out = [];
    for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
      const userLink = tr.querySelector('a[href^="/users/"]');
      if (!userLink) continue;
      const m = userLink.getAttribute("href").match(/^\/users\/([A-Za-z0-9_]+)$/);
      if (!m) continue;
      const tds = Array.from(tr.querySelectorAll("td"));
      const rankText = text(tds[0]);
      out.push({ user: m[1], rank: rankText || null });
      if (topN && out.length >= topN) break;
    }
    if (out.length > 0) {
      const uniq = [];
      const seen = new Set();
      for (const u of out) {
        if (seen.has(u.user)) continue;
        seen.add(u.user);
        uniq.push(u);
      }
      return uniq.slice(0, topN);
    }
  }
  const uniq = [];
  const seen = new Set();
  for (const u of users) {
    if (seen.has(u.user)) continue;
    seen.add(u.user);
    uniq.push(u);
  }
  return uniq.slice(0, topN);
}

function getTableValue(doc, labels) {
  // find in first table that looks like submission info
  const tables = Array.from(doc.querySelectorAll("table"));
  for (const t of tables) {
    for (const tr of Array.from(t.querySelectorAll("tr"))) {
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      if (!th || !td) continue;
      const k = text(th);
      if (labels.some(l => k.toLowerCase() === l.toLowerCase())) {
        return text(td);
      }
    }
  }
  return null;
}

function extractUserFromSubmissionTable(doc) {
  const labels = ["User", "ユーザ", "ユーザー"];
  const tables = Array.from(doc.querySelectorAll("table"));
  for (const t of tables) {
    for (const tr of Array.from(t.querySelectorAll("tr"))) {
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      if (!th || !td) continue;
      const k = text(th);
      if (!labels.some(l => k.toLowerCase() === l.toLowerCase())) continue;
      const link = td.querySelector('a[href^="/users/"]');
      if (link) {
        const m = link.getAttribute("href").match(/^\/users\/([A-Za-z0-9_]+)$/);
        if (m) return m[1];
      }
      const raw = text(td);
      if (raw) return raw;
    }
  }
  return null;
}

function extractSubmissionDetail(doc, contest, submissionId) {
  // User (avoid picking the nav bar link)
  let user = extractUserFromSubmissionTable(doc);
  if (!user) {
    const userLink = doc.querySelector('a[href^="/users/"]');
    if (userLink) {
      const m = userLink.getAttribute("href").match(/^\/users\/([A-Za-z0-9_]+)$/);
      if (m) user = m[1];
    }
  }

  // Task / Problem
  let task = null;
  const taskLink = doc.querySelector(`a[href^="/contests/${contest}/tasks/"]`);
  if (taskLink) {
    const m = taskLink.getAttribute("href").match(new RegExp(`^/contests/${contest}/tasks/([^/?#]+)`));
    if (m) task = m[1];
  }

  // Code
  let code = null;
  // common patterns
  const candidates = [
    doc.querySelector("#submission-code"),
    doc.querySelector("pre#submission-code"),
    doc.querySelector("pre.prettyprint"),
    doc.querySelector("pre"),
  ].filter(Boolean);

  for (const c of candidates) {
    // If it's a container, try inner pre
    if (c.tagName.toLowerCase() !== "pre") {
      const pre = c.querySelector("pre");
      if (pre && text(pre).length > 0) { code = pre.textContent || ""; break; }
    } else {
      if ((c.textContent || "").trim().length > 0) { code = c.textContent || ""; break; }
    }
  }
  if (code) code = code.replace(/\r\n/g, "\n");

  // Basic stats
  const result = getTableValue(doc, ["Result", "結果"]);
  const score = getTableValue(doc, ["Score", "スコア"]);
  const lang = getTableValue(doc, ["Language", "言語"]);
  const time = getTableValue(doc, ["Execution Time", "実行時間"]);
  const memory = getTableValue(doc, ["Memory", "メモリ"]);
  const submitted = getTableValue(doc, ["Submitted", "提出日時"]);

  return {
    contest,
    submissionId,
    user,
    task,
    result,
    score,
    language: lang,
    executionTime: time,
    memory,
    submittedAt: submitted,
    code
  };
}

function isAC(resultText) {
  return (resultText || "").toUpperCase().includes("AC");
}

function keyForLatestACPerProblem(items) {
  // keep latest (by submissionId) per (user, task)
  const map = new Map();
  for (const it of items) {
    if (!it.task) continue;
    const k = `${it.user || ""}::${it.task}`;
    const prev = map.get(k);
    if (!prev || Number(it.submissionId) > Number(prev.submissionId)) {
      map.set(k, it);
    }
  }
  return Array.from(map.values());
}

async function collectSubmissionDetails(contest, submissionIds, mode, sourceTag) {
  const out = [];
  for (const id of submissionIds) {
    // polite delay
    await sleep(1000);
    const html = await fetchHtml(`/contests/${contest}/submissions/${id}`);
    const doc = parseDoc(html);
    const detail = extractSubmissionDetail(doc, contest, id);

    // mode filter
    if (mode === "ac" && !isAC(detail.result)) continue;
    if (sourceTag) detail.sourceTag = sourceTag;
    out.push(detail);
  }

  if (mode === "latest-ac") {
    const acOnly = out.filter(o => isAC(o.result));
    return keyForLatestACPerProblem(acOnly);
  }
  return out;
}

async function collectMySubmissions(contest, maxPages, mode, selfUserOverride = null) {
  const specifiedUser = normalizeSelfUser(selfUserOverride);
  const selfUser = specifiedUser;
  const selfUserKey = specifiedUser ? canonicalUser(specifiedUser) : "__self__";
  let ids = [];
  // /submissions/me has paging (?page=)
  for (let page = 1; page <= (maxPages || 3); page++) {
    await sleep(1000);
    const html = await fetchHtml(
      selfUser
        ? `/contests/${contest}/submissions?f.Task=&f.LanguageName=&f.Status=&f.User=${encodeURIComponent(selfUser)}&page=${page}`
        : `/contests/${contest}/submissions/me?page=${page}`
    );
    const doc = parseDoc(html);
    if (page === 1) {
      const window = extractContestWindowFromHtml(html, doc);
      if (window) await storeContestWindow(contest, window);
    }
    const pageIds = submissionIdsFromListDoc(doc, contest);
    if (pageIds.length === 0) break;
    ids = ids.concat(pageIds);
    // heuristic: if fewer than ~20 entries, last page
    if (pageIds.length < 20) break;
  }
  ids = unique(ids);

  // 提出IDが1件も見つからない場合はエラー
  if (ids.length === 0) {
    const userLabel = selfUser || "ログインユーザー";
    throw new Error(`${userLabel} の提出が見つかりませんでした。コンテストに参加しているか確認してください。`);
  }

  const details = await collectSubmissionDetails(contest, ids, mode, "me");
  for (const d of details) {
    d.selfUserKey = selfUserKey;
  }

  // upsert to DB in background
  const resp = await chrome.runtime.sendMessage({ type: "db_upsert_submissions", items: details });
  if (!resp?.ok) throw new Error(resp?.error || "DB upsert failed");
  return { added: resp.added, updated: resp.updated, totalFetched: details.length };
}

async function fetchAllStandings(contest) {
  let users = [];
  try {
    const data = await fetchJson(`/contests/${contest}/standings/json`);
    users = (data?.StandingsData || []).map(s => {
      const user = s?.UserScreenName;
      const rank = s?.Rank ?? s?.RankString ?? s?.Place ?? null;
      return user ? { user, rank: rank === null ? null : String(rank) } : null;
    }).filter(Boolean);
  } catch (e) {
    if (isRunCancelledError(e)) throw e;
    users = [];
  }
  if (users.length === 0) {
    const html = await fetchHtml(`/contests/${contest}/standings`);
    const doc = parseDoc(html);
    users = usersFromStandingsDoc(doc, 9999);
  }
  return users;
}

async function collectTopUsers(contest, topN) {
  const allUsers = await fetchAllStandings(contest);
  const users = allUsers.slice(0, topN || 3);
  if (users.length === 0) throw new Error("順位表から上位ユーザー名を取得できませんでした");
  const resp = await chrome.runtime.sendMessage({ type: "db_upsert_users", contest, users });
  if (!resp?.ok) throw new Error(resp?.error || "DB upsert users failed");
  return { count: users.length, users: users.map(u => u.user), usersDetailed: users };
}

async function collectTargetUsers(contest, targetConfig, selfUser) {
  const mode = targetConfig?.mode || "absolute";

  // manual モードは順位表不要（ただし順位情報付与のため取得する）
  let allUsers = [];
  if (mode !== "manual") {
    allUsers = await fetchAllStandings(contest);
  }

  // absolute / relative モードでは自分の順位を特定する
  let selfIndex = -1;
  if (mode === "absolute" || mode === "relative") {
    const normalizedSelf = (selfUser || "").toLowerCase();
    if (normalizedSelf) {
      selfIndex = allUsers.findIndex(u => u.user.toLowerCase() === normalizedSelf);
    }
    if (selfIndex === -1) {
      const loginUser = (getLoginUserFromPage() || "").toLowerCase();
      if (loginUser) {
        selfIndex = allUsers.findIndex(u => u.user.toLowerCase() === loginUser);
      }
    }
  }

  let selected = [];
  if (mode === "absolute") {
    const k = targetConfig?.k || 1;
    const n = targetConfig?.n || 3;
    selected = allUsers.slice(k - 1, k - 1 + n);
    // 自分と同順位以下のユーザーを除外
    if (selfIndex !== -1) {
      selected = selected.filter((_, i) => (k - 1 + i) < selfIndex);
    }
    if (selected.length === 0) {
      throw new Error("指定した順位範囲に自分より上位のユーザーがいません。開始順位や人数を見直してください。");
    }
  } else if (mode === "relative") {
    const k = targetConfig?.k || 1000;
    const n = targetConfig?.n || 3;
    if (selfIndex === -1) {
      throw new Error("順位表から添削対象ユーザーが見つかりませんでした。相対順位指定モードでは、添削対象ユーザーがコンテストに参加している必要があります。");
    }
    const T = selfIndex + 1; // 1-indexed rank
    const startRank = Math.max(1, T - k);
    // 自分より上位のユーザーのみ（startRank ~ T-1）
    const endRank = Math.min(startRank + n - 1, T - 1);
    selected = endRank >= startRank ? allUsers.slice(startRank - 1, endRank) : [];
    if (selected.length === 0) {
      throw new Error("指定した範囲に自分より上位のユーザーがいません。差分dや人数nを見直してください。");
    }
  } else if (mode === "manual") {
    const usernames = targetConfig?.users || [];
    if (usernames.length === 0) throw new Error("比較対象のユーザー名が指定されていません");
    // 順位情報付与のため順位表を取得（失敗してもOK）
    try {
      allUsers = await fetchAllStandings(contest);
    } catch {
      allUsers = [];
    }
    selected = usernames.map(name => {
      const found = allUsers.find(u => u.user.toLowerCase() === name.toLowerCase());
      return found || { user: name, rank: null };
    });
  }

  if (selected.length === 0) throw new Error("比較対象ユーザーが見つかりませんでした");

  // 既存のユーザーをクリアしてから新しいユーザーを保存
  await chrome.runtime.sendMessage({ type: "db_clear_users", contest });
  const resp = await chrome.runtime.sendMessage({ type: "db_upsert_users", contest, users: selected });
  if (!resp?.ok) throw new Error(resp?.error || "DB upsert users failed");
  return { count: selected.length, users: selected.map(u => u.user), usersDetailed: selected };
}

async function collectTasks(contest, progressCb = null) {
  await sleep(1000);
  const html = await fetchHtml(`/contests/${contest}/tasks`);
  const doc = parseDoc(html);
  const listTasks = extractTasksFromListDoc(doc, contest);
  if (listTasks.length === 0) throw new Error("問題一覧の取得に失敗しました");

  const detailed = [];
  const total = listTasks.length;
  for (let i = 0; i < listTasks.length; i++) {
    const t = listTasks[i];
    if (progressCb) await progressCb({ index: i, total, phase: "start", taskId: t.taskId });
    await sleep(1000);
    const taskHtml = await fetchHtml(`/contests/${contest}/tasks/${t.taskId}`);
    const taskDoc = parseDoc(taskHtml);
    const detail = extractTaskDetail(taskDoc);
    detailed.push({ ...t, ...detail });
    if (progressCb) await progressCb({ index: i, total, phase: "end", taskId: t.taskId });
  }

  const resp = await chrome.runtime.sendMessage({ type: "db_upsert_tasks", contest, tasks: detailed });
  if (!resp?.ok) throw new Error(resp?.error || "DB upsert tasks failed");
  return { count: detailed.length, tasks: detailed };
}

async function collectUserSubmissions(contest, user, maxPages, mode) {
  let ids = [];
  for (let page = 1; page <= (maxPages || 3); page++) {
    await sleep(1000);
    // AtCoder submissions supports f.User filter (widely used by tools)
    const url = `/contests/${contest}/submissions?f.User=${encodeURIComponent(user)}&page=${page}`;
    const html = await fetchHtml(url);
    const doc = parseDoc(html);
    const pageIds = submissionIdsFromListDoc(doc, contest);
    if (pageIds.length === 0) break;
    ids = ids.concat(pageIds);
    if (pageIds.length < 20) break;
  }
  ids = unique(ids);

  const details = await collectSubmissionDetails(contest, ids, mode, "top");
  const resp = await chrome.runtime.sendMessage({ type: "db_upsert_submissions", items: details });
  if (!resp?.ok) throw new Error(resp?.error || "DB upsert failed");
  try {
    await chrome.runtime.sendMessage({ type: "mark_top_user_checked", contest, user });
  } catch {
    // ignore marker update errors (cache判定は次回再取得で補完される)
  }
  return { added: resp.added, updated: resp.updated, fetched: details.length };
}

async function collectTopUsersSubmissions(contest, topN, maxPages, mode, usersOverride = null, progressCb = null) {
  // Ensure users exist; if not, collect them first.
  let users = (usersOverride || []).slice(0, topN || 3);
  if (users.length === 0) {
    let usersResp = await chrome.runtime.sendMessage({ type: "db_list_users", contest, limit: topN || 3 });
    if (!usersResp?.ok || (usersResp.users || []).length === 0) {
      const topResp = await collectTopUsers(contest, topN);
      users = (topResp.users || []).slice(0, topN || 3);
    } else {
      users = (usersResp.users || []).slice(0, topN || 3);
    }
  }

  let added = 0, updated = 0;
  const total = users.length;
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    if (progressCb) await progressCb({ index: i, total, phase: "start", user: u });
    // spread load between users
    await sleep(1000);
    const r = await collectUserSubmissions(contest, u, maxPages, mode);
    added += r.added;
    updated += r.updated;
    if (progressCb) await progressCb({ index: i, total, phase: "end", user: u });
  }
  return { users: users.length, added, updated };
}

async function runAllAndExport(contest, topN, maxPages, mode, withReview = false, selfUserOverride = null, targetConfig = null) {
  if (isRunAllRunning) {
    await reportProgress(contest, "すでに取得中です。完了までお待ちください。", true, false);
    return;
  }
  isRunAllRunning = true;
  startRunContext(contest);
  // targetConfig が無い場合はデフォルト（従来互換: 上位n名）
  if (!targetConfig) targetConfig = { mode: "absolute", k: 1, n: topN || 3 };
  const effectiveN = targetConfig.n || topN || 3;
  const parts = progressParts(effectiveN, withReview);
  let progress = 0;
  try {
    const selfUser = normalizeSelfUser(selfUserOverride);
    throwIfCancelled();

    // キャッシュデータを確認（tasks と自分の提出のみ。比較対象はStage3で確定後に判定）
    await reportProgress(contest, "キャッシュを確認中…", false, false, progress);
    const cachedDataRes = await chrome.runtime.sendMessage({
      type: "get_cached_data", contest, selfUser
    });
    const hasCachedTasks = cachedDataRes?.ok && cachedDataRes?.hasCachedTasks;
    const hasCachedMySubmissions = cachedDataRes?.ok && cachedDataRes?.hasCachedMySubmissions;
    const cachedTasksCount = cachedDataRes?.tasksCount || 0;
    const cachedMySubmissionsCount = cachedDataRes?.mySubmissionsCount || 0;
    console.log(`Cache check for ${contest}: tasks=${hasCachedTasks}, mySubmissions=${hasCachedMySubmissions}`);
    throwIfCancelled();

    // Stage 1: 自分の提出を取得（キャッシュがあればスキップ）
    let r1;
    if (hasCachedMySubmissions) {
      const mySubmissionsLabel = selfUser ? `${selfUser} の提出を取得（キャッシュ使用）` : "自分の提出を取得（キャッシュ使用）";
      await reportProgress(contest, mySubmissionsLabel, false, false, progress);
      r1 = { added: 0, updated: 0, totalFetched: cachedMySubmissionsCount };
      progress += parts.stage1;
    } else {
      const mySubmissionsLabel = selfUser ? `${selfUser} の提出を取得中…` : "自分の提出を取得中…";
      await reportProgress(contest, mySubmissionsLabel, false, false, progress);
      r1 = await collectMySubmissions(contest, maxPages, mode, selfUser);
      throwIfCancelled();

      // 提出が見つからない場合はエラーを出して終了
      if (r1.totalFetched === 0) {
        const userLabel = selfUser || "ログインユーザー";
        const errorMsg = `${userLabel} の提出が見つかりませんでした。コンテストに参加しているか、ログイン状態を確認してください。`;
        await reportProgress(contest, errorMsg, true, true, progress);
        return;
      }

      progress += parts.stage1;
    }
    throwIfCancelled();

    // Stage 2: 問題を取得（キャッシュがあればスキップ）
    let r0;
    if (hasCachedTasks) {
      await reportProgress(contest, "問題を取得（キャッシュ使用）", false, false, progress);
      r0 = { count: cachedTasksCount, added: 0, updated: 0 };
      progress += parts.stage2;
    } else {
      await reportProgress(contest, "問題を取得中…", false, false, progress);
      const stage2Base = progress;
      const stage2Range = parts.stage2;
      r0 = await collectTasks(contest, async ({ index, total, phase }) => {
        const ratio = total ? (phase === "end" ? (index + 1) / total : index / total) : 1;
        const pct = stage2Base + (stage2Range * ratio);
        const label = total ? `${Math.min(index + 1, total)}/${total}` : "";
        const text = label ? `問題を取得中…（${label}）` : "問題を取得中…";
        await reportProgress(contest, text, false, false, pct);
      });
      throwIfCancelled();
      progress = stage2Base + stage2Range;
    }

    // Stage 3: 比較対象ユーザーを常に取得（順位表APIは軽量なので毎回実行）
    let r2, r3;
    await reportProgress(contest, "比較対象ユーザーを取得中…", false, false, progress);
    r2 = await collectTargetUsers(contest, targetConfig, selfUser);
    throwIfCancelled();
    progress += parts.stage3;

    // 確定したユーザーリストで提出キャッシュを判定
    const resolvedUsers = r2.users || [];
    const userCacheRes = await chrome.runtime.sendMessage({
      type: "get_cached_data", contest, selfUser,
      targetUsers: resolvedUsers
    });
    const missingUsers = userCacheRes?.missingUsers || [];
    const allUsersCached = userCacheRes?.ok && userCacheRes?.hasCachedTopUsers && missingUsers.length === 0;
    console.log(`Target users [${resolvedUsers.join(", ")}]: allCached=${allUsersCached}, missing=[${missingUsers.join(", ")}]`);

    // Stage 4: 比較対象ユーザーの提出を取得（キャッシュ済みユーザーはスキップ）
    if (allUsersCached) {
      await reportProgress(contest, "比較対象ユーザーの提出を取得（キャッシュ使用）", false, false, progress);
      r3 = { added: 0, updated: 0 };
      progress += parts.stage4;
    } else {
      const usersToFetch = missingUsers.length > 0 ? missingUsers : resolvedUsers;
      await reportProgress(contest, "比較対象ユーザーの提出を取得中…", false, false, progress);
      const stage4Base = progress;
      const stage4Range = parts.stage4;
      r3 = await collectTopUsersSubmissions(
        contest,
        effectiveN,
        maxPages,
        mode,
        usersToFetch,
        async ({ index, total, phase }) => {
          const ratio = total ? (phase === "end" ? (index + 1) / total : index / total) : 1;
          const pct = stage4Base + (stage4Range * ratio);
          const label = total ? `${Math.min(index + 1, total)}/${total}` : "";
          const text = label ? `比較対象ユーザーの提出を取得中…（${label}）` : "比較対象ユーザーの提出を取得中…";
          await reportProgress(contest, text, false, false, pct);
        }
      );
      throwIfCancelled();
      progress = stage4Base + stage4Range;
    }

    const added = r1.added + (r3.added || 0);
    const updated = r1.updated + (r3.updated || 0);
    const cacheUsed = hasCachedTasks || allUsersCached || hasCachedMySubmissions;
    const allCached = hasCachedTasks && allUsersCached && hasCachedMySubmissions;
    const cacheMsg = cacheUsed ? (allCached ? "（全てキャッシュ使用）" : "（一部キャッシュ使用）") : "";
    progress = parts.stage1 + parts.stage2 + parts.stage3 + parts.stage4;
    await reportProgress(contest, `取得完了: 追加 ${added} / 更新 ${updated}（ユーザー ${r2.count} 名）${cacheMsg}`, false, false, progress);
    throwIfCancelled();

    await reportProgress(contest, "JSONをキャッシュに保存中…", false, false, progress);
    const cacheRes = await chrome.runtime.sendMessage({ type: "cache_export", contest, selfUser });
    if (!cacheRes?.ok) {
      await reportProgress(contest, cacheRes?.error || "キャッシュ保存に失敗しました", true, true, progress);
      return;
    }
    throwIfCancelled();

    if (!withReview) {
      // データ取得のみの場合は完了メッセージを送信
      await reportProgress(contest, "データ取得完了", false, true, 100);
      return;
    }

    // withReview: AI添削を実行してmarkdownを取得
    await reportProgress(contest, "AI添削に進行中…", false, false, progress);
    const reviewRes = await chrome.runtime.sendMessage({
      type: "ai_review",
      contest,
      selfUser,
      progressBase: progress,
      progressRange: (parts.stageExport || 0) + (parts.stageReview || Math.max(5, 100 - progress)),
      returnMarkdown: true
    });
    throwIfCancelled();
    if (reviewRes?.ok && reviewRes?.markdown) {
      try {
        const saveMsg = {
          type: "save_review_cache",
          contest,
          selfUser,
          markdown: reviewRes.markdown
        };
        if (reviewRes.prompt) saveMsg.prompt = reviewRes.prompt;
        if (reviewRes.provider) saveMsg.aiProvider = reviewRes.provider;
        if (reviewRes.model) saveMsg.aiModel = reviewRes.model;
        await chrome.runtime.sendMessage(saveMsg);
      } catch {
        // ignore cache save failure
      }
      // AI添削完了、markdownをpopupに送信
      try {
        const completeMsg = {
          type: "review_complete",
          contest,
          selfUser,
          markdown: reviewRes.markdown
        };
        if (reviewRes.prompt) completeMsg.prompt = reviewRes.prompt;
        if (reviewRes.provider) completeMsg.aiProvider = reviewRes.provider;
        if (reviewRes.model) completeMsg.aiModel = reviewRes.model;
        await chrome.runtime.sendMessage(completeMsg);
      } catch {
        // ignore if popup is closed
      }
    } else {
      await reportProgress(contest, reviewRes?.error || "AI添削に失敗しました", true, true, progress);
    }
  } catch (e) {
    if (isRunCancelledError(e)) {
      await reportProgress(contest, "ユーザーが中止しました", false, true, progress);
      await clearProgressState(contest);
    } else {
      await reportProgress(contest, String(e?.message || e), true, true, progress);
    }
  } finally {
    isRunAllRunning = false;
    currentRunCtx = null;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || !msg.type) return;
      if (msg.type === "get_contest") {
        const contest = contestFromUrl(location.href);
        sendResponse({ ok: true, contest });
        return;
      }
      if (msg.type === "cancel_run_all") {
        const cancelled = cancelRunContext(msg.contest);
        await clearProgressState(msg.contest);
        sendResponse({ ok: true, cancelled });
        return;
      }
      if (msg.type === "collect_my_submissions") {
        const res = await collectMySubmissions(msg.contest, msg.maxPages, msg.mode || "all", msg.selfUser || null);
        sendResponse(res);
        return;
      }
      if (msg.type === "collect_top_users") {
        const res = await collectTopUsers(msg.contest, msg.topN || 3);
        sendResponse(res);
        return;
      }
      if (msg.type === "collect_top_users_submissions") {
        const res = await collectTopUsersSubmissions(msg.contest, msg.topN || 3, msg.maxPages || 3, msg.mode || "all");
        sendResponse(res);
        return;
      }
      if (msg.type === "run_all") {
        const contest = msg.contest;
        const topN = msg.topN || 3;
        const maxPages = msg.maxPages || 3;
        const mode = msg.mode || "all";
        const selfUser = msg.selfUser || null;
        const targetConfig = msg.targetConfig || { mode: "absolute", k: 1, n: topN };
        const r0 = await collectTasks(contest);
        const r1 = await collectMySubmissions(contest, maxPages, mode, selfUser);
        const r2 = await collectTargetUsers(contest, targetConfig, selfUser);
        const r3 = await collectTopUsersSubmissions(contest, topN, maxPages, mode, r2.users || []);
        sendResponse({ tasks: r0, mySubmissions: r1, topUsers: r2, topUsersSubmissions: r3 });
        return;
      }
      if (msg.type === "start_run_all") {
        const contest = msg.contest;
        const topN = msg.topN || 3;
        const maxPages = msg.maxPages || 3;
        const mode = msg.mode || "all";
        const selfUser = msg.selfUser || null;
        const targetConfig = msg.targetConfig || { mode: "absolute", k: 1, n: topN };
        runAllAndExport(contest, topN, maxPages, mode, Boolean(msg.withReview), selfUser, targetConfig);
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ error: "Unknown request" });
    } catch (e) {
      sendResponse({ error: String(e?.message || e) });
    }
  })();
  return true;
});
