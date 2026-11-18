import { esc, makeOptions, retry } from '../core/util.js';

export const WORDS = [
  'AVION', 'RADAR', 'PISTE', 'ROTOR', 'HELICE', 'CABINE', 'MOTEUR', 'HANGAR', 'ESCALE', 'PILOTE', 'BALISE', 'VOLET',
  'TRAIN', 'NUAGE', 'ORAGE', 'ALTIMETRE', 'BOUSSOLE', 'CARLINGUE', 'DERIVE', 'FUSELAGE', 'GOUVERNE', 'HUBLOT', 'KEROSENE',
  'LARGAGE', 'MANCHE', 'NACELLE', 'PALONNIER', 'QUILLE', 'REACTEUR', 'SILLAGE', 'TURBINE', 'VIRAGE', 'ESCADRON', 'CAP',
  'ALERTE', 'BASE', 'CIBLE', 'DRONE', 'ESCORTE', 'FREQUENCE', 'MISSION', 'PATROUILLE', 'RAVITAILLEMENT', 'SIGNAL', 'TOUR',
  'VECTEUR', 'ZENITH', 'ANTENNE', 'COCKPIT', 'ECHO', 'LIAISON', 'METEO', 'RADIO', 'SECTEUR', 'TRAJECTOIRE', 'VISEUR',
];

const TABLE_SIZE = 8;
const BLOCK = 15; // a new table every 15 questions

function randomCode(rng) {
  return String(rng.int(1000, 9999));
}

function makeTable(rng) {
  const words = rng.sample(WORDS, TABLE_SIZE);
  const codes = new Set();
  while (codes.size < TABLE_SIZE) codes.add(randomCode(rng));
  const cs = [...codes];
  return words.map((w, i) => ({ word: w, code: cs[i] }));
}

function tableHtml(table) {
  // responsive: word/code pairs flow onto as many columns as the screen allows
  return `<div class="code-grid">${table.map((e) => `<div class="code-item"><b>${e.word}</b><span>${e.code}</span></div>`).join('')}</div>`;
}

function perturb(rng, code) {
  const d = [...code];
  const mode = rng.pick(['swap', 'digit', 'digit']);
  if (mode === 'swap') {
    const i = rng.int(0, 2);
    [d[i], d[i + 1]] = [d[i + 1], d[i]];
  } else {
    const i = rng.int(0, 3);
    const delta = rng.pick([1, -1, 2, -2, 3, 5]);
    let nv = (+d[i] + delta + 10) % 10;
    if (i === 0 && nv === 0) nv = 1;
    d[i] = String(nv);
  }
  if (d[0] === '0') return null; // codes never start with 0 (null is skipped by makeOptions)
  return d.join('');
}

function question(rng, table) {
  return retry(() => {
    const target = rng.pick(table);
    const others = table.filter((e) => e !== target);
    if (rng.chance(0.75)) {
      // word -> code
      const cands = [
        perturb(rng, target.code),
        perturb(rng, target.code),
        ...rng.sample(others, 2).map((e) => e.code),
        perturb(rng, target.code),
        ...others.map((e) => e.code),
      ];
      const { options, answer } = makeOptions(rng, target.code, cands, { count: 5, html: (c) => `<span class="mono">${c}</span>` });
      return {
        tag: 'Mot → code',
        context: tableHtml(table),
        prompt: `Quel est le code du mot <b>${esc(target.word)}</b> ?`,
        options,
        answer,
        layout: 'inline',
        explanation: `${esc(target.word)} = <span class="mono">${target.code}</span>.`,
        meta: { table, target, dir: 'w2c' },
      };
    }
    // code -> word
    const cands = rng.shuffle(others.map((e) => e.word));
    const { options, answer } = makeOptions(rng, target.word, cands, { count: 5 });
    return {
      tag: 'Code → mot',
      context: tableHtml(table),
      prompt: `Quel mot a pour code <span class="mono"><b>${target.code}</b></span> ?`,
      options,
      answer,
      layout: 'inline',
      explanation: `<span class="mono">${target.code}</span> = ${esc(target.word)}.`,
      meta: { table, target, dir: 'c2w' },
    };
  });
}

/* ---------------------------------------------------- codage lettre à lettre */
const VOWELS = 'AEIOU';
const CONSONANTS = 'BCDFGLMNPRSTV';
export function makeLetterKey(rng) {
  const letters = rng.shuffle([...rng.sample([...VOWELS], 3), ...rng.sample([...CONSONANTS], 6)]);
  const digits = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  return letters.map((l, i) => ({ letter: l, digit: String(digits[i]) }));
}
export const encode = (key, word) => [...word].map((c) => key.find((k) => k.letter === c).digit).join('');

function pseudoWord(rng, key) {
  const v = key.filter((k) => VOWELS.includes(k.letter)).map((k) => k.letter);
  const c = key.filter((k) => !VOWELS.includes(k.letter)).map((k) => k.letter);
  const len = rng.int(4, 6);
  const startC = rng.chance(0.7);
  let w = '';
  for (let i = 0; i < len; i++) w += (i % 2 === 0) === startC ? rng.pick(c) : rng.pick(v);
  return w;
}

function letterKeyHtml(key) {
  return `<table class="code-table letter-key"><tr>${key.map((k) => `<td>${k.letter}</td>`).join('')}</tr><tr>${key.map((k) => `<td style="font-weight:400">${k.digit}</td>`).join('')}</tr></table>`;
}

function letterQuestion(rng, key) {
  return retry(() => {
    const word = pseudoWord(rng, key);
    const code = encode(key, word);
    const cands = [];
    for (let t = 0; t < 12; t++) {
      const d = [...code];
      const mode = rng.pick(['swap', 'other', 'other']);
      if (mode === 'swap') {
        const i = rng.int(0, d.length - 2);
        [d[i], d[i + 1]] = [d[i + 1], d[i]];
      } else {
        const i = rng.int(0, d.length - 1);
        d[i] = rng.pick(key.filter((k) => k.digit !== d[i])).digit; // digit of another letter of the key
      }
      cands.push(d.join(''));
    }
    const { options, answer } = makeOptions(rng, code, cands, { count: 5, html: (c) => `<span class="mono">${c}</span>` });
    return {
      tag: 'Codage lettre à lettre',
      context: letterKeyHtml(key),
      prompt: `Codez le mot <b class="mono">${word}</b> à l’aide de la table.`,
      options, answer, layout: 'inline',
      explanation: `${[...word].map((ch) => `${ch} = ${encode(key, ch)}`).join(', ')} → <span class="mono">${code}</span>.`,
      meta: { key, word, variant: 'lettres' },
    };
  });
}

export default {
  id: 'codage',
  section: 'tamic',
  title: 'Codage',
  description: 'À partir de la table mots-codes, retrouvez le code du mot demandé parmi cinq propositions.',
  count: 45,
  time: 150,
  options: [
    {
      id: 'variant', label: 'Variante', default: 'table', choices: [
        { value: 'table', label: '<b>Format officiel</b> — table visible, recherche la plus rapide possible (≈ 3 s par question)' },
        { value: 'memo', label: '<b>Mémorisation</b> — la table est montrée 25 s puis masquée', short: 'Mémorisation', timeFactor: 1.6 },
        { value: 'lettres', label: '<b>Lettre à lettre</b> — chaque lettre a un chiffre : il faut composer le code du mot', short: 'Lettre à lettre', timeFactor: 3 },
      ],
    },
  ],
  instructions: `<ul>
    <li><b>Format officiel</b> : une table associe des mots à des codes à 4 chiffres et reste affichée. C’est une épreuve de <b>vitesse</b> (45 questions en 2 min 30) : la réponse se lit dans la table, la difficulté est de la trouver vite sans se tromper entre des propositions presque identiques (chiffres inversés, un chiffre changé).</li>
    <li><b>Mémorisation</b> : même principe, mais la table disparaît après 25 s ; il faut la retenir.</li>
    <li><b>Lettre à lettre</b> : la table donne un chiffre par lettre ; le code d’un mot s’obtient en enchaînant les chiffres de ses lettres.</li>
    <li>La table change toutes les ${BLOCK} questions. Utilisez le clavier (1–5).</li></ul>`,
  generate: (rng, count, opts = {}) => {
    const variant = opts.variant || 'table';
    const out = [];
    let table = null;
    for (let i = 0; i < count; i++) {
      if (variant === 'lettres') {
        if (i % BLOCK === 0) table = makeLetterKey(rng);
        out.push(letterQuestion(rng, table));
        continue;
      }
      if (i % BLOCK === 0) {
        table = makeTable(rng);
        if (variant === 'memo') out.push({ study: 25, context: tableHtml(table), prompt: 'Mémorisez cette table : elle va disparaître. Vous devrez ensuite retrouver les codes de mémoire.', meta: { table } });
      }
      const q = question(rng, table);
      if (variant === 'memo') {
        q.prompt += ' <span class="hint">(de mémoire)</span>';
        q.memoContext = q.context; // shown in the correction only
        delete q.context;
        q.explanation += ` Table : ${q.memoContext}`;
      }
      out.push(q);
    }
    return out;
  },
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="6" y="8" width="52" height="48"/><path d="M6 20h52M6 32h52M6 44h52M36 8v48"/><text x="9" y="18" font-size="8" fill="currentColor" stroke="none" font-family="monospace">AVION</text><text x="39" y="18" font-size="8" fill="currentColor" stroke="none" font-family="monospace">4712</text><text x="9" y="30" font-size="8" fill="currentColor" stroke="none" font-family="monospace">RADAR</text><text x="39" y="30" font-size="8" fill="currentColor" stroke="none" font-family="monospace">3061</text></svg>`,
};
