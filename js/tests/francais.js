import { esc, makeOptions } from '../core/util.js';
import { SYNONYMES, ANTONYMES, DEFINITIONS, INTRUS, ORTHOGRAPHE, GRAMMAIRE, EXPRESSIONS } from '../data/francais-data.js';

const html = (s) => esc(s);

const TYPES = {
  synonyme: {
    tag: 'Synonymes', bank: SYNONYMES,
    make: (rng, [w, a, d]) => ({
      prompt: `Quel est le <b>synonyme</b> de « <b>${esc(w)}</b> » ?`,
      ...makeOptions(rng, a, rng.shuffle(d), { html }),
      explanation: `« ${esc(w)} » a le même sens que « <b>${esc(a)}</b> ».`,
    }),
  },
  antonyme: {
    tag: 'Antonymes', bank: ANTONYMES,
    make: (rng, [w, a, d]) => ({
      prompt: `Quel est le <b>contraire</b> de « <b>${esc(w)}</b> » ?`,
      ...makeOptions(rng, a, rng.shuffle(d), { html }),
      explanation: `Le contraire de « ${esc(w)} » est « <b>${esc(a)}</b> ».`,
    }),
  },
  definition: {
    tag: 'Définitions', bank: DEFINITIONS,
    make: (rng, [def, a, d]) => ({
      prompt: `Quel mot correspond à la définition : « <i>${esc(def)}</i> » ?`,
      ...makeOptions(rng, a, rng.shuffle(d), { html }),
      explanation: `${esc(def)} : <b>${esc(a)}</b>.`,
    }),
  },
  intrus: {
    tag: 'Intrus', bank: INTRUS,
    make: (rng, [words, k, why]) => ({
      prompt: 'Quel est l’<b>intrus</b> dans cette liste ?',
      ...makeOptions(rng, words[k], rng.shuffle(words.filter((_, i) => i !== k)), { html }),
      explanation: `<b>${esc(words[k])}</b> : ${esc(why)}`,
    }),
  },
  orthographe: {
    tag: 'Orthographe', bank: ORTHOGRAPHE,
    make: (rng, [a, d]) => ({
      prompt: 'Quel mot est correctement orthographié ?',
      ...makeOptions(rng, a, rng.shuffle(d), { html }),
      explanation: `L’orthographe correcte est « <b>${esc(a)}</b> ».`,
    }),
  },
  grammaire: {
    tag: 'Grammaire et conjugaison', bank: GRAMMAIRE,
    make: (rng, [s, a, d, e]) => ({
      prompt: `Complétez : « ${esc(s).replace('___', '<span class="blank">…</span>')} »`,
      ...makeOptions(rng, a, rng.shuffle(d), { html }),
      explanation: `<b>${esc(a)}</b>. ${esc(e)}`,
    }),
  },
  expression: {
    tag: 'Expressions', bank: EXPRESSIONS,
    make: (rng, [x, a, d]) => ({
      prompt: `Que signifie l’expression « <b>${esc(x)}</b> » ?`,
      ...makeOptions(rng, a, rng.shuffle(d), { html }),
      explanation: `« ${esc(x)} » : <b>${esc(a)}</b>.`,
    }),
  },
};
export const FR_TYPES = TYPES;

export default {
  id: 'francais',
  section: 'tamic',
  title: 'Français',
  description:
    'Le test mêle plusieurs types de questions : trouver le synonyme ou l’antonyme d’un mot, repérer l’intrus dans une liste, choisir la bonne définition, l’orthographe correcte ou la forme grammaticale juste.',
  count: 31,
  time: 8 * 60,
  maxCount: 120,
  instructions: `<ul><li>Questions de vocabulaire et de langue : synonymes, contraires, définitions, intrus, orthographe, grammaire, expressions.</li>
    <li>Une seule bonne réponse parmi cinq. Environ 15 secondes par question : fiez-vous à votre première impression.</li></ul>`,
  generate: (rng, count) => {
    // pools per type, drawn without repetition; types cycled for variety
    const pools = Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, rng.shuffle(t.bank)]));
    const out = [];
    let deck = [];
    while (out.length < count) {
      if (!deck.length) deck = rng.shuffle(Object.keys(TYPES));
      const type = deck.pop();
      if (!pools[type].length) pools[type] = rng.shuffle(TYPES[type].bank);
      const item = pools[type].pop();
      const q = TYPES[type].make(rng, item);
      out.push({ tag: TYPES[type].tag, layout: 'list', ...q, meta: { type, item } });
    }
    return out;
  },
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14c10-4 20-4 28 2 8-6 18-6 28-2v38c-10-4-20-4-28 2-8-6-18-6-28-2z"/><path d="M32 16v38M10 26h16M38 26h16M10 34h12M38 34h14"/></svg>`,
};
