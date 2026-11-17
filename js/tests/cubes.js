import { makeOptions, retry } from '../core/util.js';

/* ---------------------------------------------------------------------------
 * 3-D cube model. Coordinates: x → right, y → up, z → towards the viewer.
 * A sticker = { sym, n: face normal, u: "up" direction of the drawn symbol }.
 * The isometric view shows the top (+y), front (+z) and right (+x) faces.
 * ------------------------------------------------------------------------- */
export const mul = (M, v) => [0, 1, 2].map((i) => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]);
export const matMul = (A, B) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]));
const transpose = (M) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => M[j][i]));
const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const RX = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
const RY = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]];
const RZ = [[0, -1, 0], [1, 0, 0], [0, 0, 1]];
const mkey = (M) => M.flat().join(',');
export const vkey = (v) => v.join(',');
const neg = (v) => v.map((x) => -x);
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
export const trace = (M) => M[0][0] + M[1][1] + M[2][2];

/** the 24 proper rotations of the cube */
export const GROUP = (() => {
  const seen = new Map([[mkey(I), I]]);
  const queue = [I];
  while (queue.length) {
    const M = queue.shift();
    for (const G of [RX, RY, RZ]) {
      const P = matMul(G, M);
      if (!seen.has(mkey(P))) {
        seen.set(mkey(P), P);
        queue.push(P);
      }
    }
  }
  return [...seen.values()];
})();

const matPow = (M, k) => {
  let P = I;
  for (let i = 0; i < k; i++) P = matMul(M, P);
  return P;
};

export const FACES = {
  top: { n: [0, 1, 0], O: [0, 1, 1], u: [1, 0, 0], v: [0, 0, -1] },
  front: { n: [0, 0, 1], O: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  right: { n: [1, 0, 0], O: [1, 0, 1], u: [0, 0, -1], v: [0, 1, 0] },
};
export const FACE_NAMES = ['top', 'front', 'right'];

/** orientation index of an up-vector on a visible face: 0 up, 1 right, 2 down, 3 left (clockwise quarter turns) */
export function rotIndex(face, up) {
  const F = FACES[face];
  if (eq(up, F.v)) return 0;
  if (eq(up, F.u)) return 1;
  if (eq(up, neg(F.v))) return 2;
  if (eq(up, neg(F.u))) return 3;
  throw new Error('up vector not in face plane');
}
const upFromIndex = (face, idx) => {
  const F = FACES[face];
  return [F.v, F.u, neg(F.v), neg(F.u)][idx];
};

/* symbols drawn in a 100×100 box, "up" = towards y = 0.
 * symm = number of visually distinct quarter-turn orientations (4 = fully oriented, 1 = invariant). */
export const SYMBOLS = {
  arrow: { symm: 4, svg: '<path d="M50 14 L78 46 H61 V86 H39 V46 H22 Z"/>' },
  tri: { symm: 4, svg: '<path d="M50 16 L82 80 H18 Z"/>' },
  half: { symm: 4, svg: '<circle cx="50" cy="50" r="27" fill="none" stroke="#1d1d1d" stroke-width="6"/><path d="M23 50 A27 27 0 0 1 77 50 Z"/>' },
  L: { symm: 4, svg: '<path d="M28 16 H46 V64 H76 V82 H28 Z"/>' },
  T: { symm: 4, svg: '<path d="M18 18 H82 V36 H59 V84 H41 V36 H18 Z"/>' },
  flag: { symm: 4, svg: '<path d="M30 14 H40 V86 H30 Z M40 16 L78 30 L40 46 Z"/>' },
  bars: { symm: 2, svg: '<rect x="18" y="28" width="64" height="14"/><rect x="18" y="58" width="64" height="14"/>' },
  dots: { symm: 2, svg: '<circle cx="50" cy="26" r="11"/><circle cx="50" cy="74" r="11"/>' },
  plus: { symm: 1, svg: '<path d="M41 16 H59 V41 H84 V59 H59 V84 H41 V59 H16 V41 H41 Z"/>' },
  disc: { symm: 1, svg: '<circle cx="50" cy="50" r="26"/>' },
  cross: { symm: 1, svg: '<path d="M27 15 L50 38 L73 15 L85 27 L62 50 L85 73 L73 85 L50 62 L27 85 L15 73 L38 50 L15 27 Z"/>' },
  ring: { symm: 1, svg: '<circle cx="50" cy="50" r="25" fill="none" stroke="#1d1d1d" stroke-width="9"/>' },
  square: { symm: 1, svg: '<rect x="27" y="27" width="46" height="46"/>' },
};
const ORIENTED = Object.keys(SYMBOLS).filter((s) => SYMBOLS[s].symm === 4);
const OTHERS = Object.keys(SYMBOLS).filter((s) => SYMBOLS[s].symm < 4);

const NORMALS = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
function perpUnitVectors(n) {
  return NORMALS.filter((v) => v[0] * n[0] + v[1] * n[1] + v[2] * n[2] === 0);
}

export const rotateCube = (M, cube) => cube.map((s) => ({ sym: s.sym, n: mul(M, s.n), u: mul(M, s.u) }));

/** visible view: { top: {sym, rot}, front: ..., right: ... } */
export function viewOf(cube) {
  const v = {};
  for (const f of FACE_NAMES) {
    const s = cube.find((st) => eq(st.n, FACES[f].n));
    v[f] = { sym: s.sym, rot: rotIndex(f, s.u) };
  }
  return v;
}
/** visual signature: two views look identical iff signatures are equal */
export const viewSig = (v) => FACE_NAMES.map((f) => `${v[f].sym}:${v[f].rot % SYMBOLS[v[f].sym].symm}`).join('|');

/** canonical key of a 3-D up vector modulo the symbol's symmetry */
function upKey(sym, u) {
  const symm = SYMBOLS[sym].symm;
  if (symm === 1) return '*';
  if (symm === 2) {
    const first = u.find((x) => x !== 0);
    return vkey(first > 0 ? u : neg(u));
  }
  return vkey(u);
}

/**
 * Every constant-rotation rule R' that explains the three shown views, applied to a
 * cube consistent with what was seen. Returns the list of predicted 4th-view signatures,
 * or null when some rule predicts a face that was never visible (undeterminable).
 */
export function predictions(views) {
  const preds = new Set();
  for (const R of GROUP) {
    const cons = new Map(); // normal0 -> {sym, uk, u}
    let ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      const Minv = transpose(matPow(R, k));
      for (const f of FACE_NAMES) {
        const n0 = mul(Minv, FACES[f].n);
        const { sym, rot } = views[k][f];
        const u0 = mul(Minv, upFromIndex(f, rot));
        const c = { sym, uk: upKey(sym, u0), u: u0 };
        const prev = cons.get(vkey(n0));
        if (prev && (prev.sym !== c.sym || prev.uk !== c.uk)) {
          ok = false;
          break;
        }
        if (!prev) cons.set(vkey(n0), c);
      }
    }
    if (!ok) continue;
    const M3 = matPow(R, 3);
    const M3inv = transpose(M3);
    const v3 = {};
    for (const f of FACE_NAMES) {
      const c = cons.get(vkey(mul(M3inv, FACES[f].n)));
      if (!c) return null;
      v3[f] = { sym: c.sym, rot: rotIndex(f, mul(M3, c.u)) };
    }
    preds.add(viewSig(v3));
  }
  return [...preds];
}

/* ------------------------------------------------------------------ SVG */
const C30 = Math.cos(Math.PI / 6);
export function cubeSvg(view, size = 110, label = '') {
  const k = size * 0.5;
  const cx = size / 2;
  const cy = size / 2;
  const P = (p) => [cx + (p[0] - p[2]) * k * C30, cy + ((p[0] + p[2]) * 0.5 - p[1]) * k];
  const L = (d) => [(d[0] - d[2]) * k * C30, ((d[0] + d[2]) * 0.5 - d[1]) * k];
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const shade = { top: '#f4f4f4', front: '#ffffff', right: '#e6e6e6' };
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + (label ? 16 : 0)}" viewBox="0 0 ${size} ${size + (label ? 16 : 0)}">`;
  for (const f of FACE_NAMES) {
    const F = FACES[f];
    const corners = [F.O, add(F.O, F.u), add(add(F.O, F.u), F.v), add(F.O, F.v)].map(P);
    s += `<polygon points="${corners.map((c) => c.map((x) => x.toFixed(2)).join(',')).join(' ')}" fill="${shade[f]}" stroke="#222" stroke-width="1.6" stroke-linejoin="round"/>`;
    const Pu = L(F.u), Pv = L(F.v);
    const o = P(add(F.O, F.v));
    const m = [Pu[0] / 100, Pu[1] / 100, -Pv[0] / 100, -Pv[1] / 100, o[0], o[1]].map((x) => x.toFixed(4)).join(' ');
    const { sym, rot } = view[f];
    s += `<g transform="matrix(${m})"><g data-face="${f}" data-sym="${sym}" transform="rotate(${rot * 90} 50 50) translate(14 14) scale(0.72)" fill="#1d1d1d">${SYMBOLS[sym].svg}</g></g>`;
  }
  if (label) s += `<text x="${cx}" y="${size + 12}" text-anchor="middle" font-size="12" fill="#555" font-family="sans-serif">${label}</text>`;
  return s + '</svg>';
}

/* ------------------------------------------------------------ generation */
const POS_NAME = { '0,1,0': 'en haut', '0,-1,0': 'en bas', '0,0,1': 'devant', '0,0,-1': 'derrière', '1,0,0': 'à droite', '-1,0,0': 'à gauche' };

function randomCube(rng) {
  const nOriented = rng.int(3, 5);
  const syms = rng.shuffle([...rng.sample(ORIENTED, nOriented), ...rng.sample(OTHERS, 6 - nOriented)]);
  return NORMALS.map((n, i) => ({ sym: syms[i], n, u: rng.pick(perpUnitVectors(n)) }));
}

/** rotations about one of the three main axes (x, y, z): quarter turns and half turns */
const isAxisRotation = (M) => [0, 1, 2].some((i) => M[i][i] === 1 && trace(M) !== 3);
export const RULES = GROUP.filter(isAxisRotation); // 6 quarter turns + 3 half turns

/** plain-French description of a rule */
export function describeRule(R) {
  const f = vkey(mul(R, [0, 0, 1])), t = vkey(mul(R, [0, 1, 0]));
  if (trace(R) === -1) {
    if (t === '0,1,0') return 'fait un demi-tour sur lui-même autour de l’axe vertical (l’avant passe derrière, la gauche passe à droite)';
    if (f === '0,0,1') return 'fait un demi-tour en roulant sur le côté (le dessus passe dessous, la gauche passe à droite)';
    return 'fait un demi-tour en basculant vers l’avant (le dessus passe dessous, l’avant passe derrière)';
  }
  if (t === '0,1,0') return f === '1,0,0' ? 'pivote d’un quart de tour vers la droite autour de l’axe vertical (la face avant passe à droite)' : 'pivote d’un quart de tour vers la gauche autour de l’axe vertical (la face avant passe à gauche)';
  if (f === '0,0,1') return t === '1,0,0' ? 'roule d’un quart de tour vers la droite (le dessus passe à droite)' : 'roule d’un quart de tour vers la gauche (le dessus passe à gauche)';
  return t === '0,0,1' ? 'bascule d’un quart de tour vers l’avant (le dessus passe devant)' : 'bascule d’un quart de tour vers l’arrière (le dessus passe derrière, l’avant passe dessus)';
}

function pickRule(rng) {
  return rng.pick(rng.chance(0.8) ? RULES.filter((M) => trace(M) === 1) : RULES.filter((M) => trace(M) === -1));
}

export function genQuestion(rng) {
  return retry(() => {
    const cube = randomCube(rng);
    const R = pickRule(rng);
    const states = [0, 1, 2, 3, 4].map((k) => rotateCube(matPow(R, k), cube));
    const views = states.map(viewOf);
    const answerSig = viewSig(views[3]);
    const preds = predictions(views.slice(0, 3));
    if (!preds || preds.length !== 1 || preds[0] !== answerSig) throw new Error('ambiguous');
    // the shown series must not be constant
    if (viewSig(views[0]) === viewSig(views[1])) throw new Error('static');

    const correct = views[3];
    const clone = (v) => JSON.parse(JSON.stringify(v));
    const cands = [];
    // 1. one symbol turned
    const orientFaces = rng.shuffle(FACE_NAMES.filter((f) => SYMBOLS[correct[f].sym].symm > 1));
    for (const f of orientFaces) {
      const d = clone(correct);
      d[f].rot = (d[f].rot + rng.pick(SYMBOLS[d[f].sym].symm === 2 ? [1, 3] : [1, 2, 3])) % 4;
      cands.push(d);
    }
    // 2. two faces swapped
    const [a, b] = rng.sample(FACE_NAMES, 2);
    const sw = clone(correct);
    [sw[a], sw[b]] = [sw[b], sw[a]];
    cands.push(sw);
    // 3. a face replaced by a hidden one
    const visibleSyms = new Set(FACE_NAMES.map((f) => correct[f].sym));
    const hidden = cube.map((s) => s.sym).filter((s) => !visibleSyms.has(s));
    const rp = clone(correct);
    rp[rng.pick(FACE_NAMES)] = { sym: rng.pick(hidden), rot: rng.int(0, 3) };
    cands.push(rp);
    // 4. other valid positions of the same cube (wrong number of steps / wrong rotation)
    cands.push(views[2], views[4], views[1]);
    for (const G of rng.sample(GROUP, 6)) cands.push(viewOf(rotateCube(G, cube)));
    // keep variety: shuffle the first few "trap" types, then the rest
    const ordered = [...rng.shuffle(cands.slice(0, orientFaces.length + 2)), ...rng.shuffle(cands.slice(orientFaces.length + 2))];
    const { options, answer } = makeOptions(rng, correct, ordered, { count: 5, key: viewSig, html: (v) => cubeSvg(v, 96) });

    const desc = `la face de devant passe <b>${POS_NAME[vkey(mul(R, [0, 0, 1]))]}</b>, la face du dessus passe <b>${POS_NAME[vkey(mul(R, [0, 1, 0]))]}</b> et la face de droite passe <b>${POS_NAME[vkey(mul(R, [1, 0, 0]))]}</b>`;
    return {
      tag: 'Suite de cubes',
      visual: `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center">${views
        .slice(0, 3)
        .map((v, i) => cubeSvg(v, 110, String(i + 1)))
        .join('')}<div style="width:110px;height:110px;display:grid;place-items:center;border:2px dashed #aaa;border-radius:8px;font-size:40px;color:#888">?</div></div>`,
      prompt: 'Quel cube complète la série ?',
      options,
      answer,
      layout: 'grid',
      explanation: `À chaque étape, le cube <b>${describeRule(R)}</b> : ${desc}. Les symboles restent collés à leur face et tournent avec elle — c’est ce qui change leur orientation apparente.`,
      meta: { cube, R },
    };
  });
}

export default {
  id: 'cubes',
  section: 'tamic',
  title: 'Suite de cubes',
  description:
    'Découvrez la logique d’une suite de cubes et choisissez celui qui complète la série. Les faces des cubes portent des formes qui évoluent selon une règle à identifier.',
  count: 25,
  time: 14 * 60,
  instructions: `<ul>
    <li>Trois vues successives d’un même cube sont présentées. Entre deux vues, le cube subit toujours <b>la même rotation</b>.</li>
    <li>Choisissez la quatrième vue parmi les cinq propositions.</li>
    <li>Attention à l’<b>orientation</b> des symboles (flèches, triangles, lettres) : ils tournent avec leur face.</li>
    <li>Pièges fréquents : symbole mal orienté, deux faces inversées, symbole qui ne peut pas apparaître.</li></ul>`,
  generate: (rng, count) => Array.from({ length: count }, () => genQuestion(rng)),
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M32 6 56 19v26L32 58 8 45V19z"/><path d="M8 19l24 13 24-13M32 32v26"/><ellipse cx="34" cy="18" rx="5" ry="3" fill="currentColor"/><path d="M16 36l8 4M20 32v12"/></svg>`,
};
