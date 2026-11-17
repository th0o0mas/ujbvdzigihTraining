// Stockage des résultats et de la progression des flashcards.
// Les données sont rangées par utilisateur (espace « local » quand aucun compte n'est configuré).
// À chaque modification, les abonnés (synchronisation en ligne) sont prévenus.
let user = 'local';
const listeners = new Set();

const key = (name) => `eopn-training.${name}.v1${user === 'local' ? '' : `:${user}`}`;

export function setUser(id) {
  user = id || 'local';
}
export const currentUser = () => user;
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = (name) => listeners.forEach((fn) => { try { fn(name); } catch (e) { console.error(e); } });

/** generic JSON document of the current user ('history' or 'flashcards') */
export function getDoc(name) {
  try {
    const v = JSON.parse(localStorage.getItem(key(name)));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
export function setDoc(name, value, { silent = false } = {}) {
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
  if (!silent) notify(name);
}

export const loadAll = () => getDoc('history');

export function history(testId) {
  return loadAll()[testId] || [];
}

export function add(testId, entry) {
  const all = loadAll();
  (all[testId] ||= []).push(entry);
  setDoc('history', all);
}

const num = (v, min = -Infinity, max = Infinity) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
const SAFE_ID = /^[a-z0-9_-]{1,40}$/i;
/**
 * Keeps only well-formed fields with the expected types: data coming from an imported file or from
 * the online copy can never inject text into the page (defence against script injection).
 */
export function sanitizeEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const date = num(e.date, 0), pct = num(e.pct, 0, 100);
  if (date === undefined || pct === undefined) return null;
  const out = { date, pct, mode: e.mode === 'training' ? 'training' : 'exam' };
  for (const k of ['score', 'total', 'wrong', 'blank', 'duration', 'seed']) {
    const v = num(e[k], 0, 1e10);
    if (v !== undefined) out[k] = v;
  }
  if (e.kind === 'realtime') out.kind = 'realtime';
  if (e.opts && typeof e.opts === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(e.opts)) if (SAFE_ID.test(k) && typeof v === 'string' && SAFE_ID.test(v)) o[k] = v;
    out.opts = o;
  }
  return out;
}

/** merge two histories ({ testId: [entries] }); duplicates (same test + same date) are skipped */
export function mergeHistories(base, incoming) {
  const all = {};
  for (const [id, list] of Object.entries(base || {})) if (SAFE_ID.test(id) && Array.isArray(list)) all[id] = list.map(sanitizeEntry).filter(Boolean);
  let added = 0;
  for (const [id, list] of Object.entries(incoming || {})) {
    if (!SAFE_ID.test(id) || !Array.isArray(list)) continue;
    const cur = (all[id] ||= []);
    const seen = new Set(cur.map((e) => e.date));
    for (const raw of list) {
      const e = sanitizeEntry(raw);
      if (!e || seen.has(e.date)) continue;
      cur.push(e);
      seen.add(e.date);
      added++;
    }
    cur.sort((a, b) => a.date - b.date);
  }
  return { all, added };
}

/** merge an exported history into the current user's history */
export function merge(incoming) {
  if (!incoming || typeof incoming !== 'object') throw new Error('format inconnu');
  const { all, added } = mergeHistories(loadAll(), incoming);
  setDoc('history', all);
  return added;
}

export function clearAll() {
  setDoc('history', {});
}
