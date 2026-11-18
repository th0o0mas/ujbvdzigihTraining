import { esc, fmtNum, makeOptions, retry } from '../core/util.js';

/* Arc gauges. Value is on a graduation (normal) or possibly halfway between two (difficult). */
export const ARC_GAUGES = [
  { name: 'Vitesse', unit: 'kt', min: 0, max: 400, major: 50, minor: 10 },
  { name: 'Carburant', unit: '%', min: 0, max: 100, major: 20, minor: 5 },
  { name: 'Température', unit: '°C', min: -40, max: 120, major: 20, minor: 5 },
  { name: 'Régime', unit: '%', min: 0, max: 110, major: 10, minor: 5 },
  { name: 'Pression huile', unit: 'bar', min: 0, max: 10, major: 1, minor: 0.5 },
  { name: 'Variomètre', unit: '×100 ft/min', min: -20, max: 20, major: 5, minor: 1 },
  { name: 'Oxygène', unit: 'psi', min: 0, max: 2000, major: 500, minor: 100 },
  { name: 'Tension', unit: 'V', min: 0, max: 30, major: 5, minor: 1 },
  { name: 'Hydraulique', unit: 'bar', min: 0, max: 300, major: 50, minor: 10 },
  { name: 'Nombre de Mach', unit: 'Mach', min: 0, max: 2, major: 0.5, minor: 0.1 },
  { name: 'Débit carburant', unit: 'kg/h', min: 0, max: 6000, major: 1000, minor: 200 },
  { name: 'Facteur de charge', unit: 'g', min: -3, max: 9, major: 3, minor: 0.5 },
  { name: 'Temp. tuyère', unit: '°C', min: 200, max: 900, major: 100, minor: 20 },
  { name: 'Couple', unit: '%', min: 0, max: 120, major: 20, minor: 4 },
];

const R = 52; // dial radius in a 130×130 box
const CX = 65, CY = 65;
const pt = (angDeg, r) => {
  const a = (angDeg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
};
const f2 = (x) => x.toFixed(2);
const round = (x) => Math.round(x * 1e6) / 1e6;

export const decimals = (g) => (String(g.minor).split('.')[1] || '').length;
export const steps = (g) => Math.round((g.max - g.min) / g.minor);
export const DEFAULT_STYLE = { start: -135, sweep: 270, dir: 1, labelEvery: 1 };
/** angle (degrees, clockwise from 12 o'clock) of a value on an arc gauge */
export const valueAngle = (g, v, st = DEFAULT_STYLE) => st.start + st.dir * st.sweep * ((v - g.min) / (g.max - g.min));

function needle(angle, len, width, color, tag) {
  const [x, y] = pt(angle, len);
  const [bx, by] = pt(angle + 180, 10);
  return `<line data-n="${tag}" x1="${f2(bx)}" y1="${f2(by)}" x2="${f2(x)}" y2="${f2(y)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

function dialFrame(title) {
  return `<circle cx="${CX}" cy="${CY}" r="${R + 6}" fill="#1f2328"/><circle cx="${CX}" cy="${CY}" r="${R + 2}" fill="#2b3036"/>
    <text x="${CX}" y="150" text-anchor="middle" font-size="11.5" font-weight="700" fill="#222" font-family="sans-serif">${esc(title)}</text>`;
}

export function arcGaugeSvg(g, value, st = DEFAULT_STYLE) {
  const n = steps(g);
  let s = dialFrame(g.name);
  const perMajor = Math.round(g.major / g.minor);
  let majorIdx = 0;
  for (let i = 0; i <= n; i++) {
    const major = i % perMajor === 0;
    const a = valueAngle(g, g.min + i * g.minor, st);
    const [x1, y1] = pt(a, R);
    const [x2, y2] = pt(a, major ? R - 9 : R - 5);
    s += `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="#fff" stroke-width="${major ? 1.8 : 0.9}"/>`;
    if (major) {
      if (majorIdx % st.labelEvery === 0) {
        const v = round(g.min + i * g.minor);
        const [tx, ty] = pt(a, R - 17);
        s += `<text x="${f2(tx)}" y="${f2(ty + 3.2)}" text-anchor="middle" font-size="8.5" fill="#fff" font-family="sans-serif">${fmtNum(v, 2)}</text>`;
      }
      majorIdx++;
    }
  }
  s += `<text x="${CX}" y="${CY - 16}" text-anchor="middle" font-size="7.5" fill="#cfd4da" font-family="sans-serif">${esc(g.unit)}</text>`;
  s += needle(valueAngle(g, value, st), R - 4, 2.4, '#ffb000', 'arc');
  s += `<circle cx="${CX}" cy="${CY}" r="4" fill="#ddd"/>`;
  return s;
}

export function altimeterSvg(alt, three = false) {
  let s = dialFrame('Altimètre (ft)');
  for (let i = 0; i < 50; i++) {
    const a = (i * 360) / 50; // one tick = 20 ft
    const major = i % 5 === 0;
    const [x1, y1] = pt(a, R);
    const [x2, y2] = pt(a, major ? R - 9 : R - 4);
    s += `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="#fff" stroke-width="${major ? 1.8 : 0.8}"/>`;
    if (major) {
      const [tx, ty] = pt(a, R - 17);
      s += `<text x="${f2(tx)}" y="${f2(ty + 3.5)}" text-anchor="middle" font-size="10" fill="#fff" font-family="sans-serif">${i / 5}</text>`;
    }
  }
  s += `<text x="${CX}" y="${CY - 14}" text-anchor="middle" font-size="7" fill="#cfd4da" font-family="sans-serif">${three ? '×10 000 / ×1000 / ×100' : '×1000 / ×100 ft'}</text>`;
  if (three) {
    // ten-thousands: thin needle with a triangle at its tip
    const a = (alt / 100000) * 360;
    const [tx, ty] = pt(a, R - 2);
    const [l1x, l1y] = pt(a - 6, R - 12), [l2x, l2y] = pt(a + 6, R - 12);
    s += `<line data-n="tenk" x1="${CX}" y1="${CY}" x2="${f2(tx)}" y2="${f2(ty)}" stroke="#9fd3ff" stroke-width="1"/><path d="M${f2(tx)} ${f2(ty)} L${f2(l1x)} ${f2(l1y)} L${f2(l2x)} ${f2(l2y)} Z" fill="#9fd3ff"/>`;
  }
  s += needle(((alt % 10000) / 10000) * 360, R - 25, 4.5, '#fff', 'thousands');
  s += needle(((alt % 1000) / 1000) * 360, R - 4, 2, '#ffb000', 'hundreds');
  s += `<circle cx="${CX}" cy="${CY}" r="4" fill="#ddd"/>`;
  return s;
}

/** fixed card + needle (normal) or rotating card read under the top index (difficult) */
export function headingSvg(hdg, rotating = false) {
  let s = dialFrame('Cap (°)');
  const labels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  let card = '';
  for (let d = 0; d < 360; d += 5) {
    const major = d % 30 === 0;
    const mid = d % 10 === 0;
    const [x1, y1] = pt(d, R);
    const [x2, y2] = pt(d, major ? R - 9 : mid ? R - 6 : R - 4);
    card += `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="#fff" stroke-width="${major ? 1.8 : 0.8}"/>`;
    if (major) {
      const [tx, ty] = pt(d, R - 17);
      const rot = rotating ? ` transform="rotate(${d} ${f2(tx)} ${f2(ty)})"` : '';
      card += `<text x="${f2(tx)}" y="${f2(ty + 3.5)}"${rot} text-anchor="middle" font-size="${labels[d] ? 11 : 9}" font-weight="${labels[d] ? 700 : 400}" fill="${labels[d] ? '#ffd27a' : '#fff'}" font-family="sans-serif">${labels[d] || d / 10}</text>`;
    }
  }
  if (rotating) {
    s += `<g data-card="${hdg}" transform="rotate(${-hdg} ${CX} ${CY})">${card}</g>`;
    s += `<path d="M${CX} ${CY - R - 5} l-5 -1 l5 9 l5 -9 z" fill="#ffb000"/><path d="M${CX} ${CY - 14} v28 M${CX - 12} ${CY - 2} h24 M${CX - 6} ${CY + 12} h12" stroke="#ffb000" stroke-width="2.5" stroke-linecap="round"/>`;
  } else {
    s += card + needle(hdg, R - 4, 2.4, '#ffb000', 'hdg') + `<circle cx="${CX}" cy="${CY}" r="4" fill="#ddd"/>`;
  }
  return s;
}

const fmtHdg = (h) => String(((h % 360) + 360) % 360).padStart(3, '0') + '°';

/** returns { title, svg, value, fmt, cands, note, type, style } */
function makeInstrument(rng, type, hard) {
  if (type === 'alt') {
    const three = hard;
    const alt = three ? 50 * rng.int(21, 599) : 50 * rng.int(21, 199);
    const th = Math.floor((alt % 10000) / 1000), hu = Math.floor((alt % 1000) / 100), rest = alt % 100;
    const fmt = (v) => `${fmtNum(v)} ft`;
    const limit = three ? 30000 : 10000;
    const cands = [alt + 1000, alt - 1000, alt + 100, alt - 100, alt + 50, alt - 50, alt - (alt % 10000) + hu * 1000 + th * 100 + rest, alt + 500, alt - 500];
    if (three) cands.unshift(alt + 10000, alt - 10000);
    return {
      title: 'Altimètre', svg: altimeterSvg(alt, three), value: alt, fmt, type: 'alt',
      cands: cands.filter((v) => v > 0 && v < limit && v !== alt),
      note: three ? 'l’aiguille fine à triangle indique les dizaines de milliers, la petite aiguille épaisse les milliers, la grande les centaines' : 'la petite aiguille indique les milliers de pieds, la grande les centaines',
    };
  }
  if (type === 'hdg') {
    const h = 5 * rng.int(0, 71);
    const cands = [h + 5, h - 5, h + 10, h - 10, h + 180, 360 - h, h + 90, h - 90, h + 15, h - 15].map((v) => ((v % 360) + 360) % 360);
    return { title: 'Cap', svg: headingSvg(h, hard), value: h, fmt: fmtHdg, cands, type: 'hdg', note: hard ? 'la rose tourne : on lit le cap sous l’index du haut' : '' };
  }
  const g = type;
  const n = steps(g);
  const half = hard && rng.chance(0.4);
  const st = hard
    ? { start: rng.pick([-135, -120, -150, -90]), sweep: 0, dir: rng.chance(0.25) ? -1 : 1, labelEvery: rng.chance(0.6) ? 2 : 1 }
    : DEFAULT_STYLE;
  if (hard) {
    st.sweep = -2 * st.start; // symmetrical arc around 12 o'clock
    if (st.dir === -1) st.start = -st.start; // counter-clockwise scale starts on the right
  }
  const i = rng.int(1, n - 2) + (half ? 0.5 : 0);
  const v = round(g.min + i * g.minor);
  const dec = decimals(g) + (half ? 1 : 0);
  const fmt = (x) => `${fmtNum(x, Math.max(dec, decimals(g) + 1))} ${g.unit}`;
  const per = Math.round(g.major / g.minor);
  const ks = half ? [0.5, -0.5, 1.5, -1.5, 1, -1, per, -per] : [1, -1, 2, -2, per, -per, per - 1, -(per - 1), 3, -3];
  const cands = [];
  for (const k of ks) {
    const j = i + k;
    if (j >= 0 && j <= n && k !== 0) cands.push(round(g.min + j * g.minor));
  }
  return { title: g.name, svg: arcGaugeSvg(g, v, st), value: v, fmt, cands, type: 'arc', gauge: g, style: st, half };
}

export function genQuestion(rng, hard = false) {
  return retry(() => {
    const nArc = hard ? 6 : 4;
    const types = rng.shuffle([...rng.sample(ARC_GAUGES, nArc), 'alt', 'hdg']);
    const insts = types.map((t) => makeInstrument(rng, t, hard));
    const W = 150, H = 160;
    // two layouts of the same panel: wide screens, and phones (2 columns, bigger dials)
    const layout = (cols, zoom, cls) => {
      const rows = Math.ceil(insts.length / cols);
      return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" width="${cols * W * zoom}" height="${rows * H * zoom}" viewBox="0 0 ${cols * W} ${rows * H}" style="max-width:100%;height:auto">
      ${insts.map((ins, k) => `<g data-inst="${k}" transform="translate(${(k % cols) * W + 10} ${Math.floor(k / cols) * H + 4})">${ins.svg}</g>`).join('')}</svg>`;
    };
    const panel = layout(hard ? 4 : 3, hard ? 1.2 : 1.4, 'panel-wide') + layout(2, 1.3, 'panel-narrow');
    const target = rng.int(0, insts.length - 1);
    const t = insts[target];
    const instMeta = { value: t.value, title: t.title, type: t.type, style: t.style, half: t.half, target, hard };
    if (rng.chance(hard ? 0.3 : 0.2)) {
      // reverse question: which instrument shows this reading? (reading must be unique in the panel)
      const shown = insts.map((x) => x.fmt(x.value));
      if (shown.filter((x) => x === shown[target]).length > 1) throw new Error('ambiguous reading');
      const titles = insts.map((x) => x.title);
      const { options, answer } = makeOptions(rng, t.title, rng.shuffle(titles.filter((x) => x !== t.title)), { count: 5 });
      return {
        tag: 'Quel instrument ?',
        visual: panel,
        prompt: `Quel instrument indique <b>${shown[target]}</b> ?`,
        options, answer, layout: 'inline',
        explanation: `C’est l’instrument « ${esc(t.title)} » qui indique ${shown[target]}${t.note ? ` (${t.note})` : ''}.`,
        meta: { ...instMeta, reverse: true },
      };
    }
    const { options, answer } = makeOptions(rng, t.value, rng.shuffle(t.cands), { count: 5, key: t.fmt, html: t.fmt });
    return {
      tag: t.type === 'alt' ? 'Altimètre' : t.type === 'hdg' ? 'Cap' : t.half ? 'Lecture entre deux graduations' : 'Cadrans',
      visual: panel,
      prompt: `Quelle valeur indique l’instrument <b>« ${esc(t.title)} »</b> ?`,
      options, answer, layout: 'inline',
      explanation: `L’instrument « ${esc(t.title)} » indique <b>${t.fmt(t.value)}</b>${t.note ? ` (${t.note})` : ''}${t.half ? ' : l’aiguille est à mi-chemin entre deux graduations' : ''}${t.style && t.style.dir === -1 ? ' — attention, cette échelle croît dans le sens inverse des aiguilles d’une montre' : ''}.`,
      meta: instMeta,
    };
  });
}

export default {
  id: 'cadran',
  section: 'eopn',
  title: 'Cadran',
  description: 'Lisez le tableau d’instruments présenté et indiquez la valeur affichée par l’instrument demandé.',
  count: 57,
  time: 8 * 60,
  options: [
    {
      id: 'level', label: 'Difficulté', default: 'normal', choices: [
        { value: 'normal', label: '<b>Normal</b> — 6 instruments, valeurs sur les graduations' },
        { value: 'hard', label: '<b>Difficile</b> — 8 instruments, chiffres manquants, lectures entre deux graduations, échelles inversées, altimètre à 3 aiguilles, rose de cap tournante', short: 'Difficile' },
      ],
    },
  ],
  instructions: `<ul>
    <li>Un tableau de bord est affiché ; on vous demande la valeur lue sur un instrument, ou quel instrument affiche une valeur donnée.</li>
    <li>Repérez d’abord la valeur des <b>grandes graduations</b>, puis comptez les <b>petites</b>. En difficile, certaines grandes graduations ne sont pas chiffrées et l’aiguille peut être entre deux graduations.</li>
    <li><b>Altimètre</b> : petite aiguille épaisse = milliers de pieds, grande aiguille = centaines (une graduation = 20 ft). En difficile, l’aiguille fine à triangle donne les dizaines de milliers.</li>
    <li><b>Cap</b> : graduations tous les 5°, chiffres en dizaines de degrés (3 = 030°). En difficile, la rose tourne et le cap se lit sous l’index du haut.</li>
    <li>Environ 8 secondes par question.</li></ul>`,
  generate: (rng, count, opts = {}) => Array.from({ length: count }, () => genQuestion(rng, opts.level === 'hard')),
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><circle cx="14" cy="22" r="9"/><circle cx="34" cy="16" r="9"/><circle cx="54" cy="22" r="8"/><circle cx="22" cy="44" r="9"/><circle cx="44" cy="44" r="9"/><path d="M14 22l5-5M34 16l-4 6M22 44l6 2M44 44l-3-6"/></svg>`,
};
