import { esc, makeOptions, retry } from '../core/util.js';
import { CULTURE } from '../data/culture-data.js';
import { AERONEFS } from '../data/aeronefs-data.js';

const html = (s) => esc(s);
const disjoint = (a, b) => !a.some((x) => b.includes(x));

const ENGINE_TYPES = ['turboréacteur', 'turbopropulseur', 'turbomoteur', 'moteur à pistons'];
const plural = (n, t) => (n > 1 ? (t === 'moteur à pistons' ? 'moteurs à pistons' : t + 's') : t);
/** "2 turboréacteurs" from the card's motorisation text, or null if it cannot be parsed */
export function engineSig(card) {
  const m = /^(\d+)\s+(turboréacteur|turbopropulseur|turbomoteur|moteur)s?\b/.exec(card.motorisation);
  if (!m) return null;
  const type = m[2] === 'moteur' ? 'moteur à pistons' : m[2];
  return `${m[1]} ${plural(+m[1], type)}`;
}
export const ENGINE_SIGS = [1, 2, 3, 4].flatMap((n) => ENGINE_TYPES.map((t) => `${n} ${plural(n, t)}`));

/* Questions générées à partir des fiches aéronefs (distracteurs garantis faux). */
export function aeronefQuestion(rng, card, type) {
  return retry(() => {
    const others = AERONEFS.filter((c) => c !== card);
    if (type === 'constructeur') {
      const d = [...new Set(rng.shuffle(others.filter((c) => disjoint(c.groupe, card.groupe))).map((c) => c.constructeur))];
      return {
        tag: 'Reconnaissance des aéronefs',
        prompt: `Quel constructeur produit (ou a produit) le <b>${esc(card.nom)}</b> ?`,
        ...makeOptions(rng, card.constructeur, d, { count: 4, html }),
        explanation: `<b>${esc(card.constructeur)}</b>. ${esc(card.nom)} : ${esc(card.role)}.`,
        meta: { kind: 'aeronef', type, id: card.id },
      };
    }
    if (type === 'pays') {
      const d = [...new Set(rng.shuffle(others.filter((c) => disjoint(c.paysKeys, card.paysKeys))).map((c) => c.pays))];
      return {
        tag: 'Reconnaissance des aéronefs',
        prompt: `De quel pays (ou groupe de pays) est issu le <b>${esc(card.nom)}</b> ?`,
        ...makeOptions(rng, card.pays, d, { count: 4, html }),
        explanation: `<b>${esc(card.pays)}</b> — constructeur : ${esc(card.constructeur)}.`,
        meta: { kind: 'aeronef', type, id: card.id },
      };
    }
    if (type === 'motorisation' && engineSig(card)) {
      const ans = engineSig(card);
      const d = rng.shuffle(ENGINE_SIGS.filter((s) => s !== ans));
      // prefer same engine type with another count, then other types
      d.sort((x, y) => (x.split(' ')[1].slice(0, 8) === ans.split(' ')[1].slice(0, 8) ? -1 : 0) - (y.split(' ')[1].slice(0, 8) === ans.split(' ')[1].slice(0, 8) ? -1 : 0));
      return {
        tag: 'Reconnaissance des aéronefs',
        prompt: `Combien de moteurs, et de quel type, équipent le <b>${esc(card.nom)}</b> ?`,
        ...makeOptions(rng, ans, d, { count: 4, html }),
        explanation: `<b>${esc(card.motorisation)}</b>. ${esc(card.signes)}`,
        meta: { kind: 'aeronef', type, id: card.id, ans },
      };
    }
    // identification from the distinctive features, among aircraft of the same category
    const same = rng.shuffle(others.filter((c) => c.cat === card.cat));
    const pool = [...same, ...rng.shuffle(others.filter((c) => c.cat !== card.cat))].map((c) => c.nom);
    return {
      tag: 'Reconnaissance des aéronefs',
      prompt: `Quel aéronef correspond à cette description ?<br><i>« ${esc(card.signes)} »</i> <span style="color:var(--muted)">(${esc(card.role)})</span>`,
      ...makeOptions(rng, card.nom, pool, { count: 4, html }),
      explanation: `<b>${esc(card.nom)}</b> (${esc(card.constructeur)}, ${esc(card.pays)}). ${esc(card.anecdote || '')}`,
      meta: { kind: 'aeronef', type: 'identification', id: card.id },
    };
  });
}

function bankQuestion(rng, [q, a, d, e, theme]) {
  return {
    tag: theme,
    prompt: esc(q),
    ...makeOptions(rng, a, rng.shuffle(d), { count: 4, html }),
    explanation: `<b>${esc(a)}</b>. ${esc(e || '')}`,
    meta: { kind: 'bank', item: [q, a, d] },
  };
}

export function generate(rng, count, opts = {}) {
  const content = opts.content || 'mix';
  const nAero = content === 'bank' ? 0 : content === 'aero' ? count : Math.round(count * 0.4);
  const nBank = Math.min(count - nAero, CULTURE.length);
  const bank = rng.shuffle(CULTURE).slice(0, nBank).map((it) => bankQuestion(rng, it));
  const aero = [];
  let deck = [];
  const types = ['identification', 'identification', 'constructeur', 'pays', 'motorisation'];
  for (let i = 0; i < count - nBank; i++) {
    if (!deck.length) deck = rng.shuffle(AERONEFS);
    aero.push(aeronefQuestion(rng, deck.pop(), rng.pick(types)));
  }
  return rng.shuffle([...bank, ...aero]).map((q) => ({ layout: 'list', ...q }));
}

export default {
  id: 'culture',
  section: 'eopn',
  title: 'Culture Aéronautique',
  description: 'Testez vos connaissances aéronautiques et militaires à travers des questions à choix multiples.',
  count: 20,
  time: 7 * 60,
  maxCount: 200,
  options: [
    {
      id: 'content', label: 'Contenu', default: 'mix', choices: [
        { value: 'mix', label: 'Mélange (culture générale + reconnaissance des aéronefs)' },
        { value: 'bank', label: 'Culture générale uniquement' },
        { value: 'aero', label: 'Reconnaissance des aéronefs uniquement' },
      ],
    },
  ],
  get instructions() {
    return `<ul><li>Questions à choix multiples (4 propositions) : histoire, armée de l’Air et de l’Espace, mécanique du vol, instruments, navigation, météo, facteurs humains, espace…</li>
      <li>Une partie des questions porte sur les <b>${AERONEFS.length} fiches d’aéronefs</b> (constructeur, pays, motorisation, reconnaissance à partir des signes distinctifs). Apprenez-les avec les <a href="#/flashcards">flashcards</a>.</li>
      <li>Banque de culture générale : ${CULTURE.length} questions. Vous pouvez en ajouter dans <code>data/culture-perso.json</code> (voir <code>data/LISEZMOI.md</code>).</li></ul>`;
  },
  generate,
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="12" width="52" height="40" rx="2"/><path d="M34 22h18M34 30h18M34 38h12"/><path d="M20 20v24M12 34l8-6 8 6M16 42l4-2 4 2" stroke-linejoin="round"/></svg>`,
};
