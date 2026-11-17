import { makeOptions, retry } from '../core/util.js';

/** clockwise quarter turn: new[r][c] = old[n-1-c][r] */
export const rot90 = (g) => g.map((row, r) => row.map((_, c) => g[g.length - 1 - c][r]));
export const mirror = (g) => g.map((row) => [...row].reverse());
export const gkey = (g) => g.map((r) => r.map((v) => (v ? 1 : 0)).join('')).join('/');
export function rotations(g) {
  const out = [g];
  for (let i = 0; i < 3; i++) out.push(rot90(out[out.length - 1]));
  return out;
}
const allTransforms = (g) => [...rotations(g), ...rotations(mirror(g))];

export function gridSvg(g, px) {
  const n = g.length;
  const c = px / n;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="-1 -1 ${px + 2} ${px + 2}">`;
  s += `<rect x="0" y="0" width="${px}" height="${px}" fill="#fff" stroke="#333" stroke-width="1.5"/>`;
  for (let r = 0; r < n; r++)
    for (let k = 0; k < n; k++)
      s += `<rect x="${(k * c).toFixed(2)}" y="${(r * c).toFixed(2)}" width="${c.toFixed(2)}" height="${c.toFixed(2)}" fill="${g[r][k] ? '#1d1d1d' : '#fff'}" stroke="#9aa" stroke-width="0.6"/>`;
  return s + '</svg>';
}

function randomGrid(rng, n) {
  const p = 0.35 + rng.next() * 0.2;
  return Array.from({ length: n }, () => Array.from({ length: n }, () => (rng.next() < p ? 1 : 0)));
}

/** change cells while keeping the grid a valid "almost" copy */
function alter(rng, g, mode) {
  const n = g.length;
  const out = g.map((r) => [...r]);
  if (mode === 'flip') {
    const r = rng.int(0, n - 1), c = rng.int(0, n - 1);
    out[r][c] ^= 1;
  } else {
    // move one black cell to a white position (same number of black cells)
    const blacks = [], whites = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) (g[r][c] ? blacks : whites).push([r, c]);
    const [br, bc] = rng.pick(blacks);
    const [wr, wc] = rng.pick(whites);
    out[br][bc] = 0;
    out[wr][wc] = 1;
  }
  return out;
}

export function genQuestion(rng) {
  return retry(() => {
    const n = rng.pick([4, 5, 5, 6, 6]);
    const model = randomGrid(rng, n);
    // model must have no symmetry at all, so a mirrored grid can never be a rotation
    if (new Set(allTransforms(model).map(gkey)).size < 8) throw new Error('symmetric');
    const k = rng.int(1, 3);
    const rots = rotations(model);
    const correct = rots[k];
    const rotKeys = new Set(rots.map(gkey));
    const mir = rng.shuffle(rotations(mirror(model)));
    const cands = [
      mir[0],
      alter(rng, correct, 'move'),
      alter(rng, rots[rng.pick([1, 2, 3].filter((x) => x !== k))], 'move'),
      mir[1],
      alter(rng, correct, 'flip'),
      alter(rng, correct, 'move'),
      mir[2],
    ].filter((g) => !rotKeys.has(gkey(g)));
    const { options, answer } = makeOptions(rng, correct, cands, { count: 5, key: gkey, html: (g) => gridSvg(g, 96) });
    return {
      tag: 'Rotation',
      visual: `<div style="text-align:center"><div style="font-size:.8rem;color:#555;margin-bottom:.3rem">MODÈLE</div>${gridSvg(model, 150)}</div>`,
      prompt: 'Quelle grille reproduit le modèle après une rotation (90°, 180° ou 270°) ?',
      options,
      answer,
      layout: 'grid',
      explanation: `La bonne grille est le modèle tourné de <b>${k * 90}°</b> dans le sens des aiguilles d'une montre (soit ${360 - k * 90}° dans le sens inverse). Les autres sont des images en miroir ou ont une case déplacée.`,
      meta: { model, k },
    };
  });
}

export default {
  id: 'rotation',
  section: 'tamic',
  title: 'Rotation',
  description:
    'Retrouvez la grille qui reproduit le modèle après une rotation de 90°, 180° ou 270°. Cinq damiers de cases noires et blanches vous sont proposés ; un seul correspond au modèle tourné.',
  count: 25,
  time: 7 * 60,
  instructions: `<ul>
    <li>Un damier modèle est affiché. Cinq damiers sont proposés.</li>
    <li>Un seul est le modèle <b>tourné</b> (sans retournement). Les autres sont des reflets en miroir ou contiennent une case différente.</li>
    <li>Astuce : repérez un motif asymétrique (un coin, une ligne pleine) et suivez-le pendant la rotation.</li></ul>`,
  generate: (rng, count) => Array.from({ length: count }, () => genQuestion(rng)),
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="12" width="40" height="40"/><path d="M8 25h40M8 38h40M21 12v40M34 12v40"/><rect x="8" y="12" width="13" height="13" fill="currentColor" opacity=".5"/><rect x="34" y="38" width="14" height="14" fill="currentColor" opacity=".5"/><path d="M50 6a10 10 0 0 1 8 10" /><path d="M58 16l-3-4M58 16l-4 1"/></svg>`,
};
