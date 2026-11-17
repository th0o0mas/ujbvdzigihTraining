// In-browser test-suite: structural checks on every generator + independent re-computation of answers.
import { TESTS, getTest } from './registry.js';
import { makeRng } from './core/rng.js';
import { fmtNum, fmtClock, fmtHM, fmtTimeOfDay, fmtMinutes, makeOptions, stripHtml } from './core/util.js';
import * as rot from './tests/rotation.js';
import * as cub from './tests/cubes.js';
import * as ori from './tests/orientation.js';
import * as dr from './tests/drones.js';
import * as va from './tests/vaisseau.js';
import { makeSequence, evalSequence } from './tests/secpil.js';
import { AERONEFS, CATEGORIES } from './data/aeronefs-data.js';
import { aeronefQuestion, engineSig } from './tests/culture.js';
import { parseCultureEntry, parseAeronefEntry, loadCustomData, customStatus } from './core/custom.js';
import { note20, weekKey, weekly, globalWeekly } from './core/stats.js';
import { review, INTERVALS } from './flashcards.js';
import { SILHOUETTES } from './data/silhouettes-data.js';
import { silhouetteSvg, extent, VIEWS, shapesFor } from './silhouettes.js';
import * as store from './core/storage.js';
import { mergeFlashcards, cloudEnabled, encryptSecret, decryptSecret, utf8ToB64, b64ToUtf8, validName } from './core/cloud.js';
import { TOTAL as EN_TOTAL } from './tests/anglais.js';
import { PART5, PART6, PART7 } from './data/anglais-data.js';
import { CULTURE } from './data/culture-data.js';
import * as FR from './data/francais-data.js';
import { ARC_GAUGES, steps } from './tests/cadran.js';

await loadCustomData();
const results = [];
let current = null;
function suite(name, fn) {
  current = { name, pass: 0, fail: 0, errors: [] };
  results.push(current);
  try {
    fn();
  } catch (e) {
    fail(`exception: ${e.stack || e}`);
  }
}
function ok(cond, msg) {
  if (cond) current.pass++;
  else fail(msg);
}
function fail(msg) {
  current.fail++;
  if (current.errors.length < 25) current.errors.push(msg);
}
const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

/* ------------------------------------------------------------ utilities */
suite('Utilitaires (formatage, options)', () => {
  ok(fmtNum(1234.5) === '1 234,5', 'fmtNum 1234.5 → ' + fmtNum(1234.5));
  ok(fmtNum(-3) === '−3', 'fmtNum -3');
  ok(fmtNum(0.125, 3) === '0,125', 'fmtNum 0.125');
  ok(fmtNum(2.10) === '2,1', 'fmtNum trailing zero');
  ok(fmtNum(1e6) === '1 000 000', 'fmtNum million');
  ok(fmtClock(125) === '2:05', 'fmtClock');
  ok(fmtClock(-4) === '0:00', 'fmtClock negative');
  ok(fmtHM(105) === '1 h 45', 'fmtHM 105');
  ok(fmtHM(45) === '45 min', 'fmtHM 45');
  ok(fmtTimeOfDay(1500) === '1 h 00', 'fmtTimeOfDay wrap');
  ok(fmtTimeOfDay(-30) === '23 h 30', 'fmtTimeOfDay negative');
  ok(fmtMinutes(210) === '3 min 30', 'fmtMinutes 210');
  ok(fmtMinutes(150) === '2 min 30', 'fmtMinutes 150');
  for (let s = 1; s < 300; s++) {
    const rng = makeRng(s);
    const { options, answer } = makeOptions(rng, 7, [1, 7, 2, 3, 3, 4, 5], { count: 5 });
    ok(options.length === 5 && options[answer].value === 7 && new Set(options.map((o) => o.key)).size === 5, 'makeOptions');
  }
  let threw = false;
  try { makeOptions(makeRng(1), 1, [1, 2], { count: 5 }); } catch { threw = true; }
  ok(threw, 'makeOptions must throw when not enough distractors');
});

/* ------------------------------------------- generic structural checks */
const BAD_TEXT = /\bundefined\b|\bNaN\b|Infinity|\[object /;
const parser = new DOMParser();
function checkSvg(html, where) {
  const svgs = html.match(/<svg[\s\S]*?<\/svg>/g) || [];
  for (const s of svgs) {
    const doc = parser.parseFromString(s, 'image/svg+xml');
    if (doc.getElementsByTagName('parsererror').length) {
      fail(`${where}: SVG invalide`);
      return;
    }
  }
}

function structural(t, q, i, where) {
  const parts = q.parts || [{ options: q.options, answer: q.answer }];
  ok(parts.length >= 1, `${where}: no parts`);
  for (const p of parts) {
    ok(Array.isArray(p.options) && p.options.length >= 2, `${where}: options manquantes`);
    ok(Number.isInteger(p.answer) && p.answer >= 0 && p.answer < p.options.length, `${where}: index de réponse invalide ${p.answer}`);
    const keys = p.options.map((o) => o.key);
    ok(keys.every((k) => typeof k === 'string' && k.length), `${where}: clé d'option vide`);
    ok(new Set(keys).size === keys.length, `${where}: options en double ${JSON.stringify(keys)}`);
    // options must also LOOK different
    const texts = p.options.map((o) => o.html);
    if (!/attention/.test(t.id)) ok(new Set(texts).size === texts.length, `${where}: deux options identiques à l'écran`);
    for (const o of p.options) {
      ok(typeof o.html === 'string' && o.html.trim().length > 0, `${where}: option vide`);
      ok(!BAD_TEXT.test(o.html), `${where}: texte suspect dans une option : ${o.html.slice(0, 80)}`);
      checkSvg(o.html, where);
    }
  }
  for (const f of ['prompt', 'explanation', 'context', 'visual']) {
    if (q[f] === undefined) continue;
    ok(typeof q[f] === 'string', `${where}: ${f} non textuel`);
    ok(!BAD_TEXT.test(stripHtml(q[f])), `${where}: texte suspect dans ${f} : ${stripHtml(q[f]).slice(0, 100)}`);
  }
  ok(typeof q.prompt === 'string' && q.prompt.length > 3, `${where}: énoncé manquant`);
  ok(typeof q.explanation === 'string' && q.explanation.length > 3, `${where}: explication manquante`);
  if (q.visual) checkSvg(q.visual, where);
  if (q.context) checkSvg(q.context, where);
}

const SEEDS = { cubes: 30, cadran: 10, orientation: 10, anglais: 6, rotation: 40 };
/** every combination of a test's options */
function optionCombos(t) {
  let combos = [{}];
  for (const o of t.options || []) combos = combos.flatMap((c) => o.choices.map((ch) => ({ ...c, [o.id]: ch.value })));
  return combos;
}
for (const t of TESTS.filter((x) => x.kind !== 'realtime')) for (const opts of optionCombos(t)) {
  const label = Object.values(opts).join(', ');
  suite(`Structure — ${t.title}${label ? ` (${label})` : ''}`, () => {
    const nSeeds = SEEDS[t.id] || 40;
    const answerHist = {};
    for (let s = 1; s <= nSeeds; s++) {
      const all = t.generate(makeRng(s * 7919), t.count, opts);
      const study = all.filter((q) => q.study);
      study.forEach((q) => ok(q.study > 0 && q.context && q.prompt, `${t.id}: écran de mémorisation incomplet`));
      const qs = all.filter((q) => !q.study);
      const expected = Math.min(t.count, t.maxCount || Infinity);
      ok(qs.length === expected, `${t.id} seed ${s}: ${qs.length} questions au lieu de ${expected}`);
      qs.forEach((q, i) => {
        structural(t, q, i, `${t.id} s${s} q${i + 1}`);
        const a = (q.parts ? q.parts[0].answer : q.answer);
        answerHist[a] = (answerHist[a] || 0) + 1;
      });
      // determinism: same seed → same questions
      if (s === 1) {
        const again = t.generate(makeRng(s * 7919), t.count, opts).filter((q) => !q.study);
        ok(JSON.stringify(again.map((q) => q.prompt + (q.options || q.parts[0].options).map((o) => o.key).join())) ===
           JSON.stringify(qs.map((q) => q.prompt + (q.options || q.parts[0].options).map((o) => o.key).join())), `${t.id}: génération non déterministe`);
      }
    }
    // answer position should be spread over all options (not always A)
    const total = Object.values(answerHist).reduce((a, b) => a + b, 0);
    const maxShare = Math.max(...Object.values(answerHist)) / total;
    if (!['attention', 'vaisseau'].includes(t.id)) ok(Object.keys(answerHist).length >= 3 && maxShare < 0.45, `${t.id}: positions de réponse mal réparties ${JSON.stringify(answerHist)}`);
  });
}

/* ------------------------------------------------------------- Rotation */
suite('Rotation — vérification indépendante', () => {
  ok(rot.gkey(rot.rot90([[1, 0], [0, 0]])) === '01/00', 'rot90 doit tourner dans le sens horaire');
  ok(rot.gkey(rot.rot90(rot.rot90(rot.rot90(rot.rot90([[1, 0, 1], [0, 0, 1], [1, 1, 0]]))))) === '101/001/110', '4 quarts de tour = identité');
  const t = getTest('rotation');
  for (let s = 1; s <= 120; s++) {
    for (const q of t.generate(makeRng(s), 10)) {
      const { model, k } = q.meta;
      const rots = rot.rotations(model).map(rot.gkey);
      ok(q.options[q.answer].key === rots[k], `s${s}: la bonne réponse n'est pas le modèle tourné de ${k * 90}°`);
      q.options.forEach((o, i) => {
        if (i !== q.answer) ok(!rots.includes(o.key), `s${s}: un distracteur est aussi une rotation du modèle`);
      });
    }
  }
});

/* --------------------------------------------------------------- Cubes */
suite('Suite de cubes — vérification indépendante', () => {
  ok(cub.GROUP.length === 24, 'le groupe des rotations doit contenir 24 éléments');
  const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  ok(cub.GROUP.every((M) => det(M) === 1), 'toutes les rotations doivent être directes (det = 1)');
  // a sticker on the front face, symbol pointing up, is drawn with rot 0
  ok(cub.rotIndex('front', [0, 1, 0]) === 0 && cub.rotIndex('front', [1, 0, 0]) === 1, 'rotIndex front');
  ok(cub.rotIndex('top', [0, 0, -1]) === 0 && cub.rotIndex('right', [0, 0, -1]) === 1, 'rotIndex top/right');
  // physical sanity: turning the cube a quarter turn to the right around the vertical axis
  // moves the front sticker to the right face, and its "up" stays up.
  const RYp = cub.GROUP.find((M) => cub.vkey(cub.mul(M, [0, 0, 1])) === '1,0,0' && cub.vkey(cub.mul(M, [0, 1, 0])) === '0,1,0');
  const cube = [
    { sym: 'arrow', n: [0, 0, 1], u: [0, 1, 0] }, { sym: 'tri', n: [0, 1, 0], u: [0, 0, -1] }, { sym: 'L', n: [1, 0, 0], u: [0, 1, 0] },
    { sym: 'plus', n: [0, 0, -1], u: [0, 1, 0] }, { sym: 'disc', n: [-1, 0, 0], u: [0, 1, 0] }, { sym: 'ring', n: [0, -1, 0], u: [0, 0, 1] },
  ];
  const v1 = cub.viewOf(cub.rotateCube(RYp, cube));
  ok(v1.right.sym === 'arrow' && v1.right.rot === 0, 'quart de tour à droite : la face avant passe à droite, flèche toujours vers le haut');
  ok(v1.front.sym === 'disc', 'quart de tour à droite : la face gauche passe devant');
  // seen from above (front edge at the bottom), front→right is an anti-clockwise turn: the symbol now points left
  ok(v1.top.sym === 'tri' && v1.top.rot === 3, 'quart de tour à droite : le symbole du dessus tourne d’un quart de tour anti-horaire');
  ok(cub.RULES.length === 9, 'règles : 6 quarts de tour + 3 demi-tours autour des axes principaux');
  // ---- independent rendering check, in the real DOM: the tip of an arrow drawn on a face must sit
  // where the projection of the 3-D tip point (face centre + 0.2592 × up vector) falls.
  const C30 = Math.cos(Math.PI / 6);
  const project = (p, size) => { const k = size * 0.5; return [size / 2 + (p[0] - p[2]) * k * C30, size / 2 + ((p[0] + p[2]) * 0.5 - p[1]) * k]; };
  const CENTER = { top: [0.5, 1, 0.5], front: [0.5, 0.5, 1], right: [1, 0.5, 0.5] };
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0';
  document.body.appendChild(host);
  let checked = 0;
  for (const R of cub.GROUP) {
    // a cube with arrows everywhere (each with a known up vector), turned by R
    const base = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map((n, i) => ({
      sym: 'arrow', n, u: [[0, 0, -1], [0, 0, 1], [0, 1, 0], [0, -1, 0], [0, 1, 0], [1, 0, 0]][i],
    }));
    const turned = cub.rotateCube(R, base);
    host.innerHTML = cub.cubeSvg(cub.viewOf(turned), 200);
    for (const f of ['top', 'front', 'right']) {
      const st = turned.find((x) => cub.vkey(x.n) === cub.vkey(cub.FACES[f].n));
      const g = host.querySelector(`[data-face="${f}"]`);
      const svg = host.querySelector('svg');
      const p = svg.createSVGPoint();
      // arrow tip in symbol coordinates is (50, 14) before the inner translate/scale
      p.x = 50; p.y = 14;
      const tip = p.matrixTransform(svg.getScreenCTM().inverse().multiply(g.getScreenCTM()));
      const want = project(CENTER[f].map((c, i) => c + 0.2592 * st.u[i]), 200);
      ok(Math.hypot(tip.x - want[0], tip.y - want[1]) < 0.6, `rendu : flèche mal orientée sur la face ${f} (${tip.x.toFixed(1)},${tip.y.toFixed(1)} au lieu de ${want[0].toFixed(1)},${want[1].toFixed(1)})`);
      checked++;
    }
  }
  host.remove();
  ok(checked === 72, 'rendu : 24 orientations × 3 faces vérifiées');
  const t = getTest('cubes');
  for (let s = 1; s <= 80; s++) {
    for (const q of t.generate(makeRng(s), 6)) {
      const { cube: c, R } = q.meta;
      ok(cub.RULES.some((M) => cub.vkey(M.flat()) === cub.vkey(R.flat())), 'règle hors des rotations autorisées');
      let M = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const views = [];
      for (let k = 0; k < 4; k++) {
        views.push(cub.viewOf(cub.rotateCube(M, c)));
        M = cub.matMul(R, M);
      }
      const answerSig = cub.viewSig(views[3]);
      ok(q.options[q.answer].key === answerSig, `s${s}: la bonne réponse ne correspond pas à la 4e vue`);
      const preds = cub.predictions(views.slice(0, 3));
      ok(preds && preds.length === 1 && preds[0] === answerSig, `s${s}: série ambiguë (${preds && preds.length} prédictions)`);
      q.options.forEach((o, i) => i !== q.answer && ok(o.key !== answerSig, `s${s}: distracteur identique à la réponse`));
      // every symbol shown in the answer must have been visible in the series
      const seen = new Set(views.slice(0, 3).flatMap((v) => ['top', 'front', 'right'].map((f) => v[f].sym)));
      ok(['top', 'front', 'right'].every((f) => seen.has(views[3][f].sym)), `s${s}: la réponse montre une face jamais vue`);
    }
  }
});

/* ------------------------------------------------------------ Attention */
suite('Attention — vérification indépendante', () => {
  const t = getTest('attention');
  let none = 0, total = 0;
  for (let s = 1; s <= 100; s++) {
    for (const q of t.generate(makeRng(s), 40)) {
      total++;
      const ser = q.options.slice(0, 4).map((o) => o.value);
      if (q.answer === 4) {
        none++;
        ok(ser.every((x) => x === ser[0]), `s${s}: « pas d'intrus » mais séries différentes`);
      } else {
        const others = ser.filter((_, i) => i !== q.answer);
        ok(others.every((x) => x === others[0]) && ser[q.answer] !== others[0], `s${s}: l'intrus n'est pas la seule série différente`);
        ok(ser[q.answer].length === others[0].length, `s${s}: longueur différente (trop facile)`);
      }
    }
  }
  ok(none / total > 0.1 && none / total < 0.3, `proportion de « pas d'intrus » anormale : ${(none / total).toFixed(2)}`);
});

/* -------------------------------------------------------------- Codage */
suite('Codage — vérification indépendante', () => {
  const t = getTest('codage');
  for (let s = 1; s <= 60; s++) {
    for (const variant of ['table', 'memo']) {
      const all = t.generate(makeRng(s), 45, { variant });
      if (variant === 'memo') {
        ok(all.filter((q) => q.study).length === 3, 'mémorisation : un écran de mémorisation par table (3)');
        ok(all.filter((q) => !q.study).every((q) => !q.context && q.memoContext), 'mémorisation : la table ne doit pas être visible pendant les questions');
      }
      for (const q of all.filter((x) => !x.study)) {
        const { table, target, dir } = q.meta;
        const codes = table.map((e) => e.code);
        ok(new Set(codes).size === codes.length, 'codes en double dans la table');
        ok(new Set(table.map((e) => e.word)).size === table.length, 'mots en double dans la table');
        if (dir === 'w2c') {
          ok(q.options[q.answer].value === table.find((e) => e.word === target.word).code, `s${s}: code faux`);
          ok(q.options.filter((o) => o.value === target.code).length === 1, `s${s}: le code correct apparaît plusieurs fois`);
          ok(q.options.every((o) => /^[1-9]\d{3}$/.test(o.value)), `s${s}: code mal formé`);
        } else {
          ok(table.find((e) => e.word === q.options[q.answer].value).code === target.code, `s${s}: mot faux`);
        }
        const tbl = q.context || q.memoContext;
        ok(tbl.includes(target.word) && tbl.includes(target.code), 'la table ne contient pas la cible');
      }
    }
    // letter-by-letter: re-encode independently from the displayed key
    for (const q of t.generate(makeRng(s), 45, { variant: 'lettres' })) {
      const { key, word } = q.meta;
      ok(new Set(key.map((k) => k.digit)).size === key.length && new Set(key.map((k) => k.letter)).size === key.length, 'table lettre/chiffre ambiguë');
      const map = Object.fromEntries(key.map((k) => [k.letter, k.digit]));
      const want = [...word].map((c) => map[c]).join('');
      ok(q.options[q.answer].value === want, `lettre à lettre : ${word} devrait donner ${want}`);
      ok(q.options.every((o, i) => i === q.answer || (o.value !== want && o.value.length === want.length)), 'lettre à lettre : distracteur invalide');
      ok(key.every((k) => q.context.includes(`<td>${k.letter}</td>`)), 'lettre à lettre : table incomplète');
    }
  }
});

/* -------------------------------------------------------------- Cadran */
suite('Cadran — vérification indépendante (géométrie des aiguilles)', () => {
  for (const g of ARC_GAUGES) {
    ok(Math.abs(g.major / g.minor - Math.round(g.major / g.minor)) < 1e-9, `${g.name}: graduation majeure non multiple de la mineure`);
    ok(Math.abs((g.max - g.min) / g.minor - steps(g)) < 1e-9, `${g.name}: échelle non entière`);
    ok(steps(g) <= 40, `${g.name}: trop de graduations (${steps(g)}) pour être lisible`);
  }
  const t = getTest('cadran');
  const doc = (svg) => parser.parseFromString(svg, 'image/svg+xml');
  // angle (deg, clockwise from 12 o'clock) of a needle line, read back from the SVG
  const angleOf = (line) => {
    const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((a) => +line.getAttribute(a));
    return (Math.atan2(x2 - x1, -(y2 - y1)) * 180) / Math.PI;
  };
  const sameAngle = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180) < 0.35;
  let reverse = 0, half = 0, ccw = 0;
  for (const level of ['normal', 'hard']) {
    for (let s = 1; s <= 50; s++) {
      for (const q of t.generate(makeRng(s), 20, { level })) {
        const m = q.meta;
        const d = doc(q.visual);
        const grp = d.querySelector(`[data-inst="${m.target}"]`);
        if (m.reverse) {
          reverse++;
          ok(q.options[q.answer].value === m.title, 'question inversée : mauvais instrument');
        } else ok(q.options[q.answer].value === m.value, 'la bonne réponse ne correspond pas à la valeur');
        if (m.type === 'arc') {
          const g = ARC_GAUGES.find((x) => x.name === m.title);
          const st = m.style;
          if (m.half) half++;
          if (st.dir === -1) ccw++;
          // value read back from the needle geometry, using the scale's own ticks
          const a = angleOf(grp.querySelector('[data-n="arc"]'));
          const frac = (((a - st.start) * st.dir) % 360 + 360) % 360 / st.sweep;
          const read = g.min + frac * (g.max - g.min);
          ok(Math.abs(read - m.value) < g.minor * 0.02, `${g.name}: l’aiguille indique ${read.toFixed(3)} au lieu de ${m.value}`);
          const k = (m.value - g.min) / g.minor;
          ok(Math.abs(k * 2 - Math.round(k * 2)) < 1e-9 && (m.half ? Math.abs(k - Math.round(k)) > 0.4 : Math.abs(k - Math.round(k)) < 1e-9), `${g.name}: valeur mal placée (${m.value})`);
          ok(m.value > g.min && m.value < g.max, 'valeur hors échelle');
          if (!m.reverse) ok(q.options.every((o) => o.value >= g.min && o.value <= g.max), 'proposition hors échelle');
          ok(level === 'hard' || (!m.half && st.dir === 1), 'niveau normal : pas de demi-graduation ni d’échelle inversée');
          // the tick labels shown must match the scale
          const labels = [...grp.querySelectorAll('text')].map((x) => x.textContent).filter((x) => /^[−\d]/.test(x));
          ok(labels.length >= 2, `${g.name}: pas assez de graduations chiffrées`);
        } else if (m.type === 'alt') {
          const alt = m.value;
          ok(alt % 50 === 0 && alt >= 1000 && alt < (level === 'hard' ? 30000 : 10000), 'altitude invalide');
          ok(sameAngle(angleOf(grp.querySelector('[data-n="hundreds"]')), ((alt % 1000) / 1000) * 360), 'altimètre : grande aiguille mal placée');
          ok(sameAngle(angleOf(grp.querySelector('[data-n="thousands"]')), ((alt % 10000) / 10000) * 360), 'altimètre : petite aiguille mal placée');
          if (level === 'hard') ok(sameAngle(angleOf(grp.querySelector('[data-n="tenk"]')), (alt / 100000) * 360), 'altimètre : aiguille des dizaines de milliers mal placée');
        } else {
          ok(m.value % 5 === 0 && m.value >= 0 && m.value < 360, 'cap invalide');
          if (level === 'hard') ok(+grp.querySelector('[data-card]').getAttribute('data-card') === m.value && grp.innerHTML.includes(`rotate(${-m.value} `), 'cap : rose mal tournée');
          else ok(sameAngle(angleOf(grp.querySelector('[data-n="hdg"]')), m.value), 'cap : aiguille mal placée');
        }
        ok(d.querySelectorAll('[data-inst]').length === (level === 'hard' ? 8 : 6), 'nombre d’instruments');
      }
    }
  }
  ok(reverse > 50 && half > 50 && ccw > 20, `variété insuffisante (inversées ${reverse}, demi-graduations ${half}, échelles inversées ${ccw})`);
});

/* ---------------------------------------------------------- Mathématiques */
const fr = (n, d) => {
  const g = (a, b) => (b ? g(b, a % b) : Math.abs(a));
  const k = g(n, d);
  return d < 0 ? [-n / k, -d / k] : [n / k, d / k];
};
const SOLVE = {
  remise: (m) => (m.P * (100 - m.p)) / 100,
  variations: (m) => (100 * (1 + m.a / 100) * (1 - m.b / 100)) - 100,
  pourcentageDe: (m) => (m.p * m.N) / 100,
  hausseInverse: (m) => m.after / (1 + m.p / 100),
  interets: (m) => m.C * (1 + (m.r * m.n) / 100),
  vitesse: (m) => (m.kind === 'v' ? m.D / (m.t / 60) : m.kind === 'd' ? (m.v * m.t) / 60 : (m.D / m.v) * 60),
  heureArrivee: (m) => m.dep + m.dur,
  consommation: (m) => (m.r * m.t) / 60,
  ouvriers: (m) => (m.a * m.d) / m.b,
  moyenne: (m) => {
    const sum = m.notes.reduce((a, b) => a + b, 0);
    for (let x = 0; x <= 20; x += 0.5) if (close((sum + m.coef * x) / (3 + m.coef), m.M)) return x;
    return NaN;
  },
  reservoir: (m) => ((m.C * m.a) / m.b) * (1 - m.c / m.d),
  ages: (m) => {
    for (let f = 1; f < 120; f++) if (m.k * f + m.n === m.m * (f + m.n)) return f;
    return NaN;
  },
  robinets: (m) => {
    // simulate filling minute by minute in units of 1/(a*b)
    let filled = 0;
    for (let t = 1; t < 10000; t++) {
      filled += m.b + m.a;
      if (filled === m.a * m.b) return t;
      if (filled > m.a * m.b) return NaN;
    }
    return NaN;
  },
  echelle: (m) => (m.d * m.scale) / 100000,
  conversion: (m) => (m.kind === 'kmh2ms' ? m.v / 3.6 : m.kind === 'ms2kmh' ? m.v * 3.6 : m.v * 1.852),
  rectangle: (m) => m.L * (m.P / 2 - m.L),
  multiplication: (m) => m.a * m.b,
  division: (m) => m.D / m.d,
  decimaux: (m) => m.a * m.b,
  equation: (m) => (m.d - m.b) / (m.a - m.c),
  racine: (m) => Math.sqrt(m.sq),
  allerRetour: (m) => (2 * m.v1 * m.v2) / (m.v1 + m.v2),
  rencontre: (m) => (m.ask === 'time' ? (m.D / (m.v1 + m.v2)) * 60 : (m.v1 * m.D) / (m.v1 + m.v2)),
  rattrapage: (m) => {
    // simulate in seconds
    for (let sec = 1; sec < 100000; sec++) {
      const a = (m.vA * (sec + m.delay * 60)) / 3600, b = (m.vB * sec) / 3600;
      if (b >= a - 1e-9) return sec / 60;
    }
    return NaN;
  },
  billets: (m) => {
    for (let c = 0; c <= m.n; c++) if (m.a * (m.n - c) + m.b * c === m.T) return c;
    return NaN;
  },
  pythagore: (m) => Math.hypot(m.x, m.y),
  vent: (m) => (m.D / (m.head ? m.tas - m.w : m.tas + m.w)) * 60,
  descente: (m) => (m.from - m.to) / m.rate,
  fuseaux: (m) => m.dep + m.dur + (m.z2 - m.z1) * 60,
  volume: (m) => m.L * m.l * m.h * 1000,
  cercle: (m) => (m.ask === 'aire' ? 3.14 * m.r * m.r : 2 * 3.14 * m.r),
  melange: (m) => (m.x * m.a + m.y * m.b) / (m.x + m.y),
  croissance: (m) => m.N0 * (1 + m.p / 100) ** 2,
};
function checkSuite(m) {
  const t = [...m.terms, m.next];
  const d = t.slice(1).map((x, i) => x - t[i]);
  switch (m.kind) {
    case 'arith': return d.every((x) => x === d[0]);
    case 'geom': return t.slice(1).every((x, i) => x === t[i] * (t[1] / t[0]));
    case 'diff': return d.slice(1).every((x, i) => x - d[i] === d[1] - d[0]);
    case 'alt': return d.every((x, i) => x === d[i % 2]);
    case 'affine': {
      const mm = (t[2] - t[1]) / (t[1] - t[0]);
      const c = t[1] - mm * t[0];
      return t.slice(1).every((x, i) => x === mm * t[i] + c);
    }
    case 'fibo': return t.slice(2).every((x, i) => x === t[i] + t[i + 1]);
  }
  return false;
}
for (const id of ['maths', 'math1', 'math3']) {
  suite(`${getTest(id).title} — re-calcul indépendant`, () => {
    const t = getTest(id);
    const seenTypes = new Set();
    for (let s = 1; s <= 150; s++) {
      for (const q of t.generate(makeRng(s), t.count)) {
        const m = q.meta;
        seenTypes.add(m.type);
        const chosen = q.options[q.answer].value;
        if (m.type === 'suite') {
          ok(checkSuite(m) && chosen === m.next, `suite ${m.kind} incohérente : ${m.terms} → ${m.next}`);
        } else if (m.type === 'fractions') {
          const { op, a, b, c, d } = m;
          const r = op === '+' ? fr(a * d + c * b, b * d) : op === '−' ? fr(a * d - c * b, b * d) : op === '×' ? fr(a * c, b * d) : fr(a * d, b * c);
          ok(chosen[0] === r[0] && chosen[1] === r[1], `fraction fausse ${a}/${b} ${op} ${c}/${d}`);
          q.options.forEach((o, i) => i !== q.answer && ok(o.value[0] * r[1] !== r[0] * o.value[1], 'un distracteur de fraction vaut la bonne réponse'));
        } else if (m.type === 'probabilite') {
          const r = m.kind === 'both' ? fr(m.r * (m.r - 1), (m.r + m.b) * (m.r + m.b - 1)) : fr(m.r, m.r + m.b);
          ok(chosen[0] === r[0] && chosen[1] === r[1], 'probabilité fausse');
          q.options.forEach((o, i) => i !== q.answer && ok(o.value[0] * r[1] !== r[0] * o.value[1], 'un distracteur de probabilité vaut la bonne réponse'));
        } else if (m.type === 'puissances') {
          const want = m.a * 10 ** m.p * m.b * 10 ** m.q;
          const rel = (x, y) => Math.abs(x - y) <= 1e-9 * Math.abs(y);
          ok(rel(chosen[0] * 10 ** chosen[1], want), 'puissance fausse');
          q.options.forEach((o, i) => i !== q.answer && ok(!rel(o.value[0] * 10 ** o.value[1], want), 'un distracteur de puissance vaut la bonne réponse'));
        } else {
          const f = SOLVE[m.type];
          ok(!!f, `type sans vérificateur : ${m.type}`);
          if (!f) continue;
          const want = f(m);
          ok(Number.isFinite(want) && close(chosen, want), `${m.type}: réponse ${chosen} ≠ attendu ${want} (${JSON.stringify(m)})`);
          q.options.forEach((o, i) => i !== q.answer && ok(!close(o.value, want), `${m.type}: un distracteur vaut la bonne réponse`));
          if (['remise', 'interets', 'heureArrivee', 'consommation', 'ouvriers', 'reservoir', 'ages', 'robinets', 'multiplication', 'division', 'racine', 'billets', 'descente', 'rattrapage', 'allerRetour'].includes(m.type)) {
            ok(Number.isInteger(Math.round(want * 1e9) / 1e9), `${m.type}: résultat non entier ${want}`);
          }
        }
        ok(q.options.length === 5, 'il faut 5 propositions');
      }
    }
    ok(seenTypes.size >= 14, `${id}: seulement ${seenTypes.size} types de problèmes générés`);
  });
}

/* ---------------------------------------------------------- Orientation */
suite('Orientation — vérification indépendante', () => {
  const near = (u, v) => u.every((x, i) => Math.abs(x - v[i]) < 1e-9);
  ok(near(ori.bodyToWorld([1, 0, 0], { hdg: 90, pitch: 0, roll: 0 }), [1, 0, 0]), 'cap 090 : le nez doit pointer vers l’Est');
  ok(near(ori.bodyToWorld([1, 0, 0], { hdg: 0, pitch: 0, roll: 0 }), [0, 1, 0]), 'cap 000 : le nez doit pointer vers le Nord');
  ok(near(ori.bodyToWorld([0, 1, 0], { hdg: 0, pitch: 0, roll: 0 }), [1, 0, 0]), 'cap 000 : l’aile droite pointe vers l’Est');
  ok(ori.bodyToWorld([0, 1, 0], { hdg: 0, pitch: 0, roll: 45 })[2] < 0, 'inclinaison à droite : l’aile droite descend');
  ok(ori.bodyToWorld([1, 0, 0], { hdg: 270, pitch: 20, roll: 0 })[2] > 0, 'assiette positive : le nez monte');
  ok(ori.bodyToWorld([1, 0, 0], { hdg: 180, pitch: 0, roll: 0 })[1] < -0.99, 'cap 180 : nez vers le Sud');
  ok(ori.project([0, 10, 0])[1] > 0 && ori.project([0, 10, 0])[2] > 0, 'un point au Nord est plus haut et plus loin à l’écran');
  // attitude indicator: roll right → horizon rotated counter-clockwise (negative SVG angle)
  ok(ori.attitudeSvg({ pitch: 0, roll: 45 }).includes('rotate(-45 70 70)'), 'horizon artificiel : sens de rotation');
  ok(ori.attitudeSvg({ pitch: 20, roll: 0 }).includes('translate(0 40)'), 'horizon artificiel : nez haut → horizon descend');
  ok(ori.headingIndicatorSvg(90).includes('rotate(-90 70 70)'), 'conservateur de cap : rose tournée');
  const t = getTest('orientation');
  for (let s = 1; s <= 150; s++) {
    for (const q of t.generate(makeRng(s), 5)) {
      ok(q.options[q.answer].key === ori.attKey(q.meta.att), `s${s}: mauvaise image désignée`);
      ok(q.options.length === 4, '4 propositions attendues');
      q.options.forEach((o, i) => i !== q.answer && ok(o.key !== q.options[q.answer].key, 'distracteur identique'));
      ok(q.options.every((o) => o.html !== q.options[q.answer].html || o === q.options[q.answer]), `s${s}: deux images identiques`);
    }
  }
  for (let s = 1; s <= 120; s++) {
    for (const q of t.generate(makeRng(s), 4, { level: 'hard' })) {
      ok(q.options.length === 5 && q.options[q.answer].key === ori.attKey(q.meta.att), `difficile s${s}: mauvaise image désignée`);
      ok(new Set(q.options.map((o) => o.html)).size === 5, `difficile s${s}: deux images identiques`);
      ok([-60, -30, 0, 30, 60].includes(q.meta.att.roll), 'difficile : inclinaison hors liste');
    }
  }
});

/* -------------------------------------------------------------- Drones */
suite('Priorisation Drones — règles', () => {
  const D = (batt, dist, alt, alert) => ({ batt, dist, alt, alert });
  const cases = [
    [[D(90, 5, 2000, 'none'), D(50, 10, 1200, 'traffic'), D(10, 20, 900, 'intrusion'), D(60, 3, 2500, 'link')], 1, 1],
    [[D(90, 5, 2000, 'traffic'), D(50, 10, 1200, 'traffic'), D(10, 20, 900, 'none'), D(60, 3, 2500, 'link')], 1, 1],
    [[D(90, 5, 2000, 'traffic'), D(50, 10, 2100, 'link'), D(10, 20, 900, 'none'), D(60, 3, 2500, 'link')], 0, 0],
    [[D(30, 20, 2000, 'none'), D(50, 10, 1200, 'link'), D(70, 20, 800, 'intrusion'), D(60, 3, 2500, 'none')], 2, 2],
    [[D(30, 20, 2000, 'none'), D(50, 10, 1200, 'link'), D(35, 20, 800, 'none'), D(60, 3, 2500, 'none')], 2, 3],
    [[D(80, 20, 2000, 'none'), D(50, 10, 1200, 'link'), D(90, 20, 800, 'none'), D(60, 3, 2500, 'link')], 1, 4],
    [[D(80, 20, 2000, 'none'), D(50, 10, 1200, 'none'), D(90, 20, 800, 'none'), D(60, 3, 2500, 'none')], 1, 5],
    [[D(15, 20, 600, 'intrusion'), D(50, 10, 1200, 'none'), D(30, 20, 800, 'none'), D(60, 3, 2500, 'none')], 0, 2],
  ];
  cases.forEach(([ds, idx, msg], i) => {
    const r = dr.solve(ds);
    ok(r.index === idx && r.msg === msg, `cas ${i + 1}: attendu drone ${idx}/msg ${msg}, obtenu ${r.index}/${r.msg}`);
  });
  // independent re-implementation over generated questions
  const level = (d) => (d.alert === 'traffic' ? 1 : d.alert === 'intrusion' ? 2 : d.batt < 2 * d.dist ? 3 : d.alert === 'link' ? 4 : 5);
  const t = getTest('drones');
  const levels = {};
  for (let s = 1; s <= 200; s++) {
    for (const q of t.generate(makeRng(s), 18)) {
      const ds = q.meta.drones;
      const L = ds.map(level);
      const best = Math.min(...L);
      levels[best] = (levels[best] || 0) + 1;
      const cands = ds.map((d, i) => i).filter((i) => L[i] === best);
      const key = best === 5 ? (i) => ds[i].batt : (i) => ds[i].alt;
      const minV = Math.min(...cands.map(key));
      const winners = cands.filter((i) => key(i) === minV);
      ok(winners.length === 1, 'plusieurs drones à égalité parfaite');
      ok(q.parts[0].answer === winners[0], `s${s}: mauvais drone`);
      const d = ds[winners[0]];
      const msg = best === 1 ? (d.alt >= 1500 ? 0 : 1) : best === 2 ? 2 : best === 3 ? 3 : best === 4 ? 4 : 5;
      ok(q.parts[1].answer === msg, `s${s}: mauvais message`);
    }
  }
  ok(Object.keys(levels).length === 5, `tous les niveaux de priorité doivent apparaître : ${JSON.stringify(levels)}`);
});

/* ------------------------------------------------------------- Vaisseau */
suite('Priorisation Vaisseau — règles', () => {
  const A = (sys, level, handled = false) => ({ sys, level, handled });
  const cases = [
    ['Croisière', [A('Communications', 0), A('Énergie', 1), A('Oxygène', 1)], 'Communications'],
    ['Croisière', [A('Coque', 1), A('Énergie', 0), A('Oxygène', 0)], 'Énergie'],
    ['Croisière', [A('Coque', 0), A('Énergie', 0, true), A('Oxygène', 0)], 'Oxygène'],
    ['Combat', [A('Coque', 0), A('Oxygène', 0), A('Propulsion', 2)], 'Coque'],
    ['Amarrage', [A('Coque', 1), A('Oxygène', 1), A('Propulsion', 1)], 'Propulsion'],
    ['Amarrage', [A('Coque', 1), A('Oxygène', 1), A('Propulsion', 2)], 'Oxygène'],
    ['Combat', [A('Communications', 2), A('Énergie', 1), A('Oxygène', 1, true)], 'Énergie'],
  ];
  cases.forEach(([ph, al, want], i) => ok(va.solve(ph, al).sys === want, `cas ${i + 1}: attendu ${want}, obtenu ${va.solve(ph, al).sys}`));
  const ORDER = { Croisière: va.PHASES['Croisière'], Amarrage: va.PHASES['Amarrage'], Combat: va.PHASES['Combat'] };
  const t = getTest('vaisseau');
  for (let s = 1; s <= 200; s++) {
    for (const q of t.generate(makeRng(s), 30)) {
      const { phase, alerts } = q.meta;
      const act = alerts.filter((a) => !a.handled);
      let want;
      if (act.some((a) => a.sys === 'Énergie' && a.level === 0)) want = 'Énergie';
      else {
        const sorted = [...act].sort((x, y) => x.level - y.level || ORDER[phase].indexOf(x.sys) - ORDER[phase].indexOf(y.sys));
        want = sorted[0].sys;
      }
      ok(q.options[q.answer].key === want, `s${s}: attendu ${want}`);
      ok(new Set(alerts.map((a) => a.sys)).size === alerts.length, 'un système apparaît deux fois');
    }
  }
});

/* ------------------------------------------------------------- Banques */
function bankCheck(name, items, getAns, getDist, getKey) {
  const keys = new Set();
  items.forEach((it, i) => {
    const a = getAns(it), d = getDist(it);
    ok(typeof a === 'string' && a.trim().length > 0, `${name} #${i}: réponse vide`);
    ok(d.length >= 3, `${name} #${i}: pas assez de distracteurs`);
    ok(!d.includes(a), `${name} #${i}: la réponse figure parmi les distracteurs (${a})`);
    ok(new Set(d).size === d.length, `${name} #${i}: distracteurs en double`);
    ok(d.every((x) => x.trim().toLowerCase() !== a.trim().toLowerCase()), `${name} #${i}: distracteur équivalent à la réponse`);
    const k = getKey(it);
    ok(!keys.has(k), `${name} #${i}: question en double (${k})`);
    keys.add(k);
  });
}
suite('Banques de questions — cohérence', () => {
  bankCheck('Synonymes', FR.SYNONYMES, (x) => x[1], (x) => x[2], (x) => x[0]);
  bankCheck('Antonymes', FR.ANTONYMES, (x) => x[1], (x) => x[2], (x) => x[0]);
  bankCheck('Définitions', FR.DEFINITIONS, (x) => x[1], (x) => x[2], (x) => x[0]);
  bankCheck('Orthographe', FR.ORTHOGRAPHE, (x) => x[0], (x) => x[1], (x) => x[0]);
  bankCheck('Grammaire', FR.GRAMMAIRE, (x) => x[1], (x) => x[2], (x) => x[0]);
  bankCheck('Expressions', FR.EXPRESSIONS, (x) => x[1], (x) => x[2], (x) => x[0]);
  FR.GRAMMAIRE.forEach((g, i) => ok(g[0].split('___').length === 2, `Grammaire #${i}: il faut exactement un blanc`));
  FR.SYNONYMES.forEach((s, i) => ok(s[2].length === 4, `Synonymes #${i}: 4 distracteurs attendus`));
  FR.INTRUS.forEach(([w, k], i) => ok(w.length === 5 && k >= 0 && k < 5 && new Set(w).size === 5, `Intrus #${i}`));
  bankCheck('Culture', CULTURE, (x) => x[1], (x) => x[2], (x) => x[0]);
  CULTURE.forEach((c, i) => ok(c[2].length === 3 && c[3] && c[4], `Culture #${i}: format`));
  bankCheck('Anglais part 5', PART5, (x) => x[1], (x) => x[2], (x) => x[0]);
  PART5.forEach((p, i) => ok(p[0].split('____').length === 2 && p[2].length === 3 && p[3], `Anglais part 5 #${i}: format (« ${p[0]} »)`));
  PART6.forEach((g, i) => {
    ok(g.blanks.length === 4, `Part 6 #${i}: 4 blancs attendus`);
    for (let k = 1; k <= 4; k++) ok(g.text.split(`[${k}]`).length === 2, `Part 6 #${i}: blanc [${k}] absent ou en double`);
    g.blanks.forEach(([a, d], j) => ok(d.length === 3 && !d.includes(a) && new Set(d).size === 3, `Part 6 #${i} blanc ${j + 1}`));
  });
  PART7.forEach((g, i) => g.questions.forEach(([q, a, d], j) => ok(d.length === 3 && !d.includes(a) && new Set(d).size === 3, `Part 7 #${i} q${j + 1}`)));
  ok(EN_TOTAL >= 150, `la banque d'anglais doit couvrir un examen complet de 150 questions (actuellement ${EN_TOTAL})`);
  const full = getTest('anglais').generate(makeRng(5), 150);
  ok(full.length === 150, 'examen d’anglais : 150 questions');
  ok(new Set(full.map((q) => q.prompt + (q.context || ''))).size === 150, 'examen d’anglais : questions en double');
  for (const n of [10, 25, 50, 100]) ok(getTest('anglais').generate(makeRng(n), n).length === n, `anglais : session de ${n} questions`);
  const fr31 = getTest('francais').generate(makeRng(3), 31);
  ok(new Set(fr31.map((q) => q.prompt + q.options.map((o) => o.key).join())).size === 31, 'français : questions en double dans une série');
  ok(new Set(fr31.map((q) => q.tag)).size === 7, 'français : les 7 types doivent apparaître');
  // the answer shown as correct must be the bank answer
  for (const q of getTest('culture').generate(makeRng(9), CULTURE.length, { content: 'bank' })) ok(q.options[q.answer].value === q.meta.item[1], 'culture : mauvaise réponse marquée');
});

/* ------------------------------------------------------------ SECPIL */
suite('SECPIL — suites de nombres', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    let mults = 0;
    for (let s = 1; s < 400; s++) {
      const seq = makeSequence(makeRng(s), level);
      // independent evaluation from the DISPLAYED text
      let acc = 0;
      for (const it of seq) {
        const txt = it.text.replace('−', '-').replace(/\s/g, '');
        if (it === seq[0]) acc = /^-?\d+$/.test(txt) ? +txt : NaN;
        else if (/^[+-]\d+$/.test(txt)) acc += +txt;
        else if (/^×\(?(-?\d+)\)?$/.test(txt)) { acc *= +/^×\(?(-?\d+)\)?$/.exec(txt)[1]; mults++; }
        else acc = NaN;
      }
      ok(Number.isInteger(acc) && acc === evalSequence(seq), `${level}: total incohérent (${seq.map((x) => x.text).join(' ')})`);
      ok(seq.length >= 10 && seq.every((it, i) => i === 0 || it.at - seq[i - 1].at > 1), `${level}: rythme d’affichage incorrect`);
      ok(seq[seq.length - 1].at < 52, `${level}: nombre affiché après la fin de la manche`);
    }
    ok(level === 'hard' ? mults > 100 : mults === 0, `${level}: multiplications ${mults}`);
  }
});

/* ------------------------------------------------------ Aéronefs & culture */
suite('Fiches aéronefs et questions de reconnaissance', () => {
  const names = AERONEFS.map((a) => a.nom.toLowerCase());
  ok(new Set(names).size === names.length, 'noms en double');
  ok(new Set(AERONEFS.map((a) => a.id)).size === AERONEFS.length, 'identifiants en double');
  for (const a of AERONEFS) {
    for (const f of ['nom', 'cat', 'constructeur', 'pays', 'role', 'motorisation', 'signes']) ok(typeof a[f] === 'string' && a[f].length > 1, `${a.nom}: champ ${f} vide`);
    ok(a.groupe.length && a.paysKeys.length, `${a.nom}: groupe/pays manquant`);
    // the description used for identification must not give away the name
    for (const tok of a.nom.split(/[\s/()-]+/).filter((x) => x.length >= 3 && !['Mil', 'Airbus', 'Boeing', 'Saab'].includes(x))) {
      ok(!a.signes.toLowerCase().includes(tok.toLowerCase()), `${a.nom}: les signes distinctifs contiennent « ${tok} »`);
    }
    ok(!!engineSig(a), `${a.nom}: motorisation non reconnue (${a.motorisation})`);
  }
  for (const c of CATEGORIES) ok(AERONEFS.filter((a) => a.cat === c).length >= 5, `catégorie ${c} : trop peu de fiches`);
  for (let s = 1; s <= 300; s++) {
    const rng = makeRng(s);
    const card = rng.pick(AERONEFS);
    for (const type of ['constructeur', 'pays', 'identification', 'motorisation', 'silhouette']) {
      const q = aeronefQuestion(rng, card, type);
      ok(q.options.length === 4, 'reconnaissance : 4 propositions');
      const val = q.options[q.answer].value;
      if (type === 'constructeur') {
        ok(val === card.constructeur, 'constructeur faux');
        q.options.forEach((o, i) => i !== q.answer && ok(!AERONEFS.some((x) => x.constructeur === o.value && x.groupe.some((g) => card.groupe.includes(g))), `constructeur : distracteur partiellement juste (${o.value} pour ${card.nom})`));
      } else if (type === 'pays') {
        ok(val === card.pays, 'pays faux');
        q.options.forEach((o, i) => i !== q.answer && ok(!AERONEFS.some((x) => x.pays === o.value && x.paysKeys.some((g) => card.paysKeys.includes(g))), `pays : distracteur partiellement juste (${o.value} pour ${card.nom})`));
      } else if (type === 'silhouette') {
        ok(val === card.nom && q.visual.includes('<svg'), 'silhouette : mauvaise réponse ou image absente');
        ok(q.options.every((o) => SILHOUETTES[AERONEFS.find((x) => x.nom === o.value).id]), 'silhouette : proposition sans silhouette');
      } else if (type === 'identification') {
        ok(val === card.nom, 'identification fausse');
        ok(q.options.every((o, i) => i === q.answer || AERONEFS.find((x) => x.nom === o.value).signes !== card.signes), 'identification : deux fiches identiques');
      } else {
        ok(val === engineSig(card), 'motorisation fausse');
        ok(new Set(q.options.map((o) => o.value)).size === 4, 'motorisation : doublons');
      }
    }
  }
  // the culture test mixes both sources
  const mix = getTest('culture').generate(makeRng(4), 20, { content: 'mix' });
  ok(mix.filter((q) => q.meta.kind === 'aeronef').length === 8 && mix.filter((q) => q.meta.kind === 'bank').length === 12, 'culture : mélange 60/40');
  ok(getTest('culture').generate(makeRng(4), 20, { content: 'aero' }).every((q) => q.meta.kind === 'aeronef'), 'culture : aéronefs seuls');
});

/* ------------------------------------------------------------ silhouettes */
suite('Silhouettes : couverture, validité et proportions', () => {
  const builtIn = AERONEFS.filter((a) => !a.perso);
  ok(builtIn.every((a) => SILHOUETTES[a.id]), `fiches sans silhouette : ${builtIn.filter((a) => !SILHOUETTES[a.id]).map((a) => a.id).join(', ')}`);
  ok(Object.keys(SILHOUETTES).every((id) => AERONEFS.some((a) => a.id === id)), `silhouettes sans fiche : ${Object.keys(SILHOUETTES).filter((id) => !AERONEFS.some((a) => a.id === id)).join(', ')}`);
  const sigs = new Set();
  for (const [id, s] of Object.entries(SILHOUETTES)) {
    let sig = '';
    for (const v of Object.keys(VIEWS)) {
      const shapes = shapesFor(s, v);
      ok(shapes.length >= (s.body === 'flyingwing' ? 1 : 3), `${id} ${v} : silhouette vide`);
      const bad = shapes.some((sh) => JSON.stringify(sh).match(/null|NaN/));
      ok(!bad, `${id} ${v} : coordonnées invalides`);
      const svg = silhouetteSvg(s, v);
      ok(!parser.parseFromString(svg, 'image/svg+xml').getElementsByTagName('parsererror').length, `${id} ${v} : SVG invalide`);
      sig += svg;
    }
    ok(!sigs.has(sig), `${id} : silhouette identique à une autre`);
    sigs.add(sig);
    // drawn dimensions must match the real ones (± 15 %)
    const plan = extent(s, 'dessous'), side = extent(s, 'profil');
    const near = (a, b, tol = 0.15) => Math.abs(a - b) <= tol * b;
    if (s.heli) {
      const d = Math.max(...(s.rotors || [s.rotor]).map((r) => r.d));
      ok(near(plan.w, d, 0.05), `${id} : largeur vue de dessous ${plan.w.toFixed(1)} m ≠ rotor ${d} m`);
    } else if (!s.tiltrotor) {
      const span = s.wing.span;
      ok(near(plan.w, span) || plan.w >= span, `${id} : envergure dessinée ${plan.w.toFixed(1)} m ≠ ${span} m`);
      ok(plan.w <= span * 1.15, `${id} : silhouette plus large que l’envergure (${plan.w.toFixed(1)} m)`);
      ok(near(plan.h, s.L, 0.2), `${id} : longueur vue de dessous ${plan.h.toFixed(1)} m ≠ ${s.L} m`);
      ok(near(side.w, s.L, 0.2), `${id} : longueur de profil ${side.w.toFixed(1)} m ≠ ${s.L} m`);
    }
  }
  // flashcards in silhouette mode: separate progress keys, accepted by the sanitiser
  ok(Object.keys(mergeFlashcards({}, { 'sil-rafale': { box: 2, due: 1, ok: 1, ko: 0 } })).includes('sil-rafale'), 'progression silhouette rejetée');
});

/* ------------------------------------------------- fichiers personnels */
suite('Fichiers personnels — validation', () => {
  const good = { question: 'Q ?', reponse: 'A', distracteurs: ['B', 'C', 'D'] };
  ok(parseCultureEntry(good)[1] === 'A', 'entrée culture valide refusée');
  const bad = [{ ...good, distracteurs: ['B', 'C'] }, { ...good, reponse: '' }, { ...good, distracteurs: ['B', 'C', 'a'] }, null, { question: 'x' }];
  bad.forEach((b, i) => {
    let threw = false;
    try { parseCultureEntry(b); } catch { threw = true; }
    ok(threw, `entrée culture invalide n°${i + 1} acceptée`);
  });
  const card = { nom: 'Test X1', categorie: 'Avion civil', constructeur: 'C', pays: 'P', role: 'R', motorisation: '2 turboréacteurs', signes: 'S' };
  ok(parseAeronefEntry(card).nom === 'Test X1', 'fiche valide refusée');
  let threw = false;
  try { parseAeronefEntry({ ...card, signes: 'Le Test X1 est…' }); } catch { threw = true; }
  ok(threw, 'fiche dont les signes contiennent le nom acceptée');
  ok(customStatus.errors.length === 0, `erreurs dans vos fichiers personnels : ${customStatus.errors.join(' | ')}`);
});

/* ---------------------------------------------- notation, semaines, Leitner */
suite('Notation, historique par semaine, flashcards', () => {
  ok(note20(100) === 20 && note20(73) === 14.6 && note20(0) === 0, 'note sur 20');
  // 2026-11-16 is a Monday; 2026-11-22 a Sunday; 2026-11-23 next Monday
  ok(weekKey(new Date(2026, 10, 16, 0, 5).getTime()) === '2026-11-16', 'semaine : lundi');
  ok(weekKey(new Date(2026, 10, 22, 23, 50).getTime()) === '2026-11-16', 'semaine : dimanche soir');
  ok(weekKey(new Date(2026, 10, 23, 8).getTime()) === '2026-11-23', 'semaine : lundi suivant');
  ok(weekKey(new Date(2027, 0, 2).getTime()) === '2026-12-28', 'semaine à cheval sur deux années');
  const d = (y, m, dd) => new Date(y, m, dd, 12).getTime();
  const w = weekly([{ date: d(2026, 10, 17), pct: 40 }, { date: d(2026, 10, 18), pct: 60 }, { date: d(2026, 10, 24), pct: 90 }]);
  ok(w.length === 2 && w[0].avg === 50 && w[0].sessions === 2 && w[1].best === 90, 'agrégation hebdomadaire');
  const g = globalWeekly({ a: [{ date: d(2026, 10, 17), pct: 100 }, { date: d(2026, 10, 18), pct: 100 }, { date: d(2026, 10, 19), pct: 100 }], b: [{ date: d(2026, 10, 17), pct: 0 }] });
  ok(g.length === 1 && g[0].avg === 50 && g[0].sessions === 4, 'moyenne générale : chaque épreuve pèse autant');
  // Leitner
  const now = 1e12;
  let st = review(undefined, 2, now);
  ok(st.box === 1 && st.due === now + INTERVALS[1] * 86400000, 'Leitner : première bonne réponse');
  st = review(st, 2, now);
  st = review(st, 2, now);
  ok(st.box === 3, 'Leitner : progression d’une boîte par bonne réponse');
  ok(review(st, 1, now).box === 3, 'Leitner : hésitant = même boîte');
  ok(review(st, 0, now).box === 1, 'Leitner : erreur = retour en boîte 1');
  let top = st;
  for (let i = 0; i < 10; i++) top = review(top, 2, now);
  ok(top.box === 5, 'Leitner : boîte maximale 5');
});

/* ------------------------------------------- comptes et synchronisation */
suite('Données par utilisateur et fusion lors de la synchronisation', () => {
  // isolation between users (run on scratch user ids, restored afterwards)
  const prev = store.currentUser();
  store.setUser('test-user-A');
  store.setDoc('history', { rotation: [{ date: 1, pct: 50 }] }, { silent: true });
  store.setUser('test-user-B');
  ok(Object.keys(store.loadAll()).length === 0, 'un utilisateur voit les résultats d’un autre');
  store.setDoc('history', { cubes: [{ date: 2, pct: 80 }] }, { silent: true });
  store.setUser('test-user-A');
  ok(store.loadAll().rotation?.length === 1 && !store.loadAll().cubes, 'résultats mélangés entre utilisateurs');
  for (const u of ['test-user-A', 'test-user-B']) localStorage.removeItem(`eopn-training.history.v1:${u}`);
  store.setUser(prev);
  // history merge: union without duplicates, sorted
  const { all, added } = store.mergeHistories(
    { a: [{ date: 1, pct: 10 }, { date: 3, pct: 30 }] },
    { a: [{ date: 2, pct: 20 }, { date: 3, pct: 30 }], b: [{ date: 5, pct: 50 }], bad: 'x' },
  );
  ok(added === 2 && all.a.map((e) => e.date).join() === '1,2,3' && all.b.length === 1 && !all.bad, 'fusion des historiques');
  // flashcards merge: the most reviewed state wins
  const m = mergeFlashcards({ x: { box: 3, ok: 3, ko: 0, due: 5 }, y: { box: 1, ok: 0, ko: 1, due: 1 } }, { x: { box: 1, ok: 1, ko: 0, due: 9 }, y: { box: 2, ok: 1, ko: 1, due: 2 }, z: { box: 1, ok: 1, ko: 0, due: 3 } });
  ok(m.x.box === 3 && m.y.box === 2 && m.z.box === 1, 'fusion des flashcards');
  ok(cloudEnabled === false || typeof cloudEnabled === 'boolean', 'configuration');
});

/* --------------------------------------------- chiffrement des jetons */
const secret = 'github_pat_EXEMPLE_0123456789_éàü';
const entryA = await encryptSecret(secret, 'mot de passe correct', 1000);
const entryB = await encryptSecret(secret, 'mot de passe correct', 1000);
const cryptoRes = {
  good: await decryptSecret(entryA, 'mot de passe correct'),
  bad: await decryptSecret(entryA, 'mot de passe incorrect'),
  tampered: await decryptSecret({ ...entryA, data: entryA.data.slice(0, -4) + (entryA.data.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA') }, 'mot de passe correct'),
};
suite('Connexion : chiffrement du jeton et encodage', () => {
  ok(cryptoRes.good === secret, 'le bon mot de passe doit déchiffrer le jeton');
  ok(cryptoRes.bad === null, 'un mauvais mot de passe ne doit rien déchiffrer');
  ok(cryptoRes.tampered === null, 'une entrée modifiée doit être rejetée');
  ok(entryA.salt !== entryB.salt && entryA.iv !== entryB.iv && entryA.data !== entryB.data, 'sel et vecteur doivent être aléatoires');
  ok(!JSON.stringify(entryA).includes('github_pat'), 'le jeton ne doit jamais apparaître en clair');
  const txt = JSON.stringify({ é: 'àçü — 🚀', n: 1 }).repeat(5000);
  ok(b64ToUtf8(utf8ToB64(txt)) === txt, 'encodage base64 UTF-8 (gros fichier, accents)');
  ok(validName('tom') && validName('pilote.01') && !validName('a') && !validName('Tom') && !validName('a b') && !validName('../x'), 'validation des identifiants');
});

/* ------------------------------------------- protection contre l'injection */
suite('Sécurité : données importées ou distantes assainies', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const { all } = store.mergeHistories({}, {
    rotation: [{ date: 5, pct: 50, score: evil, total: evil, mode: evil, kind: evil, opts: { level: evil, [evil]: 'x' } }],
    [evil]: [{ date: 6, pct: 10 }],
    cubes: [{ date: 'x', pct: 10 }, { date: 7, pct: 1000 }, { date: 8, pct: 70, score: 7, total: 10 }],
  });
  ok(!JSON.stringify(all).includes('<'), 'du HTML a survécu à l’assainissement');
  ok(all.rotation.length === 1 && all.rotation[0].score === undefined && all.rotation[0].mode === 'exam' && Object.keys(all.rotation[0].opts).length === 0, 'champs piégés non retirés');
  ok(!(evil in all), 'identifiant d’épreuve piégé accepté');
  ok(all.cubes.length === 1 && all.cubes[0].score === 7, 'entrées invalides non filtrées');
  const fc = mergeFlashcards({}, { rafale: { box: evil, due: 3, ok: 1, ko: 0 }, [evil]: { box: 1 } });
  ok(!JSON.stringify(fc).includes('<') && fc.rafale.box === 0, 'flashcards piégées non assainies');
});

/* ------------------------------------------------ pages réellement affichées */
const smokeErrors = await (await import('./main.js')).smokeTest();
suite('Pages : affichage réel de chaque écran et mini-série de chaque épreuve', () => {
  ok(smokeErrors.length === 0, `erreurs : ${smokeErrors.slice(0, 8).join(' | ')}`);
  ok(store.currentUser() !== 'smoke-test', 'espace de test non refermé');
  ok(!Object.keys(localStorage).some((k) => k.endsWith(':smoke-test')), 'données de test non effacées');
});

/* -------------------------------------------------------------- render */
const out = document.getElementById('out');
const totalPass = results.reduce((a, r) => a + r.pass, 0);
const totalFail = results.reduce((a, r) => a + r.fail, 0);
document.getElementById('summary').innerHTML = `<b class="${totalFail ? 'ko' : 'ok'}">${totalFail ? '✗ ÉCHEC' : '✓ TOUS LES TESTS PASSENT'}</b> — ${totalPass} vérifications réussies, ${totalFail} échecs, ${results.length} suites.`;
out.innerHTML = results
  .map((r) => `<div class="panel"><b class="${r.fail ? 'ko' : 'ok'}">${r.fail ? '✗' : '✓'} ${r.name}</b> — ${r.pass} ok, ${r.fail} échecs
    ${r.errors.length ? `<pre>${r.errors.map((e) => String(e).replace(/</g, '&lt;')).join('\n')}</pre>` : ''}</div>`)
  .join('');
document.title = totalFail ? 'FAIL' : 'PASS';
window.__SELFTEST = { totalPass, totalFail, results };
