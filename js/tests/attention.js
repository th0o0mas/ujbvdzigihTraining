import { esc, retry } from '../core/util.js';

const DIGITS = '0123456789';
const LETTERS_POOL = 'ABCDEFGHJKLMNPRSTUVWXZ';
// visually confusable pairs (both directions are used)
const CONFUSE = {
  0: 'OQD8', 1: 'I7L', 2: 'Z7', 3: '8B', 5: 'S6', 6: 'G5B9', 7: '1T2', 8: 'B30', 9: '6G',
  O: '0QDC', Q: 'O0', D: '0O', I: '1L', L: 'I1', Z: '2', S: '5', G: '6C', B: '8RP', T: '7Y',
  E: 'FB', F: 'EP', P: 'RF', R: 'PB', M: 'NW', N: 'MH', U: 'VW', V: 'UY', W: 'VM', C: 'GO', H: 'N', K: 'X', X: 'KY', Y: 'VX', A: 'R', J: 'I',
};

function randomSeries(rng) {
  const len = rng.int(7, 11);
  const kind = rng.pick(['digits', 'letters', 'mixed', 'mixed']);
  const pool = kind === 'digits' ? DIGITS : kind === 'letters' ? LETTERS_POOL : DIGITS + LETTERS_POOL;
  let s = '';
  for (let i = 0; i < len; i++) s += rng.pick(pool);
  return s;
}

function mutate(rng, s) {
  const mode = rng.weighted([['confuse', 6], ['swap', 3], ['other', 1]]);
  const a = [...s];
  if (mode === 'swap') {
    const idx = [];
    for (let i = 0; i + 1 < a.length; i++) if (a[i] !== a[i + 1]) idx.push(i);
    if (!idx.length) throw new Error('no swap');
    const i = rng.pick(idx);
    [a[i], a[i + 1]] = [a[i + 1], a[i]];
  } else {
    const i = rng.int(0, a.length - 1);
    const c = a[i];
    const pool = mode === 'confuse' && CONFUSE[c] ? CONFUSE[c] : /\d/.test(c) ? DIGITS : LETTERS_POOL;
    const choices = [...pool].filter((x) => x !== c);
    a[i] = rng.pick(choices);
  }
  const out = a.join('');
  if (out === s) throw new Error('unchanged');
  return out;
}

function highlightDiff(base, other) {
  return [...other].map((c, i) => (c !== base[i] ? `<b style="color:var(--ko);text-decoration:underline">${esc(c)}</b>` : esc(c))).join('');
}

export function genQuestion(rng) {
  return retry(() => {
    const base = randomSeries(rng);
    const series = [base, base, base, base];
    const hasIntrus = rng.chance(0.8);
    let pos = 4;
    if (hasIntrus) {
      pos = rng.int(0, 3);
      series[pos] = mutate(rng, base);
    }
    const options = [
      ...series.map((s, i) => ({ html: `<span class="mono">${esc(s)}</span>`, key: `${i}:${s}`, value: s })),
      { html: '<b>Pas d’intrus</b>', key: 'none', value: null },
    ];
    return {
      tag: hasIntrus ? 'Avec intrus' : 'Sans intrus',
      prompt: 'Quelle série diffère des trois autres ?',
      summary: series.join('  ·  '),
      options,
      answer: pos,
      layout: 'list',
      explanation: hasIntrus
        ? `La série ${'ABCD'[pos]} diffère : <span class="mono">${highlightDiff(base, series[pos])}</span> au lieu de <span class="mono">${esc(base)}</span>.`
        : 'Les quatre séries sont identiques : il n’y a pas d’intrus.',
      meta: { series, pos },
    };
  });
}

export default {
  id: 'attention',
  section: 'tamic',
  title: 'Attention',
  description:
    'Comparez quatre séries de chiffres et de lettres et repérez celle qui diffère des autres. Si les quatre séries sont identiques, sélectionnez « pas d’intrus ».',
  count: 40,
  time: 210,
  instructions: `<ul>
    <li>Quatre séries de caractères (A à D) sont affichées. Au plus une diffère des autres.</li>
    <li>Les différences sont subtiles : caractères ressemblants (0/O, 8/B, 5/S, 1/I…) ou deux caractères inversés.</li>
    <li>Si les quatre séries sont identiques, choisissez <b>E – Pas d’intrus</b>.</li>
    <li>Le rythme est très rapide (≈ 5 s par question) : utilisez le clavier (1–5 ou A–E).</li></ul>`,
  generate: (rng, count) => Array.from({ length: count }, () => genQuestion(rng)),
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="32" r="5"/><circle cx="21" cy="32" r="5"/><circle cx="33" cy="32" r="5"/><circle cx="45" cy="32" r="6" fill="currentColor"/><circle cx="57" cy="32" r="5"/></svg>`,
};
