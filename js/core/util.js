export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** French number formatting: decimal comma, narrow no-break space for thousands. */
export function fmtNum(n, maxDec = 2) {
  if (!Number.isFinite(n)) throw new Error('fmtNum: non-finite ' + n);
  const r = Number(n.toFixed(maxDec));
  const neg = r < 0;
  const [i, d] = Math.abs(r).toFixed(maxDec).split('.');
  const dec = d ? d.replace(/0+$/, '') : '';
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '−' : '') + int + (dec ? ',' + dec : '');
}

/** 125 -> "2:05" */
export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 210 -> "3 min 30", 420 -> "7 min", 52 -> "52 s" */
export function fmtMinutes(sec) {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${String(s).padStart(2, '0')}` : `${m} min`;
}

/** minutes -> "1 h 05" / "45 min" */
export function fmtHM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** minutes since midnight -> "14 h 05" (wraps on 24 h) */
export function fmtTimeOfDay(min) {
  const t = ((min % 1440) + 1440) % 1440;
  return `${Math.floor(t / 60)} h ${String(t % 60).padStart(2, '0')}`;
}

export const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

/**
 * Build a shuffled option list from a correct value and candidate distractors.
 * Distractors are deduplicated on `key` (which should reflect what is DISPLAYED).
 */
export function makeOptions(rng, correct, distractors, { count = 5, key = (v) => String(v), html = (v) => esc(String(v)) } = {}) {
  const seen = new Set([key(correct)]);
  const chosen = [];
  for (const d of distractors) {
    if (chosen.length >= count - 1) break;
    if (d === undefined || d === null) continue;
    const k = key(d);
    if (seen.has(k)) continue;
    seen.add(k);
    chosen.push(d);
  }
  if (chosen.length < count - 1) throw new Error('makeOptions: not enough distinct distractors');
  const values = [correct, ...chosen];
  const order = rng.shuffle(values.map((_, i) => i));
  return {
    options: order.map((i) => ({ html: html(values[i]), key: key(values[i]), value: values[i] })),
    answer: order.indexOf(0),
  };
}

/**
 * Numeric options: `cands` are preferred "plausible error" distractors; filled up with
 * nearby values when needed. Values are compared on their formatted text.
 */
export function numOptions(rng, answer, cands, { count = 5, fmt = (v) => fmtNum(v), min = -Infinity, integer = false, step } = {}) {
  const ok = (v) => Number.isFinite(v) && v >= min && (!integer || Number.isInteger(v));
  const list = rng.shuffle(cands.filter(ok));
  const s = step || niceStep(answer);
  const fill = [];
  for (let k = 1; k <= 8; k++) fill.push(answer + k * s, answer - k * s);
  const fillOk = fill.filter(ok);
  // Keep fill values close to the answer first, with a random sign order.
  const pool = [...list, ...rng.shuffle(fillOk).sort((x, y) => Math.abs(x - answer) - Math.abs(y - answer))];
  return makeOptions(rng, answer, pool, { count, key: fmt, html: fmt });
}

export function niceStep(v) {
  const a = Math.abs(v);
  if (a === 0) return 1;
  if (Number.isInteger(v)) {
    if (a < 20) return 1;
    if (a < 100) return 2;
    if (a < 500) return 5;
    if (a < 2000) return 10;
    if (a < 10000) return 50;
    return 100;
  }
  if (a < 1) return 0.05;
  if (a < 10) return 0.5;
  return 1;
}

/** Retry a generator that may throw on unlucky random draws. */
export function retry(fn, tries = 200) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return fn();
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export const stripHtml = (h) => String(h).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
