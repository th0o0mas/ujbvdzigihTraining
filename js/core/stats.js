// Notation et agrégation de l'historique par semaine (lundi → dimanche).
const pad = (n) => String(n).padStart(2, '0');

/** note sur 20 avec une décimale, à partir d'un pourcentage */
export const note20 = (pct) => Math.round(pct * 2) / 10;
export const fmtNote = (pct) => `${String(note20(pct)).replace('.', ',')}/20`;

/** lundi 00:00 (heure locale) de la semaine contenant ts */
export function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
export const weekKey = (ts) => {
  const d = weekStart(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const weekLabel = (key) => {
  const [y, m, d] = key.split('-');
  return `Sem. du ${d}/${m}/${y.slice(2)}`;
};

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

/** entries → [{ key, sessions, avg, best }] trié du plus ancien au plus récent */
export function weekly(entries) {
  const m = new Map();
  for (const e of entries) {
    const k = weekKey(e.date);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e.pct);
  }
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, p]) => ({ key, sessions: p.length, avg: mean(p), best: Math.max(...p) }));
}

/**
 * Moyenne globale par semaine : moyenne des moyennes de chaque épreuve pratiquée cette semaine-là
 * (une épreuve très pratiquée ne pèse pas plus qu'une autre).
 */
export function globalWeekly(all, filter = () => true) {
  const perWeek = new Map(); // key -> { tests: Map(testId -> pcts[]), sessions }
  for (const [id, list] of Object.entries(all)) {
    for (const e of list) {
      if (!filter(e, id)) continue;
      const k = weekKey(e.date);
      if (!perWeek.has(k)) perWeek.set(k, { tests: new Map(), sessions: 0 });
      const w = perWeek.get(k);
      w.sessions++;
      if (!w.tests.has(id)) w.tests.set(id, []);
      w.tests.get(id).push(e.pct);
    }
  }
  return [...perWeek.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, w]) => {
      const avgs = [...w.tests.values()].map(mean);
      return { key, sessions: w.sessions, tests: w.tests.size, avg: mean(avgs), best: Math.max(...avgs) };
    });
}
