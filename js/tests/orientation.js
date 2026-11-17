import { makeOptions, retry } from '../core/util.js';

/* -------------------------------------------------------------------------
 * Aircraft attitude → picture.
 * Body frame (a forward, b right wing, c up). World frame (E, N, U).
 * heading ψ: clockwise from North; pitch θ: nose up > 0; roll φ: right wing down > 0.
 * The observer stands south of the aircraft, looking north, slightly above:
 * North = "into the picture", East = right.
 * ----------------------------------------------------------------------- */
const D2R = Math.PI / 180;
const ELEV = 28 * D2R;
const GROUND = -3.4; // altitude of the ground plane (shadow + compass rose) below the aircraft

export function bodyToWorld([a, b, c], { hdg, pitch, roll }) {
  const cr = Math.cos(roll * D2R), sr = Math.sin(roll * D2R);
  const cp = Math.cos(pitch * D2R), sp = Math.sin(pitch * D2R);
  const ch = Math.cos(hdg * D2R), sh = Math.sin(hdg * D2R);
  // roll about forward axis (right wing goes down for roll > 0)
  let b1 = b * cr + c * sr, c1 = -b * sr + c * cr, a1 = a;
  // pitch about right axis (nose goes up for pitch > 0)
  const a2 = a1 * cp - c1 * sp, c2 = a1 * sp + c1 * cp, b2 = b1;
  // yaw (heading)
  const N = a2 * ch - b2 * sh;
  const E = a2 * sh + b2 * ch;
  return [E, N, c2];
}
/** screen projection: x right, y up, depth (bigger = farther from viewer) */
export const project = ([E, N, U]) => [E, U * Math.cos(ELEV) + N * Math.sin(ELEV), N * Math.cos(ELEV) - U * Math.sin(ELEV)];
const TO_CAMERA = [0, -Math.cos(ELEV), Math.sin(ELEV)]; // (E, N, U)

const sec = (x) => [[x, 0, 0.55], [x, 0.5, 0], [x, 0, -0.45], [x, -0.5, 0]];
function buildModel() {
  const F = [];
  const xs = [-5, -1, 3];
  for (let s = 0; s < xs.length - 1; s++) {
    const A = sec(xs[s]), B = sec(xs[s + 1]);
    for (let i = 0; i < 4; i++) F.push({ pts: [A[i], A[(i + 1) % 4], B[(i + 1) % 4], B[i]], color: '#9aa5b1' });
  }
  const nose = [5.3, 0, 0];
  const S3 = sec(3);
  for (let i = 0; i < 4; i++) F.push({ pts: [S3[i], S3[(i + 1) % 4], nose], color: '#c0392b' });
  F.push({ pts: sec(-5), color: '#2a2a2a' }); // exhaust
  for (const side of [1, -1]) {
    F.push({ pts: [[1.6, 0.45 * side, 0], [-2.6, 4.2 * side, 0], [-3.3, 4.2 * side, 0], [-3.3, 0.45 * side, 0]], wing: true });
    F.push({ pts: [[-3.7, 0.45 * side, 0], [-4.6, 1.9 * side, 0], [-5, 1.9 * side, 0], [-5, 0.45 * side, 0]], wing: true });
  }
  F.push({ pts: [[-2.8, 0, 0.5], [-4.6, 0, 2.5], [-5.1, 0, 2.5], [-5, 0, 0.5]], color: '#7d8995' });
  const cf = [3.3, 0, 0.5], cb = [1.2, 0, 0.5], ct = [2.0, 0, 0.98], cl = [2.0, -0.33, 0.42], crt = [2.0, 0.33, 0.42];
  F.push({ pts: [cf, crt, ct], color: '#2f7fd6' }, { pts: [cf, ct, cl], color: '#2f7fd6' }, { pts: [cb, ct, crt], color: '#2560a8' }, { pts: [cb, cl, ct], color: '#2560a8' });
  return F;
}
const MODEL = buildModel();

const sub = (p, q) => p.map((x, i) => x - q[i]);
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [ch(n >> 16), ch((n >> 8) & 255), ch(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function aircraftSvg(att, w = 230, h = 180) {
  const s = 12;
  const cx = w / 2, cy = 74;
  const LIGHT = norm([0.3, -0.5, 0.8]);
  const scr = ([x, y]) => `${(cx + x * s).toFixed(1)},${(cy - y * s).toFixed(1)}`;
  // ground compass rose (perspective ellipse) + aircraft shadow: gives an unambiguous heading cue
  const RR = 7;
  const g0 = project([0, 0, GROUND]);
  const [gx, gy] = [cx + g0[0] * s, cy - g0[1] * s];
  const rx = RR * s, ry = RR * Math.sin(ELEV) * s;
  const lab = (E, N, t) => {
    const p = project([E, N, GROUND]);
    return `<text x="${(cx + p[0] * s).toFixed(1)}" y="${(cy - p[1] * s + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#5b6b7b" font-family="sans-serif">${t}</text>`;
  };
  const ground = `<ellipse cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="#dfe8df" stroke="#9fb3a0" stroke-width="1"/>
    <line x1="${(gx - rx).toFixed(1)}" y1="${gy.toFixed(1)}" x2="${(gx + rx).toFixed(1)}" y2="${gy.toFixed(1)}" stroke="#b6c6b7" stroke-width="1"/>
    <line x1="${gx.toFixed(1)}" y1="${(gy - ry).toFixed(1)}" x2="${gx.toFixed(1)}" y2="${(gy + ry).toFixed(1)}" stroke="#b6c6b7" stroke-width="1"/>
    ${lab(0, RR + 0.9, 'N')}${lab(0, -RR - 1.3, 'S')}${lab(RR + 0.9, 0, 'E')}${lab(-RR - 0.9, 0, 'W')}`;
  const shadow = MODEL.map((f) => `<polygon points="${f.pts.map((p) => { const [E, N] = bodyToWorld(p, att); return scr(project([E, N, GROUND])); }).join(' ')}" fill="#7d8c7e" fill-opacity="0.55"/>`).join('');
  const polys = MODEL.map((f) => {
    const wp = f.pts.map((p) => bodyToWorld(p, att));
    const pp = wp.map(project);
    const depth = pp.reduce((acc, p) => acc + p[2], 0) / pp.length;
    const n = norm(cross(sub(wp[1], wp[0]), sub(wp[2], wp[0])));
    let color = f.color;
    if (f.wing) {
      const up = bodyToWorld([0, 0, 1], att);
      color = dot(up, TO_CAMERA) >= 0 ? '#d9dfe5' : '#56636f';
    }
    const k = 0.78 + 0.3 * Math.abs(dot(n, LIGHT));
    return { depth, color: shadeHex(color, k), pts: pp.map(scr).join(' ') };
  });
  polys.sort((p, q) => q.depth - p.depth);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="#eef3f8"/>${ground}${shadow}
    ${polys.map((p) => `<polygon points="${p.pts}" fill="${p.color}" stroke="#2b3138" stroke-width="0.5" stroke-linejoin="round"/>`).join('')}</svg>`;
}

/* ---------------------------------------------------------- instruments */
export function attitudeSvg({ pitch, roll }) {
  const k = 2; // px per degree of pitch
  const ladder = [-20, -10, 10, 20]
    .map((p) => `<line x1="${p % 20 ? 58 : 50}" y1="${70 - p * k}" x2="${p % 20 ? 82 : 90}" y2="${70 - p * k}" stroke="#fff" stroke-width="1.4"/>
      <text x="${p % 20 ? 88 : 96}" y="${73 - p * k}" font-size="7" fill="#fff" font-family="sans-serif">${Math.abs(p)}</text>`)
    .join('');
  const bankTicks = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]
    .map((a) => `<line x1="70" y1="17" x2="70" y2="${a % 30 === 0 ? 25 : 22}" stroke="#fff" stroke-width="1.4" transform="rotate(${a} 70 70)"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="156" viewBox="0 0 140 156">
    <defs><clipPath id="adiClip"><circle cx="70" cy="70" r="56"/></clipPath></defs>
    <circle cx="70" cy="70" r="64" fill="#1f2328"/>
    <g clip-path="url(#adiClip)"><g transform="rotate(${-roll} 70 70) translate(0 ${pitch * k})">
      <rect x="-100" y="-200" width="340" height="270" fill="#3b8fd9"/>
      <rect x="-100" y="70" width="340" height="270" fill="#9a6b3f"/>
      <line x1="-100" y1="70" x2="240" y2="70" stroke="#fff" stroke-width="2"/>${ladder}
    </g>
    <g transform="rotate(${-roll} 70 70)"><path d="M70 16 l-5 -7 h10 z" fill="#fff"/></g></g>
    ${bankTicks}
    <path d="M70 20 l-5 8 h10 z" fill="#ffb000"/>
    <path d="M38 70 h20 l6 7 l6 -7 l6 7 l6 -7 h20" fill="none" stroke="#ffb000" stroke-width="3.2" stroke-linejoin="round"/>
    <circle cx="70" cy="70" r="2.4" fill="#ffb000"/>
    <text x="70" y="151" text-anchor="middle" font-size="11.5" font-weight="700" fill="#222" font-family="sans-serif">Horizon artificiel</text></svg>`;
}

export function headingIndicatorSvg(hdg) {
  const labels = { 0: 'N', 30: '3', 60: '6', 90: 'E', 120: '12', 150: '15', 180: 'S', 210: '21', 240: '24', 270: 'W', 300: '30', 330: '33' };
  let card = '';
  for (let d = 0; d < 360; d += 5) {
    const len = d % 30 === 0 ? 10 : d % 10 === 0 ? 7 : 4;
    card += `<g transform="rotate(${d} 70 70)"><line x1="70" y1="12" x2="70" y2="${12 + len}" stroke="#fff" stroke-width="${d % 30 === 0 ? 1.8 : 0.9}"/>${
      labels[d] !== undefined ? `<text x="70" y="35" text-anchor="middle" font-size="${d % 90 === 0 ? 12 : 9.5}" font-weight="${d % 90 === 0 ? 700 : 400}" fill="${d % 90 === 0 ? '#ffd27a' : '#fff'}" font-family="sans-serif">${labels[d]}</text>` : ''
    }</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="156" viewBox="0 0 140 156">
    <circle cx="70" cy="70" r="64" fill="#1f2328"/><circle cx="70" cy="70" r="60" fill="#2b3036"/>
    <g transform="rotate(${-hdg} 70 70)">${card}</g>
    <path d="M70 4 l-5 8 h10 z" fill="#ffb000"/>
    <path d="M70 52 v34 M56 66 h28 M63 82 h14" stroke="#ffb000" stroke-width="3" stroke-linecap="round"/>
    <text x="70" y="151" text-anchor="middle" font-size="11.5" font-weight="700" fill="#222" font-family="sans-serif">Cap</text></svg>`;
}

/* ------------------------------------------------------------ question */
export const HDG_NAMES = { 0: 'Nord', 45: 'Nord-Est', 90: 'Est', 135: 'Sud-Est', 180: 'Sud', 225: 'Sud-Ouest', 270: 'Ouest', 315: 'Nord-Ouest' };
const PITCHES = [-25, 0, 25];
const ROLLS = [-45, 0, 45];
export const attKey = (a) => `${a.hdg}|${a.pitch}|${a.roll}`;
const wrap = (h) => ((h % 360) + 360) % 360;

export function describe(a) {
  const roll = a.roll === 0 ? 'ailes horizontales' : `inclinaison de ${Math.abs(a.roll)}° à ${a.roll > 0 ? 'droite' : 'gauche'}`;
  const pitch = a.pitch === 0 ? 'assiette horizontale' : a.pitch > 0 ? 'nez au-dessus de l’horizon (montée)' : 'nez sous l’horizon (descente)';
  return `cap ${String(a.hdg).padStart(3, '0')}° (${HDG_NAMES[a.hdg]}), ${roll}, ${pitch}`;
}

export function genQuestion(rng, hard = false) {
  if (hard) return genHard(rng);
  return retry(() => {
    const att = { hdg: 45 * rng.int(0, 7), pitch: rng.pick(PITCHES), roll: rng.pick(ROLLS) };
    const cands = [];
    if (att.roll) cands.push({ ...att, roll: -att.roll });
    if (att.pitch) cands.push({ ...att, pitch: -att.pitch });
    cands.push({ ...att, hdg: wrap(att.hdg + 180) });
    cands.push({ ...att, hdg: wrap(360 - att.hdg) });
    cands.push({ ...att, hdg: wrap(att.hdg + 90) }, { ...att, hdg: wrap(att.hdg - 90) });
    cands.push({ ...att, roll: att.roll ? 0 : rng.pick([-45, 45]) });
    cands.push({ ...att, pitch: att.pitch ? 0 : rng.pick([-25, 25]) });
    const ordered = [...rng.shuffle(cands.slice(0, 3)), ...rng.shuffle(cands.slice(3))];
    const { options, answer } = makeOptions(rng, att, ordered, { count: 4, key: attKey, html: (a) => aircraftSvg(a) });
    return {
      tag: att.roll && att.pitch ? 'Inclinaison + assiette' : att.roll || att.pitch ? 'Une composante' : 'Vol rectiligne',
      visual: `<div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center">${attitudeSvg(att)}${headingIndicatorSvg(att.hdg)}</div>`,
      prompt: 'Quel avion est dans la position indiquée par les instruments ? <span style="color:var(--muted);font-size:.9rem">(Vous regardez vers le Nord : le Nord est au fond, l’Est à droite.)</span>',
      options,
      answer,
      layout: 'grid',
      explanation: `Les instruments indiquent : <b>${describe(att)}</b>. Sur l’horizon artificiel, si l’horizon penche vers la gauche (côté droit plus haut), l’avion est incliné à droite ; si le ciel occupe plus de place, le nez est au-dessus de l’horizon.`,
      meta: { att },
    };
  });
}

const HARD_ROLLS = [-60, -30, 0, 30, 60];
/** difficult: 5 aircraft, bank 30° or 60°, traps combining two changes */
function genHard(rng) {
  return retry(() => {
    const att = { hdg: 45 * rng.int(0, 7), pitch: rng.pick(PITCHES), roll: rng.pick(HARD_ROLLS) };
    const W = (h) => ((h % 360) + 360) % 360;
    const single = [
      { ...att, roll: -att.roll },
      { ...att, roll: att.roll === 0 ? rng.pick([-30, 30]) : Math.sign(att.roll) * (90 - Math.abs(att.roll)) }, // 30 ↔ 60
      { ...att, pitch: att.pitch ? -att.pitch : rng.pick([-25, 25]) },
      { ...att, hdg: W(att.hdg + 45) }, { ...att, hdg: W(att.hdg - 45) },
      { ...att, hdg: W(360 - att.hdg) }, { ...att, hdg: W(att.hdg + 180) },
    ];
    const double = [
      { ...att, hdg: W(att.hdg + 180), roll: -att.roll },
      { ...att, hdg: W(360 - att.hdg), roll: -att.roll },
      { ...att, pitch: -att.pitch, roll: -att.roll },
      { ...att, hdg: W(att.hdg + 45), pitch: att.pitch ? -att.pitch : 25 },
    ];
    const ordered = [...rng.shuffle(single).slice(0, 3), ...rng.shuffle(double), ...rng.shuffle(single)];
    const { options, answer } = makeOptions(rng, att, ordered, { count: 5, key: attKey, html: (a) => aircraftSvg(a) });
    return {
      tag: 'Difficile',
      visual: `<div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center">${attitudeSvg(att)}${headingIndicatorSvg(att.hdg)}</div>`,
      prompt: 'Quel avion est dans la position indiquée par les instruments ? <span style="color:var(--muted);font-size:.9rem">(Nord au fond, Est à droite.)</span>',
      options, answer, layout: 'grid',
      explanation: `Les instruments indiquent : <b>${describe(att)}</b>. Repères : l’ombre au sol donne le cap, l’angle des ailes par rapport au sol donne l’inclinaison (30° = léger, 60° = fort), la position du nez par rapport à la queue donne l’assiette.`,
      meta: { att },
    };
  });
}

export default {
  id: 'orientation',
  section: 'eopn',
  title: 'Orientation',
  description: 'Lisez les instruments de bord et sélectionnez l’avion de chasse dans la position correspondante.',
  count: 27,
  time: 7 * 60,
  instructions: `<ul>
    <li>Deux instruments sont affichés : l’<b>horizon artificiel</b> (inclinaison et assiette) et le <b>cap</b>.</li>
    <li>Choisissez parmi les avions proposés (4 en normal, 5 en difficile), tous orientés différemment, celui qui a exactement cette inclinaison, cette assiette et ce cap.</li>
    <li>L’ombre de l’avion sur la rose au sol indique son cap.</li>
    <li>Les images sont vues du sud, légèrement en hauteur : <b>le Nord est vers le fond, l’Est à droite</b>. Un avion au cap Nord s’éloigne de vous, au cap Est il va vers la droite.</li>
    <li>Horizon artificiel : la maquette orange est fixe. Si la ligne d’horizon remonte à droite, l’avion est incliné à <b>droite</b>. Plus de bleu = nez en haut.</li>
    <li>Repères : nez rouge, verrière bleue, dessus des ailes clair, dessous foncé.</li></ul>`,
  options: [
    {
      id: 'level', label: 'Difficulté', default: 'normal', choices: [
        { value: 'normal', label: '<b>Normal</b> — 4 avions, inclinaison 45°, un seul paramètre différent par piège' },
        { value: 'hard', label: '<b>Difficile</b> — 5 avions, inclinaisons de 30° ou 60°, pièges combinant deux erreurs', short: 'Difficile' },
      ],
    },
  ],
  generate: (rng, count, opts = {}) => Array.from({ length: count }, () => genQuestion(rng, opts.level === 'hard')),
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><circle cx="32" cy="32" r="26"/><path d="M8 38 56 24" /><path d="M32 30 L56 24 A26 26 0 0 1 9 41 Z" fill="currentColor" opacity=".35"/><path d="M32 6v6M20 32h24"/></svg>`,
};
