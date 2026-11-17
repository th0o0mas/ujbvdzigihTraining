import { fmtNum, fmtHM, fmtTimeOfDay, gcd, makeOptions, numOptions, retry } from '../core/util.js';

const N = (v, d = 2) => fmtNum(v, d);
const euro = (v) => `${N(v)} €`;
const unit = (u, d = 2) => (v) => `${N(v, d)} ${u}`;
const fail = () => {
  throw new Error('retry');
};
const isInt = Number.isInteger;

/* ------------------------------------------------------------ fractions */
export const frac = (n, d) => {
  if (d < 0) [n, d] = [-n, -d];
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
};
export const fracStr = ([n, d]) => (d === 1 ? `${n < 0 ? '−' : ''}${Math.abs(n)}` : `${n < 0 ? '−' : ''}${Math.abs(n)}/${d}`);
const fracHtml = (f) => fracStr(f);

/* ===================================================================
 * Each generator returns:
 *   { tag, prompt, ans, cands, fmt, explanation, meta }  (numeric)
 * or { tag, prompt, options, answer, explanation, meta } (custom)
 * meta.type + params are re-verified independently by the self-test.
 * =================================================================== */

/* ---------- pourcentages ---------- */
export function remise(rng) {
  const P = 20 * rng.int(2, 40);
  const p = rng.pick([10, 15, 20, 25, 30, 35, 40]);
  if ((P * p) % 100) fail();
  const disc = (P * p) / 100;
  const ans = P - disc;
  return {
    tag: 'Pourcentages',
    prompt: `Un équipement coûte ${euro(P)}. Il bénéficie d’une remise de ${p} %. Quel est son nouveau prix ?`,
    ans, fmt: euro, min: 1,
    cands: [disc, P + disc, P - p, ans - 10, ans + 10],
    explanation: `Remise : ${N(P)} × ${p} / 100 = ${euro(disc)}. Nouveau prix : ${N(P)} − ${N(disc)} = <b>${euro(ans)}</b>.`,
    meta: { type: 'remise', P, p },
  };
}

const signedPct = (v) => (v > 0 ? `+${N(v, 2)} %` : v < 0 ? `${N(v, 2)} %` : '0 %');
export function variationsSuccessives(rng) {
  const a = rng.pick([10, 20, 25, 30, 40, 50]);
  const b = rng.pick([10, 20, 25, 30, 40, 50]);
  const ans = ((100 + a) * (100 - b) - 10000) / 100;
  const coef = ((100 + a) * (100 - b)) / 10000;
  return {
    tag: 'Pourcentages',
    prompt: `Le prix d’une pièce détachée augmente de ${a} %, puis baisse de ${b} %. Quelle est la variation globale du prix ?`,
    ans, fmt: signedPct,
    cands: [a - b, b - a, ans + 1, ans - 1, ans + 2, ans - 2, -ans],
    explanation: `Coefficient global : ${N(1 + a / 100)} × ${N(1 - b / 100)} = ${N(coef, 4)}, soit une variation de <b>${signedPct(ans)}</b>. On n’additionne pas des pourcentages successifs.`,
    meta: { type: 'variations', a, b },
  };
}

export function pourcentageDe(rng) {
  const p = rng.pick([5, 12, 15, 25, 35, 45, 60, 75, 120, 150, 8, 18]);
  const Nn = rng.int(2, 60) * 20;
  const ans = (p * Nn) / 100;
  if (!isInt(ans * 10)) fail();
  return {
    tag: 'Calcul',
    prompt: `Combien font ${p} % de ${N(Nn)} ?`,
    ans, fmt: (v) => N(v, 1),
    cands: [ans * 10, ans / 10, Nn - ans, ans + p, ans - p, (Nn * p) / 10],
    explanation: `${N(Nn)} × ${p} / 100 = <b>${N(ans, 1)}</b>.`,
    meta: { type: 'pourcentageDe', p, N: Nn },
  };
}

export function hausseInverse(rng) {
  const p = rng.pick([10, 20, 25, 40, 50, 60, 5, 15]);
  const orig = rng.int(4, 80) * 20;
  const after = (orig * (100 + p)) / 100;
  if (!isInt(after)) fail();
  const naive = (after * (100 - p)) / 100;
  return {
    tag: 'Pourcentages',
    prompt: `Après une hausse de ${p} %, un abonnement coûte ${euro(after)}. Quel était son prix avant la hausse ?`,
    ans: orig, fmt: euro, min: 1,
    cands: [naive, after - p, orig + 10, orig - 10, orig + 20],
    explanation: `Prix initial × ${N(1 + p / 100)} = ${N(after)} ⇒ prix initial = ${N(after)} / ${N(1 + p / 100)} = <b>${euro(orig)}</b>. (Retirer ${p} % du nouveau prix donnerait ${euro(naive)} : c’est faux.)`,
    meta: { type: 'hausseInverse', p, after },
  };
}

export function interets(rng) {
  const C = 500 * rng.int(2, 40);
  const r = rng.int(2, 8);
  const n = rng.int(2, 6);
  const I = (C * r * n) / 100;
  const ans = C + I;
  return {
    tag: 'Pourcentages',
    prompt: `On place ${euro(C)} à intérêts simples au taux annuel de ${r} %. De quelle somme dispose-t-on au bout de ${n} ans ?`,
    ans, fmt: euro, min: 1,
    cands: [I, C + (C * r) / 100, ans + (C * r) / 100, ans - (C * r) / 100, C * (1 + r / 100) ** n],
    explanation: `Intérêts annuels : ${N(C)} × ${r} % = ${euro((C * r) / 100)}. Sur ${n} ans : ${euro(I)}. Total : <b>${euro(ans)}</b>.`,
    meta: { type: 'interets', C, r, n },
  };
}

/* ---------- vitesse / distance / temps ---------- */
export function vitesse(rng) {
  const v = 30 * rng.int(10, 30); // 300 … 900 km/h
  const t = 15 * rng.int(2, 16); // 30 … 240 min
  const D = (v * t) / 60;
  if (!isInt(D)) fail();
  const kind = rng.pick(['v', 'd', 't']);
  const h = Math.floor(t / 60), m = t % 60;
  if (kind === 'v') {
    const misread = Math.round(D / (h + m / 100));
    return {
      tag: 'Vitesse – distance – temps',
      prompt: `Un avion parcourt ${N(D)} km en ${fmtHM(t)}. Quelle est sa vitesse moyenne ?`,
      ans: v, fmt: unit('km/h'), min: 1,
      cands: [misread, v + 30, v - 30, v + 60, v - 60, Math.round(D / Math.max(1, h))],
      explanation: `${fmtHM(t)} = ${N(t / 60)} h. Vitesse = ${N(D)} / ${N(t / 60)} = <b>${N(v)} km/h</b>.`,
      meta: { type: 'vitesse', kind, v, t, D },
    };
  }
  if (kind === 'd') {
    return {
      tag: 'Vitesse – distance – temps',
      prompt: `Un avion vole à ${N(v)} km/h pendant ${fmtHM(t)}. Quelle distance parcourt-il ?`,
      ans: D, fmt: unit('km'), min: 1,
      cands: [v * (h + m / 100), D + v / 4, D - v / 4, D + v / 2, D - v / 2, D + 50],
      explanation: `${fmtHM(t)} = ${N(t / 60)} h. Distance = ${N(v)} × ${N(t / 60)} = <b>${N(D)} km</b>.`,
      meta: { type: 'vitesse', kind, v, t, D },
    };
  }
  // time; distractor: decimal hours misread as h/min (e.g. 1,5 h → 1 h 50)
  const dec = t / 60;
  const misread = Math.floor(dec) * 60 + Math.round((dec % 1) * 100);
  return {
    tag: 'Vitesse – distance – temps',
    prompt: `Un avion doit parcourir ${N(D)} km à la vitesse de ${N(v)} km/h. Quelle sera la durée du vol ?`,
    ans: t, fmt: fmtHM, min: 5, step: 15,
    cands: [misread, t + 15, t - 15, t + 30, t - 30, t + 10],
    explanation: `Durée = ${N(D)} / ${N(v)} = ${N(dec)} h = <b>${fmtHM(t)}</b>.`,
    meta: { type: 'vitesse', kind, v, t, D },
  };
}

export function heureArrivee(rng) {
  const dep = 5 * rng.int(6 * 12, 14 * 12);
  const dur = 5 * rng.int(9, 9 * 12);
  const arr = dep + dur;
  const carryForgotten = (dep % 60) + (dur % 60) >= 60 ? arr - 60 : arr + 60;
  return {
    tag: 'Durées et horaires',
    prompt: `Un avion décolle à ${fmtTimeOfDay(dep)}. Le vol dure ${fmtHM(dur)}. À quelle heure atterrit-il ?`,
    ans: arr, fmt: fmtTimeOfDay, step: 10,
    cands: [carryForgotten, arr + 10, arr - 10, arr + 5, arr - 5, arr + 40, arr - 40],
    explanation: `${fmtTimeOfDay(dep)} + ${fmtHM(dur)} = <b>${fmtTimeOfDay(arr)}</b>.`,
    meta: { type: 'heureArrivee', dep, dur },
  };
}

export function consommation(rng) {
  const r = 100 * rng.int(8, 40);
  const t = 15 * rng.int(2, 14);
  const ans = (r * t) / 60;
  const h = Math.floor(t / 60), m = t % 60;
  return {
    tag: 'Proportionnalité',
    prompt: `Un avion consomme ${N(r)} litres de carburant par heure. Combien consomme-t-il pour un vol de ${fmtHM(t)} ?`,
    ans, fmt: unit('L'), min: 1,
    cands: [r * (h + m / 100), ans + r / 4, ans - r / 4, ans + r / 2, ans - r / 2, r * h],
    explanation: `${fmtHM(t)} = ${N(t / 60)} h ; ${N(r)} × ${N(t / 60)} = <b>${N(ans)} L</b>.`,
    meta: { type: 'consommation', r, t },
  };
}

export function ouvriers(rng) {
  const a = rng.int(2, 12), d = rng.int(2, 30), b = rng.int(2, 16);
  if (a === b || (a * d) % b) fail();
  const ans = (a * d) / b;
  return {
    tag: 'Proportionnalité',
    prompt: `${a} techniciens réalisent la révision d’un avion en ${d} heures. Combien d’heures faudrait-il à ${b} techniciens travaillant au même rythme ?`,
    ans, fmt: unit('h'), min: 1,
    cands: [(d * b) / a, ans + 1, ans - 1, ans + 2, ans - 2, d + a - b],
    explanation: `Travail total : ${a} × ${d} = ${a * d} heures-technicien. Avec ${b} techniciens : ${a * d} / ${b} = <b>${N(ans)} h</b> (proportionnalité inverse).`,
    meta: { type: 'ouvriers', a, d, b },
  };
}

export function moyenne(rng) {
  const notes = [rng.int(6, 18), rng.int(6, 18), rng.int(6, 18)];
  const sum = notes.reduce((x, y) => x + y, 0);
  const coefMode = rng.chance(0.4);
  const M = rng.int(10, 15);
  if (!coefMode) {
    const x = 4 * M - sum;
    if (x < 0 || x > 20) fail();
    return {
      tag: 'Moyennes',
      prompt: `Un candidat a obtenu ${notes.join(', ')} sur 20 à trois épreuves de même coefficient. Quelle note doit-il obtenir à la quatrième épreuve (même coefficient) pour avoir exactement ${M} de moyenne ?`,
      ans: x, fmt: (v) => N(v), integer: true, min: 0,
      cands: [M, x + 1, x - 1, x + 2, x - 2, Math.round(3 * M - sum)].filter((v) => v >= 0 && v <= 20),
      explanation: `Il faut un total de 4 × ${M} = ${4 * M}. Déjà obtenu : ${sum}. Note nécessaire : ${4 * M} − ${sum} = <b>${x}</b>.`,
      meta: { type: 'moyenne', notes, M, coef: 1 },
    };
  }
  const x2 = 5 * M - sum; // 4th test has coefficient 2
  if (x2 % 2) fail();
  const x = x2 / 2;
  if (x < 0 || x > 20) fail();
  return {
    tag: 'Moyennes',
    prompt: `Un candidat a obtenu ${notes.join(', ')} sur 20 à trois épreuves de coefficient 1. La quatrième épreuve a un coefficient 2. Quelle note doit-il y obtenir pour avoir exactement ${M} de moyenne ?`,
    ans: x, fmt: (v) => N(v), integer: true, min: 0,
    cands: [4 * M - sum, x + 1, x - 1, x + 2, x - 2, M].filter((v) => v >= 0 && v <= 20),
    explanation: `Total des coefficients : 5. Il faut 5 × ${M} = ${5 * M} points ; déjà ${sum}. Reste ${x2} points pour un coefficient 2 : note = ${x2} / 2 = <b>${x}</b>.`,
    meta: { type: 'moyenne', notes, M, coef: 2 },
  };
}

export function reservoir(rng) {
  const [a, b] = rng.pick([[1, 2], [2, 3], [3, 4], [3, 5], [4, 5], [5, 6], [7, 8]]);
  const [c, d] = rng.pick([[1, 4], [1, 3], [2, 5], [1, 2], [3, 4], [2, 3], [1, 5]]);
  const base = b * d;
  const C = base * rng.int(Math.ceil(120 / base), Math.floor(3000 / base));
  const contenu = (C * a) / b;
  const conso = (contenu * c) / d;
  const ans = contenu - conso;
  return {
    tag: 'Fractions',
    prompt: `Un réservoir de ${N(C)} litres est rempli aux ${a}/${b}. On consomme les ${c}/${d} de ce contenu. Combien de litres reste-t-il dans le réservoir ?`,
    ans, fmt: unit('L'), min: 1,
    cands: [conso, contenu, (C * c) / d, C - conso, C * (a / b - c / d), ans + 10, ans - 10],
    explanation: `Contenu : ${N(C)} × ${a}/${b} = ${N(contenu)} L. Consommé : ${N(contenu)} × ${c}/${d} = ${N(conso)} L. Reste : <b>${N(ans)} L</b>.`,
    meta: { type: 'reservoir', C, a, b, c, d },
  };
}

export function ages(rng) {
  const k = rng.int(3, 6), m = rng.int(2, k - 1), n = rng.int(2, 24);
  const num = n * (m - 1);
  if (num % (k - m)) fail();
  const f = num / (k - m);
  if (f < 2 || f > 20 || k * f > 75) fail();
  return {
    tag: 'Problèmes',
    prompt: `Un père a aujourd’hui ${k} fois l’âge de son fils. Dans ${n} ans, il aura ${m} fois l’âge de son fils. Quel est l’âge actuel du fils ?`,
    ans: f, fmt: (v) => `${N(v)} ans`, integer: true, min: 1,
    cands: [k * f, f + 1, f - 1, f + 2, f - 2, f + n, n],
    explanation: `Soit f l’âge du fils : ${k}f + ${n} = ${m}(f + ${n}) ⇒ ${k - m}f = ${num} ⇒ f = <b>${f} ans</b> (le père a ${k * f} ans).`,
    meta: { type: 'ages', k, m, n },
  };
}

const ROBINET_PAIRS = (() => {
  const out = [];
  for (let a = 6; a <= 90; a++) for (let b = a + 1; b <= 4 * a && b <= 180; b++) if ((a * b) % (a + b) === 0) out.push([a, b]);
  return out;
})();
export function robinets(rng) {
  const [a, b] = rng.pick(ROBINET_PAIRS);
  const t = (a * b) / (a + b);
  return {
    tag: 'Problèmes',
    prompt: `Une pompe A remplit une citerne en ${a} minutes, une pompe B la remplit en ${b} minutes. En combien de temps la remplissent-elles en fonctionnant ensemble ?`,
    ans: t, fmt: (v) => `${N(v)} min`, integer: true, min: 1,
    cands: [(a + b) / 2, b - a, a / 2, t + 2, t - 2, t + 5, a + b],
    explanation: `Débits : 1/${a} + 1/${b} = ${(a + b) / gcd(a + b, a * b)}/${(a * b) / gcd(a + b, a * b)} de citerne par minute. Durée = ${a} × ${b} / (${a} + ${b}) = <b>${N(t)} min</b>.`,
    meta: { type: 'robinets', a, b },
  };
}

export function echelle(rng) {
  const scale = rng.pick([25000, 50000, 100000, 200000, 250000, 500000, 1000000]);
  const d = rng.int(2, 18) + (rng.chance(0.3) ? 0.5 : 0);
  const ans = (d * scale) / 100000;
  return {
    tag: 'Proportionnalité',
    prompt: `Sur une carte au 1/${N(scale)}, deux aérodromes sont séparés de ${N(d)} cm. Quelle est la distance réelle ?`,
    ans, fmt: unit('km', 3), min: 0,
    cands: [ans * 10, ans / 10, ans * 100, ans + scale / 100000, ans - scale / 100000],
    explanation: `${N(d)} cm × ${N(scale)} = ${N(d * scale)} cm = <b>${N(ans, 3)} km</b> (1 km = 100 000 cm).`,
    meta: { type: 'echelle', scale, d },
  };
}

export function conversion(rng) {
  const kind = rng.pick(['kmh2ms', 'ms2kmh', 'nm2km']);
  if (kind === 'kmh2ms') {
    const k = rng.int(5, 30);
    const v = 36 * k, ans = 10 * k;
    return {
      tag: 'Conversions',
      prompt: `Un avion roule sur la piste à ${N(v)} km/h. Quelle est sa vitesse en m/s ?`,
      ans, fmt: unit('m/s'), min: 1,
      cands: [v * 3.6, v / 36, v / 60, ans + 5, ans - 5, ans * 2],
      explanation: `1 m/s = 3,6 km/h, donc ${N(v)} / 3,6 = <b>${N(ans)} m/s</b>.`,
      meta: { type: 'conversion', kind, v },
    };
  }
  if (kind === 'ms2kmh') {
    const v = 5 * rng.int(2, 60), ans = v * 3.6;
    return {
      tag: 'Conversions',
      prompt: `Un objet se déplace à ${N(v)} m/s. Quelle est sa vitesse en km/h ?`,
      ans, fmt: unit('km/h', 1), min: 1,
      cands: [v / 3.6, v * 60, v * 36, ans + 18, ans - 18, v * 3.6 * 10],
      explanation: `${N(v)} × 3,6 = <b>${N(ans, 1)} km/h</b>.`,
      meta: { type: 'conversion', kind, v },
    };
  }
  const nm = 10 * rng.int(2, 60);
  const ans = nm * 1.852;
  return {
    tag: 'Conversions',
    prompt: `Un mille nautique (NM) vaut 1,852 km. Combien de kilomètres représentent ${N(nm)} NM ?`,
    ans, fmt: unit('km', 2), min: 1,
    cands: [nm / 1.852, nm * 1.609, ans + 18.52, ans - 18.52, ans * 10],
    explanation: `${N(nm)} × 1,852 = <b>${N(ans, 2)} km</b>.`,
    meta: { type: 'conversion', kind, v: nm },
  };
}

export function rectangle(rng) {
  const L = rng.int(12, 80), W = rng.int(5, L - 2);
  const P = 2 * (L + W);
  const ans = L * W;
  return {
    tag: 'Géométrie',
    prompt: `Un hangar rectangulaire a un périmètre de ${N(P)} m et une longueur de ${N(L)} m. Quelle est sa surface ?`,
    ans, fmt: unit('m²'), min: 1,
    cands: [2 * L * W, L * (P - L), (L * P) / 2, ans + L, ans - L, ans + W],
    explanation: `Largeur = ${N(P)} / 2 − ${N(L)} = ${N(W)} m. Surface = ${N(L)} × ${N(W)} = <b>${N(ans)} m²</b>.`,
    meta: { type: 'rectangle', P, L },
  };
}

export function suite(rng) {
  const kind = rng.pick(['arith', 'geom', 'diff', 'alt', 'affine', 'fibo']);
  let terms = [], expl = '', next;
  if (kind === 'arith') {
    const a = rng.int(-20, 60), d = rng.pick([-13, -9, -7, -6, 3, 4, 6, 7, 8, 9, 11, 12, 15]);
    for (let i = 0; i < 6; i++) terms.push(a + i * d);
    expl = `On ajoute ${d > 0 ? d : `(${d})`} à chaque terme.`;
  } else if (kind === 'geom') {
    const a = rng.int(1, 6), r = rng.pick([2, 3, -2]);
    for (let i = 0; i < 6; i++) terms.push(a * r ** i);
    expl = `On multiplie chaque terme par ${r}.`;
  } else if (kind === 'diff') {
    const a = rng.int(1, 30), d0 = rng.int(1, 6), dd = rng.int(1, 4);
    terms = [a];
    for (let i = 0; i < 5; i++) terms.push(terms[i] + d0 + i * dd);
    expl = `Les écarts augmentent de ${dd} à chaque fois : +${d0}, +${d0 + dd}, +${d0 + 2 * dd}…`;
  } else if (kind === 'alt') {
    const a = rng.int(1, 40), x = rng.int(2, 9), y = -rng.int(1, 5);
    terms = [a];
    for (let i = 0; i < 6; i++) terms.push(terms[i] + (i % 2 === 0 ? x : y));
    expl = `On ajoute alternativement ${x} puis ${y}.`;
  } else if (kind === 'affine') {
    const a = rng.int(1, 5), m = rng.pick([2, 3]), c = rng.pick([-1, 1, 2, -2, 3]);
    terms = [a];
    for (let i = 0; i < 5; i++) terms.push(terms[i] * m + c);
    expl = `Chaque terme est le précédent multiplié par ${m}, ${c > 0 ? 'plus' : 'moins'} ${Math.abs(c)}.`;
  } else {
    const a = rng.int(1, 6), b = rng.int(a, 9);
    terms = [a, b];
    for (let i = 0; i < 5; i++) terms.push(terms[i] + terms[i + 1]);
    expl = 'Chaque terme est la somme des deux précédents.';
  }
  next = terms.pop();
  const last = terms[terms.length - 1], prev = terms[terms.length - 2];
  const d = last - prev;
  if (new Set(terms).size < terms.length - 1 && kind !== 'alt') fail();
  return {
    tag: 'Suites logiques',
    prompt: `Quel nombre complète la suite : <b>${terms.map((t) => N(t)).join(' ; ')} ; ?</b>`,
    ans: next, fmt: (v) => N(v), integer: true,
    cands: [last + d, next + 1, next - 1, next + 2, next - 2, last * 2, next + d],
    explanation: `${expl} Le terme suivant est <b>${N(next)}</b>.`,
    meta: { type: 'suite', kind, terms, next },
  };
}

/* ---------- calcul (Math 1) ---------- */
export function multiplication(rng) {
  const a = rng.int(12, 99), b = rng.int(12, 99);
  const ans = a * b;
  return {
    tag: 'Calcul',
    prompt: `Combien font ${a} × ${b} ?`,
    ans, fmt: (v) => N(v), integer: true, min: 1,
    cands: [ans + 10, ans - 10, ans + a, ans - a, ans + b, ans - b, ans + 100, ans - 100],
    explanation: `${a} × ${b} = ${a} × ${Math.floor(b / 10) * 10} + ${a} × ${b % 10} = ${a * Math.floor(b / 10) * 10} + ${a * (b % 10)} = <b>${N(ans)}</b>.`,
    meta: { type: 'multiplication', a, b },
  };
}

export function division(rng) {
  const d = rng.int(3, 19), q = rng.int(12, 99);
  const D = d * q;
  return {
    tag: 'Calcul',
    prompt: `Combien font ${N(D)} ÷ ${d} ?`,
    ans: q, fmt: (v) => N(v), integer: true, min: 1,
    cands: [q + 1, q - 1, q + 10, q - 10, q + 2, q - 2],
    explanation: `${d} × ${q} = ${N(D)}, donc ${N(D)} ÷ ${d} = <b>${q}</b>.`,
    meta: { type: 'division', D, d },
  };
}

export function decimaux(rng) {
  const a = rng.int(2, 95) / 10, b = rng.pick([0.2, 0.4, 0.5, 0.25, 1.5, 2.5, 0.8, 1.2, 0.05]);
  const ans = Math.round(a * b * 10000) / 10000;
  return {
    tag: 'Calcul',
    prompt: `Combien font ${N(a, 2)} × ${N(b, 2)} ?`,
    ans, fmt: (v) => N(v, 4), min: 0,
    cands: [ans * 10, ans / 10, ans * 100, a + b, ans + b, ans + 0.1],
    explanation: `${N(a, 2)} × ${N(b, 2)} = <b>${N(ans, 4)}</b>.`,
    meta: { type: 'decimaux', a, b },
  };
}

export function equation(rng) {
  const x = rng.pick([-1, 1]) * rng.int(1, 15);
  const a = rng.int(2, 9), c = rng.int(1, 9);
  if (a === c) fail();
  const b = rng.int(-20, 20);
  const d = a * x + b - c * x;
  const lhs = `${a}x ${b < 0 ? '−' : '+'} ${Math.abs(b)}`;
  const rhs = `${c === 1 ? '' : c}x ${d < 0 ? '−' : '+'} ${Math.abs(d)}`;
  return {
    tag: 'Équations',
    prompt: `Résolvez : <b>${lhs} = ${rhs}</b>. Combien vaut x ?`,
    ans: x, fmt: (v) => N(v, 3), integer: false,
    cands: [-x, x + 1, x - 1, (d + b) / (a - c), (d - b) / (a + c), x + 2, x * 2],
    explanation: `${a}x − ${c}x = ${d} − (${b}) ⇒ ${a - c}x = ${d - b} ⇒ x = <b>${x}</b>.`,
    meta: { type: 'equation', a, b, c, d },
  };
}

export function fractions(rng) {
  const op = rng.pick(['+', '−', '×', '÷']);
  const a = rng.int(1, 9), b = rng.int(2, 9), c = rng.int(1, 9), d = rng.int(2, 9);
  if (gcd(a, b) !== 1 || gcd(c, d) !== 1 || a === b || c === d) fail();
  let r, expl;
  if (op === '+') { r = frac(a * d + c * b, b * d); expl = `${a}/${b} + ${c}/${d} = (${a * d} + ${c * b})/${b * d}`; }
  else if (op === '−') { r = frac(a * d - c * b, b * d); expl = `${a}/${b} − ${c}/${d} = (${a * d} − ${c * b})/${b * d}`; }
  else if (op === '×') { r = frac(a * c, b * d); expl = `${a}/${b} × ${c}/${d} = ${a * c}/${b * d}`; }
  else { r = frac(a * d, b * c); expl = `${a}/${b} ÷ ${c}/${d} = ${a}/${b} × ${d}/${c} = ${a * d}/${b * c}`; }
  if (r[0] === 0) fail();
  const cands = [
    frac(a + c, b + d), frac(a * c, b + d), frac(r[0] + 1, r[1]), frac(r[0] - 1, r[1]), frac(r[1], r[0]),
    frac(a * d - c * b, b * d), frac(a * d + c * b, b * d), frac(a * c, b * d), frac(a * d, b * c), frac(b * c, a * d), frac(-r[0], r[1]),
  ].filter((f) => f[1] !== 0 && f[0] !== 0);
  const { options, answer } = makeOptions(rng, r, rng.shuffle(cands), { count: 5, key: fracStr, html: fracHtml });
  return {
    tag: 'Fractions',
    prompt: `Calculez et simplifiez : <b>${a}/${b} ${op} ${c}/${d}</b>`,
    options, answer, layout: 'inline',
    explanation: `${expl} = <b>${fracStr(r)}</b>.`,
    meta: { type: 'fractions', op, a, b, c, d, r },
  };
}

export function racine(rng) {
  const k = rng.int(11, 35);
  const sq = k * k;
  return {
    tag: 'Calcul',
    prompt: `Combien vaut √${N(sq)} ?`,
    ans: k, fmt: (v) => N(v), integer: true, min: 1,
    cands: [k + 1, k - 1, k + 2, k - 2, sq / 2, k + 10],
    explanation: `${k} × ${k} = ${N(sq)}, donc √${N(sq)} = <b>${k}</b>.`,
    meta: { type: 'racine', sq },
  };
}

export function puissances(rng) {
  const a = rng.int(1, 9), b = rng.int(2, 9), p = rng.int(-4, 6), q = rng.int(-4, 6);
  if (a * b >= 10) fail();
  const show = (m, e) => `${m} × 10<sup>${e < 0 ? '−' + -e : e}</sup>`;
  const cands = [[a * b, p * q], [a * b, p + q + 1], [a * b, p + q - 1], [a + b, p + q], [a * b, p - q], [a * b * 10, p + q]];
  const { options, answer } = makeOptions(rng, [a * b, p + q], rng.shuffle(cands), { count: 5, key: ([m, e]) => `${m}e${e}|${m * 10 ** e}`, html: ([m, e]) => show(m, e) });
  // reject candidates numerically equal to the answer (e.g. 60×10^1 vs 6×10^2)
  const val = ([m, e]) => m * 10 ** e;
  if (options.some((o, i) => i !== answer && Math.abs(val(o.value) - val([a * b, p + q])) < 1e-9 * Math.abs(val([a * b, p + q])))) fail();
  return {
    tag: 'Calcul',
    prompt: `Combien vaut <b>(${show(a, p)}) × (${show(b, q)})</b> ?`,
    options, answer, layout: 'inline',
    explanation: `On multiplie les nombres (${a} × ${b} = ${a * b}) et on additionne les exposants (${p} + (${q}) = ${p + q}) : <b>${show(a * b, p + q)}</b>.`,
    meta: { type: 'puissances', a, b, p, q },
  };
}

/* ---------- problèmes avancés (Math 3) ---------- */
const HARMONIC = (() => {
  const out = [];
  for (let v1 = 120; v1 <= 900; v1 += 30) for (let v2 = v1 + 30; v2 <= 900; v2 += 30) if ((2 * v1 * v2) % (v1 + v2) === 0) out.push([v1, v2]);
  return out;
})();
export function allerRetour(rng) {
  const [v1, v2] = rng.pick(HARMONIC);
  const ans = (2 * v1 * v2) / (v1 + v2);
  const [va, vr] = rng.chance(0.5) ? [v1, v2] : [v2, v1];
  return {
    tag: 'Vitesses moyennes',
    prompt: `Un avion fait un aller à ${N(va)} km/h et revient par le même trajet à ${N(vr)} km/h. Quelle est sa vitesse moyenne sur l’aller-retour ?`,
    ans, fmt: unit('km/h'), min: 1,
    cands: [(v1 + v2) / 2, ans + 10, ans - 10, ans + 20, ans - 20, v2 - v1],
    explanation: `Pour une distance d : temps total = d/${va} + d/${vr}. Vitesse moyenne = 2d / temps = 2 × ${va} × ${vr} / (${va} + ${vr}) = <b>${N(ans)} km/h</b> (et non la moyenne ${N((v1 + v2) / 2)}).`,
    meta: { type: 'allerRetour', v1, v2 },
  };
}

export function rencontre(rng) {
  const v1 = 30 * rng.int(6, 25), v2 = 30 * rng.int(6, 25);
  const t = 5 * rng.int(4, 36); // minutes
  const D = ((v1 + v2) * t) / 60;
  if (!isInt(D)) fail();
  const askDist = rng.chance(0.4);
  if (askDist) {
    const ans = (v1 * t) / 60;
    if (!isInt(ans)) fail();
    return {
      tag: 'Rencontres et poursuites',
      prompt: `Deux avions distants de ${N(D)} km volent l’un vers l’autre, partis au même instant : A à ${N(v1)} km/h et B à ${N(v2)} km/h. À quelle distance du point de départ de A se croisent-ils ?`,
      ans, fmt: unit('km'), min: 1,
      cands: [D / 2, (v2 * t) / 60, ans + 10, ans - 10, D - ans + 20],
      explanation: `Vitesse de rapprochement : ${N(v1 + v2)} km/h. Durée : ${N(D)} / ${N(v1 + v2)} h = ${fmtHM(t)}. A a parcouru ${N(v1)} × ${N(t / 60, 4)} = <b>${N(ans)} km</b>.`,
      meta: { type: 'rencontre', v1, v2, D, ask: 'dist' },
    };
  }
  return {
    tag: 'Rencontres et poursuites',
    prompt: `Deux avions distants de ${N(D)} km volent l’un vers l’autre, partis au même instant, à ${N(v1)} km/h et ${N(v2)} km/h. Au bout de combien de temps se croisent-ils ?`,
    ans: t, fmt: fmtHM, min: 1, step: 5,
    cands: [Math.round((D / Math.abs(v1 - v2 || 1)) * 60), t + 5, t - 5, t + 10, t - 10, t * 2],
    explanation: `Vitesse de rapprochement : ${N(v1)} + ${N(v2)} = ${N(v1 + v2)} km/h. Durée : ${N(D)} / ${N(v1 + v2)} h = <b>${fmtHM(t)}</b>.`,
    meta: { type: 'rencontre', v1, v2, D, ask: 'time' },
  };
}

export function rattrapage(rng) {
  const vA = 30 * rng.int(6, 20), vB = vA + 30 * rng.int(1, 8);
  const delay = 5 * rng.int(2, 12); // minutes
  const ans = (vA * delay) / (vB - vA); // minutes after B's departure
  if (!isInt(ans) || ans > 240) fail();
  return {
    tag: 'Rencontres et poursuites',
    prompt: `Un avion A part à ${N(vA)} km/h. ${delay} minutes plus tard, un avion B part du même point, sur la même route, à ${N(vB)} km/h. Combien de temps après son départ B rattrape-t-il A ?`,
    ans, fmt: fmtHM, min: 1, step: 5,
    cands: [ans + delay, ans - delay, (vB * delay) / (vB - vA), ans + 10, ans - 10],
    explanation: `Avance de A : ${N(vA)} × ${delay}/60 = ${N((vA * delay) / 60, 2)} km. B gagne ${N(vB - vA)} km/h. Temps : ${N((vA * delay) / 60, 2)} / ${N(vB - vA)} h = <b>${fmtHM(ans)}</b>.`,
    meta: { type: 'rattrapage', vA, vB, delay },
  };
}

export function billets(rng) {
  const a = rng.int(8, 30), b = rng.int(3, a - 2), n = rng.int(8, 40), c = rng.int(1, n - 1);
  const T = a * (n - c) + b * c;
  return {
    tag: 'Problèmes',
    prompt: `Lors d’une journée portes ouvertes, un billet adulte coûte ${euro(a)} et un billet enfant ${euro(b)}. Un groupe de ${n} personnes paie ${euro(T)}. Combien y a-t-il d’enfants ?`,
    ans: c, fmt: (v) => N(v), integer: true, min: 1,
    cands: [n - c, c + 1, c - 1, c + 2, c - 2, Math.round(T / (a + b))].filter((v) => v < n),
    explanation: `Si tous étaient adultes : ${n} × ${a} = ${a * n} €. Écart : ${a * n} − ${T} = ${a * n - T} €, et chaque enfant fait économiser ${a - b} €. Enfants : ${a * n - T} / ${a - b} = <b>${c}</b>.`,
    meta: { type: 'billets', a, b, n, T },
  };
}

const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41]];
export function pythagore(rng) {
  const [p, q, r] = rng.pick(TRIPLES);
  const k = rng.pick([1, 2, 3, 5, 10, 20]);
  const [x, y, z] = [p * k, q * k, r * k];
  const [d1, d2] = rng.chance(0.5) ? [x, y] : [y, x];
  return {
    tag: 'Géométrie',
    prompt: `Un avion vole ${N(d1)} km plein nord, puis ${N(d2)} km plein est. À quelle distance (à vol d’oiseau) se trouve-t-il de son point de départ ?`,
    ans: z, fmt: unit('km'), min: 1, integer: true,
    cands: [x + y, Math.abs(x - y), z + k, z - k, Math.round((x + y) / 1.5)],
    explanation: `Théorème de Pythagore : √(${N(d1)}² + ${N(d2)}²) = √${N(x * x + y * y)} = <b>${N(z)} km</b>.`,
    meta: { type: 'pythagore', x, y },
  };
}

export function probabilite(rng) {
  const r = rng.int(2, 8), b = rng.int(2, 8);
  const t = r + b;
  const kind = rng.pick(['both', 'one']);
  let res, expl;
  if (kind === 'both') {
    res = frac(r * (r - 1), t * (t - 1));
    expl = `${r}/${t} × ${r - 1}/${t - 1} = ${r * (r - 1)}/${t * (t - 1)}`;
  } else {
    res = frac(r, t);
    expl = `${r} boules rouges sur ${t} au total : ${r}/${t}`;
  }
  const cands = [frac(r * r, t * t), frac(r, t), frac(r - 1, t - 1), frac(r, b), frac(b, t), frac(r * (r - 1), t * t), frac(2 * r, t + r), frac(1, t)].filter((f) => f[0] > 0 && f[0] < f[1] * 2);
  const prompt = kind === 'both'
    ? `Une urne contient ${r} boules rouges et ${b} boules bleues. On tire successivement deux boules, sans remise. Quelle est la probabilité d’obtenir deux boules rouges ?`
    : `Une urne contient ${r} boules rouges et ${b} boules bleues. On tire une boule au hasard. Quelle est la probabilité qu’elle soit rouge ?`;
  const { options, answer } = makeOptions(rng, res, rng.shuffle(cands), { count: 5, key: fracStr, html: fracHtml });
  return {
    tag: 'Probabilités', prompt, options, answer, layout: 'inline',
    explanation: `${expl} = <b>${fracStr(res)}</b>.`,
    meta: { type: 'probabilite', kind, r, b, res },
  };
}

export function vent(rng) {
  const tas = 20 * rng.int(10, 25), w = 10 * rng.int(2, 8);
  const head = rng.chance(0.5);
  const gs = head ? tas - w : tas + w;
  const t = 15 * rng.int(2, 12);
  const D = (gs * t) / 60;
  if (!isInt(D)) fail();
  const wrong = head ? tas + w : tas - w;
  return {
    tag: 'Navigation',
    prompt: `Un avion vole à une vitesse propre de ${N(tas)} kt avec un vent ${head ? 'de face' : 'arrière'} de ${N(w)} kt. Combien de temps lui faut-il pour parcourir ${N(D)} NM ?`,
    ans: t, fmt: fmtHM, step: 15, min: 1,
    cands: [Math.round((D / tas) * 60), Math.round((D / wrong) * 60), t + 15, t - 15, t + 30],
    explanation: `Vitesse sol = ${N(tas)} ${head ? '−' : '+'} ${N(w)} = ${N(gs)} kt. Durée = ${N(D)} / ${N(gs)} h = <b>${fmtHM(t)}</b>.`,
    meta: { type: 'vent', tas, w, head, D },
  };
}

export function descente(rng) {
  const from = 1000 * rng.int(8, 35), to = 1000 * rng.int(1, 6);
  const rate = rng.pick([500, 800, 1000, 1200, 1500, 2000, 2500]);
  const ans = (from - to) / rate;
  if (!isInt(ans)) fail();
  return {
    tag: 'Navigation',
    prompt: `Un avion descend de ${N(from)} ft à ${N(to)} ft avec un taux de descente constant de ${N(rate)} ft/min. Combien de temps dure la descente ?`,
    ans, fmt: (v) => `${N(v)} min`, integer: true, min: 1,
    cands: [from / rate, ans + 1, ans - 1, ans + 2, ans - 2, (from + to) / rate],
    explanation: `Dénivelé : ${N(from - to)} ft ; ${N(from - to)} / ${N(rate)} = <b>${N(ans)} min</b>.`,
    meta: { type: 'descente', from, to, rate },
  };
}

const CITIES = [
  ['Paris', 1], ['Montréal', -5], ['New York', -5], ['Dakar', 0], ['Dubaï', 4], ['Tokyo', 9], ['Abidjan', 0], ['Nouméa', 11],
  ['Pointe-à-Pitre', -4], ['La Réunion (Saint-Denis)', 4], ['Djibouti', 3], ['Los Angeles', -8], ['Cayenne', -3], ['N’Djamena', 1],
];
export function fuseaux(rng) {
  const [[c1, z1], [c2, z2]] = rng.sample(CITIES, 2);
  if (z1 === z2) fail();
  const dep = 5 * rng.int(6 * 12, 20 * 12);
  const dur = 5 * rng.int(18, 14 * 12);
  const arr = dep + dur + (z2 - z1) * 60;
  const dayShift = Math.floor(arr / 1440);
  const fmtDay = (m) => {
    const ds = Math.floor(m / 1440);
    return fmtTimeOfDay(m) + (ds > 0 ? ` (J+${ds})` : ds < 0 ? ` (J${ds})` : '');
  };
  const sign = (z) => (z >= 0 ? `UTC+${z}` : `UTC−${-z}`);
  return {
    tag: 'Durées et horaires',
    prompt: `Un avion quitte ${c1} (${sign(z1)}) à ${fmtTimeOfDay(dep)} heure locale. Le vol dure ${fmtHM(dur)}. Quelle heure locale est-il à ${c2} (${sign(z2)}) à l’arrivée ?`,
    ans: arr, fmt: fmtDay, step: 60,
    cands: [dep + dur, dep + dur - (z2 - z1) * 60, arr + 60, arr - 60, arr + 30, arr - 30],
    explanation: `Arrivée en heure de ${c1} : ${fmtTimeOfDay(dep + dur)}. Décalage ${c2} − ${c1} = ${z2 - z1 > 0 ? '+' : ''}${z2 - z1} h. Heure locale d’arrivée : <b>${fmtDay(arr)}</b>${dayShift ? ' (J+1 = le lendemain, J−1 = la veille)' : ''}.`,
    meta: { type: 'fuseaux', dep, dur, z1, z2 },
  };
}

export function volume(rng) {
  const L = rng.int(2, 12), l = rng.int(1, 6), h = rng.pick([0.5, 1, 1.5, 2, 2.5, 3]);
  const ans = L * l * h * 1000;
  return {
    tag: 'Géométrie',
    prompt: `Une citerne a la forme d’un pavé droit de ${N(L)} m × ${N(l)} m × ${N(h)} m. Quelle est sa contenance en litres ?`,
    ans, fmt: unit('L'), min: 1,
    cands: [ans / 10, ans * 10, L * l * h * 100, ans + 1000, ans - 1000, (L + l + h) * 1000],
    explanation: `Volume : ${N(L)} × ${N(l)} × ${N(h)} = ${N(L * l * h)} m³ ; 1 m³ = 1 000 L, donc <b>${N(ans)} L</b>.`,
    meta: { type: 'volume', L, l, h },
  };
}

export function cercle(rng) {
  const r = rng.int(2, 20);
  const ask = rng.pick(['aire', 'perimetre']);
  const ans = ask === 'aire' ? Math.round(3.14 * r * r * 100) / 100 : Math.round(2 * 3.14 * r * 100) / 100;
  const alt = ask === 'aire' ? 2 * 3.14 * r : 3.14 * r * r;
  return {
    tag: 'Géométrie',
    prompt: `Un radar couvre un disque de rayon ${r} km. Quel est ${ask === 'aire' ? 'l’aire de cette zone (en km²)' : 'le périmètre de cette zone (en km)'} ? (Prendre π = 3,14.)`,
    ans, fmt: (v) => N(v, 2), min: 0,
    cands: [alt, 3.14 * r, 3.14 * 2 * r * 2 * r, ans + 3.14, ans - 3.14, ans * 2],
    explanation: ask === 'aire' ? `Aire = π × r² = 3,14 × ${r}² = <b>${N(ans, 2)} km²</b>.` : `Périmètre = 2 × π × r = 2 × 3,14 × ${r} = <b>${N(ans, 2)} km</b>.`,
    meta: { type: 'cercle', r, ask },
  };
}

export function melange(rng) {
  const x = 10 * rng.int(1, 12), y = 10 * rng.int(1, 12);
  const a = rng.int(2, 18) * 5, b = rng.int(2, 18) * 5;
  if (a === b) fail();
  const ans = (x * a + y * b) / (x + y);
  if (!isInt(ans * 10)) fail();
  return {
    tag: 'Problèmes',
    prompt: `On mélange ${x} L d’un liquide de refroidissement concentré à ${a} % avec ${y} L concentré à ${b} %. Quelle est la concentration du mélange ?`,
    ans, fmt: (v) => `${N(v, 1)} %`, min: 0,
    cands: [(a + b) / 2, ans + 2, ans - 2, ans + 5, ans - 5, a + b],
    explanation: `Quantité de produit : ${x} × ${a} % + ${y} × ${b} % = ${N((x * a + y * b) / 100, 2)} L pour ${x + y} L, soit <b>${N(ans, 1)} %</b>.`,
    meta: { type: 'melange', x, y, a, b },
  };
}

export function croissance(rng) {
  const p = rng.pick([10, 20, 5, 50]);
  const n = 2;
  const N0 = 100 * rng.int(2, 60);
  const ans = (N0 * (100 + p) ** 2) / 10000;
  if (!isInt(ans * 100)) fail();
  return {
    tag: 'Pourcentages',
    prompt: `Le nombre d’heures de vol d’un escadron (${N(N0)} h la première année) augmente de ${p} % par an. Combien d’heures sont prévues deux ans plus tard ?`,
    ans, fmt: (v) => `${N(v, 2)} h`, min: 1,
    cands: [N0 * (1 + (2 * p) / 100), N0 * (1 + p / 100), ans + 10, ans - 10, ans + N0 / 100],
    explanation: `Deux hausses successives de ${p} % : ${N(N0)} × ${N(1 + p / 100)}² = ${N(N0)} × ${N((1 + p / 100) ** 2, 4)} = <b>${N(ans, 2)} h</b>.`,
    meta: { type: 'croissance', p, N0, n },
  };
}

/* ------------------------------------------------------------- assembly */
function build(rng, gen) {
  return retry(() => {
    const p = gen(rng);
    let options = p.options, answer = p.answer;
    if (!options) ({ options, answer } = numOptions(rng, p.ans, p.cands, { fmt: p.fmt, min: p.min ?? -Infinity, integer: !!p.integer, step: p.step }));
    return { tag: p.tag, prompt: p.prompt, options, answer, layout: p.layout || 'inline', explanation: p.explanation, meta: { ...p.meta, ans: p.ans } };
  });
}

/** Draw `count` questions cycling through a shuffled deck of generators (maximises variety). */
function generateFrom(gens) {
  return (rng, count) => {
    const out = [];
    let deck = [];
    for (let i = 0; i < count; i++) {
      if (!deck.length) deck = rng.shuffle(gens);
      out.push(build(rng, deck.pop()));
    }
    return out;
  };
}

export const TAMIC_GENS = [remise, variationsSuccessives, vitesse, heureArrivee, consommation, ouvriers, moyenne, reservoir, ages, robinets, echelle, conversion, rectangle, suite, interets];
export const MATH1_GENS = [multiplication, division, decimaux, pourcentageDe, equation, fractions, racine, puissances, vitesse, consommation, ouvriers, reservoir, conversion, suite, remise];
export const MATH3_GENS = [allerRetour, rencontre, rattrapage, billets, pythagore, probabilite, vent, descente, fuseaux, volume, cercle, melange, croissance, hausseInverse, ages, robinets];

const mathInstructions = (extra) => `<ul>
  <li>Problèmes à choix multiples : une seule bonne réponse parmi les propositions.</li>
  <li>Feuille de brouillon et stylo autorisés, <b>calculatrice interdite</b>.</li>
  ${extra}
  <li>Chaque série mélange les types de problèmes ; la correction détaille la méthode.</li></ul>`;

const ICON_MATH = `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M14 8v18M5 17h18M40 17h18M8 40l12 12M20 40 8 52M40 46h18"/><circle cx="49" cy="39" r="1.5" fill="currentColor"/><circle cx="49" cy="53" r="1.5" fill="currentColor"/></svg>`;

export const tamicMaths = {
  id: 'maths', section: 'tamic', title: 'Mathématiques',
  description: 'Résolvez des problèmes de mathématiques et choisissez la bonne réponse parmi les cinq proposées. Vous avez droit à une feuille de brouillon et à un stylo, mais pas à la calculatrice.',
  count: 26, time: 18 * 60,
  instructions: mathInstructions('<li>Environ 40 secondes par question : pourcentages, vitesses, proportionnalité, moyennes, fractions, suites…</li>'),
  generate: generateFrom(TAMIC_GENS),
  icon: ICON_MATH,
};
export const math1 = {
  id: 'math1', section: 'eopn', title: 'Math 1',
  description: 'Résolvez des problèmes de mathématiques et choisissez la bonne réponse parmi les cinq proposées. Vous avez droit à une feuille de brouillon et à un stylo, mais pas à la calculatrice.',
  count: 25, time: 45 * 60,
  instructions: mathInstructions('<li>Calcul posé et mental, fractions, puissances, équations et problèmes de proportionnalité.</li>'),
  generate: generateFrom(MATH1_GENS),
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 6h28l10 10v42H14z"/><text x="19" y="30" font-size="11" fill="currentColor" stroke="none" font-family="monospace">347</text><text x="19" y="44" font-size="11" fill="currentColor" stroke="none" font-family="monospace">258</text><path d="M19 48h24"/></svg>`,
};
export const math3 = {
  id: 'math3', section: 'eopn', title: 'Math 3',
  description: 'Résolvez des problèmes de mathématiques et choisissez la bonne réponse parmi les cinq proposées. Vous avez droit à une feuille de brouillon et à un stylo, mais pas à la calculatrice.',
  count: 25, time: 45 * 60,
  instructions: mathInstructions('<li>Problèmes à plusieurs étapes : vitesses moyennes, rencontres, vent, fuseaux horaires, géométrie, probabilités…</li>'),
  generate: generateFrom(MATH3_GENS),
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><text x="6" y="26" font-size="16" fill="currentColor" stroke="none" font-family="sans-serif">72</text><text x="40" y="26" font-size="16" fill="currentColor" stroke="none" font-family="sans-serif">3</text><path d="M34 8v48M34 32h24"/><text x="40" y="50" font-size="16" fill="currentColor" stroke="none" font-family="sans-serif">24</text><text x="14" y="56" font-size="16" fill="currentColor" stroke="none" font-family="sans-serif">0</text></svg>`,
};
