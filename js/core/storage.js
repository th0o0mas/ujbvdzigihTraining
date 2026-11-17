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

/** merge two histories ({ testId: [entries] }); duplicates (same test + same date) are skipped */
export function mergeHistories(base, incoming) {
  const all = JSON.parse(JSON.stringify(base || {}));
  let added = 0;
  for (const [id, list] of Object.entries(incoming || {})) {
    if (!Array.isArray(list)) continue;
    const cur = (all[id] ||= []);
    const seen = new Set(cur.map((e) => e.date));
    for (const e of list) {
      if (!e || typeof e.date !== 'number' || typeof e.pct !== 'number' || seen.has(e.date)) continue;
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
