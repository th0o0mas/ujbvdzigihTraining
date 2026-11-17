import { esc, makeOptions } from '../core/util.js';
import { PART5, PART6, PART7 } from '../data/anglais-data.js';

const html = (s) => esc(s);
export const TOTAL = PART5.length + PART6.reduce((s, g) => s + g.blanks.length, 0) + PART7.reduce((s, g) => s + g.questions.length, 0);

function part5Question(rng, [s, a, d, e]) {
  return {
    tag: 'Phrases à compléter',
    prompt: esc(s).replace('____', '<span class="blank">______</span>'),
    ...makeOptions(rng, a, rng.shuffle(d), { count: 4, html }),
    layout: 'list',
    explanation: `<b>${esc(a)}</b> — ${esc(e)}`,
    meta: { part: 5, item: [s, a, d] },
  };
}

function part6Questions(rng, g) {
  return g.blanks.map(([a, d, e], k) => {
    const text = g.text.replace(/\[(\d)\]/g, (_, n) =>
      +n === k + 1 ? `<span class="blank" style="background:var(--accent-soft)">(${n}) ?</span>` : `<span class="blank">(${n})</span>`);
    return {
      tag: 'Textes à compléter',
      context: `<div class="passage"><b>${esc(g.title)}</b><br>${text}</div>`,
      prompt: `Choisissez le mot ou groupe de mots qui convient pour le blanc <b>(${k + 1})</b>.`,
      summary: `${g.title} — blanc ${k + 1}`,
      ...makeOptions(rng, a, rng.shuffle(d), { count: 4, html }),
      layout: 'list',
      explanation: `<b>${esc(a)}</b> — ${esc(e)}`,
      meta: { part: 6, item: [g.title, a, d] },
    };
  });
}

function part7Questions(rng, g) {
  return g.questions.map(([q, a, d]) => ({
    tag: 'Compréhension écrite',
    context: `<div class="passage"><b>${esc(g.title)}</b><br>${g.text}</div>`,
    prompt: esc(q),
    ...makeOptions(rng, a, rng.shuffle(d), { count: 4, html }),
    layout: 'list',
    explanation: `Réponse : <b>${esc(a)}</b>.`,
    meta: { part: 7, item: [q, a, d] },
  }));
}

export function generate(rng, count) {
  count = Math.min(count, TOTAL);
  let groups6 = rng.shuffle(PART6);
  let groups7 = rng.shuffle(PART7);
  if (count < TOTAL) {
    const n6 = Math.floor(Math.round(count * 0.16) / 4);
    const n7 = Math.floor(Math.round(count * 0.1) / 3);
    groups6 = groups6.slice(0, n6);
    groups7 = groups7.slice(0, n7);
  }
  const q6 = groups6.flatMap((g) => part6Questions(rng, g));
  const q7 = groups7.flatMap((g) => part7Questions(rng, g));
  const n5 = count - q6.length - q7.length;
  const q5 = rng.shuffle(PART5).slice(0, n5).map((it) => part5Question(rng, it));
  return [...q5, ...q6, ...q7];
}

export default {
  id: 'anglais',
  section: 'anglais',
  title: 'Anglais écrit',
  description:
    'Questionnaire à choix multiples de compréhension écrite : phrases à compléter (grammaire, vocabulaire), textes à trous et lecture de documents. Format officiel : 150 questions en 55 minutes.',
  count: 150,
  time: 55 * 60,
  maxCount: TOTAL,
  instructions: `<ul>
    <li>Format des épreuves : <b>150 questions à choix multiples en 55 minutes</b> (≈ 22 s par question).</li>
    <li>Trois parties, comme le TOEIC Reading : phrases à compléter, textes à compléter, compréhension de documents.</li>
    <li>Pour un entraînement plus court, réduisez le nombre de questions (le temps est ajusté au prorata).</li>
    <li>Banque actuelle : ${TOTAL} questions différentes ; la correction explique chaque règle en français.</li></ul>`,
  generate,
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="10" width="52" height="40" rx="4"/><text x="15" y="37" font-size="18" font-weight="700" fill="currentColor" stroke="none" font-family="sans-serif">EN</text><path d="M18 50l-4 8 12-8"/></svg>`,
};
