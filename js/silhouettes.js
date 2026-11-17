// Silhouettes d'aéronefs dessinées à partir de paramètres géométriques (dimensions en mètres).
// Trois vues : dessous (« ombre »), face et profil. Une silhouette pleine vue de face est identique
// à la vue arrière.
//
// Repère : x de l'avant (0) vers l'arrière, y vers la droite, z vers le haut.

export const VIEWS = { dessous: 'Vue de dessous (ombre)', face: 'Vue de face', profil: 'Vue de profil' };

const D2R = Math.PI / 180;
const tan = (d) => Math.tan(d * D2R);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* -------------------------------------------------------------- shapes */
// shapes are expressed in view coordinates (u to the right, v downwards on screen)
const poly = (pts, o = 1) => ({ t: 'poly', pts, o });
const ell = (cx, cy, rx, ry, o = 1) => ({ t: 'ell', cx, cy, rx, ry, o });
const line = (a, b, w, o = 1) => ({ t: 'line', a, b, w, o });
const rect = (u0, v0, u1, v1, o = 1) => poly([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], o);

/* ------------------------------------------------------------- fuselage */
const BODY = {
  fighter: { nose: 0.32, tail: 0.12, np: 0.75, tw: 0.72, c: 0, tTop: 0.3, tBot: -0.3 },
  airliner: { nose: 0.1, tail: 0.24, np: 0.5, tw: 0.12, c: -0.1, tTop: 0.3, tBot: 0.18 },
  cargo: { nose: 0.1, tail: 0.3, np: 0.5, tw: 0.2, c: -0.05, tTop: 0.42, tBot: 0.3 },
  light: { nose: 0.18, tail: 0.45, np: 0.6, tw: 0.15, c: 0, tTop: 0.2, tBot: 0.05 },
  bomber: { nose: 0.12, tail: 0.2, np: 0.55, tw: 0.25, c: 0, tTop: 0.3, tBot: 0.05 },
};

function fuselage(s) {
  const B = { ...BODY[s.body || 'airliner'], ...(s.bodyTweak || {}) };
  const { L, fw, fh } = s;
  const nx = B.nose * L, tx = L * (1 - B.tail);
  const halfW = (x) => (x < nx ? (fw / 2) * Math.pow(Math.max(x, 0) / nx, B.np) : x <= tx ? fw / 2 : (fw / 2) * (1 - (1 - B.tw) * ((x - tx) / (L - tx))));
  const c = B.c * fh;
  const hump = (x) => {
    if (!s.hump) return 0;
    const { x0, x1, h } = s.hump;
    if (x <= x0 || x >= x1) return 0;
    const t = (x - x0) / (x1 - x0);
    const up = clamp(t / 0.35, 0, 1), down = clamp((1 - t) / 0.2, 0, 1);
    const sm = (q) => q * q * (3 - 2 * q);
    return h * Math.min(sm(up), sm(down));
  };
  const top = (x) => {
    let z;
    if (x < nx) z = c + (fh / 2 - c) * Math.pow(Math.max(x, 0) / nx, B.np);
    else if (x <= tx) z = fh / 2;
    else z = lerp(fh / 2, B.tTop * fh, (x - tx) / (L - tx));
    return z + hump(x);
  };
  const bot = (x) => {
    if (x < nx) return c - (fh / 2 + c) * Math.pow(Math.max(x, 0) / nx, B.np);
    if (x <= tx) return -fh / 2;
    return lerp(-fh / 2, B.tBot * fh, (x - tx) / (L - tx));
  };
  return { halfW, top, bot, nx, tx };
}

const samples = (a, b, n = 24) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

/* ---------------------------------------------------- lifting surfaces */
// planform half-surface (y > 0), returns [[x, y], ...]
function surfPlan(p, r) {
  if (p.pts) return p.pts;
  const tipY = p.span / 2;
  const le = p.x + (tipY - r) * tan(p.sweep || 0);
  return [[p.x, r], [le, tipY], [le + p.ct, tipY], [p.x + p.cr, r]];
}
// front half-surface: [[y, z], ...]
function surfFace(p, r, z0) {
  const tipY = p.span / 2;
  const th = clamp(0.1 * p.cr, 0.12, 1.0);
  const pts = [[r, z0 + th / 2]];
  let y = r, z = z0;
  const segs = p.kink ? [[p.kink.y, p.dih || 0], [tipY, p.kink.dih]] : [[tipY, p.dih || 0]];
  const upper = [], lower = [];
  for (const [y1, d] of segs) {
    z += (y1 - y) * tan(d);
    y = y1;
    upper.push([y, z + th * 0.25]);
    lower.unshift([y, z - th * 0.25]);
  }
  return [...pts, ...upper, ...lower, [r, z0 - th / 2]];
}
function surfProfile(p, r, z0) {
  const tipY = p.span / 2;
  const th = clamp(0.1 * p.cr, 0.12, 1.0);
  const le = p.x + (tipY - r) * tan(p.sweep || 0);
  const ztip = z0 + (tipY - r) * tan(p.kink ? p.kink.dih * 0.6 : p.dih || 0);
  if (p.pts) {
    const xs = p.pts.map((q) => q[0]);
    return [[Math.min(...xs), z0 + th / 2], [Math.max(...xs), z0 + th / 4], [Math.max(...xs), z0 - th / 4], [Math.min(...xs) + 0.3, z0 - th / 2]];
  }
  return [[p.x, z0 + th / 2], [le, ztip + th / 4], [le + p.ct, ztip - th / 4], [p.x + p.cr, z0 - th / 2]];
}

const mirrorU = (pts) => pts.map(([u, v]) => [-u, v]);

/* ----------------------------------------------------------- fixed wing */
function fixedShapes(s, view) {
  const F = fuselage(s);
  const { L, fw, fh } = s;
  const out = [];
  const add = (sh) => out.push(sh);
  const both = (pts, o) => {
    add(poly(pts, o));
    add(poly(mirrorU(pts), o));
  };
  const zOf = (where) => (typeof where === 'number' ? where * fh : where === 'low' ? -0.32 * fh : where === 'high' ? 0.4 * fh : 0);
  const w = s.wing;
  const zw = zOf(w.z);
  const r = (fw / 2) * 0.85;
  const surfaces = [];
  if (w) surfaces.push({ p: w, z: zw, r: w.root ?? r });
  if (s.canard) surfaces.push({ p: s.canard, z: zOf(s.canard.z ?? 0.15), r: (fw / 2) * 0.8 });
  // vertical tails
  const vts = [];
  if (s.vt) {
    const v = s.vt;
    const ys = v.ys || (v.n === 2 ? [v.y, -v.y] : [0]);
    const zr = v.z !== undefined ? zOf(v.z) : F.top(v.x + v.cr * 0.5) - 0.05;
    for (const y of ys) vts.push({ ...v, y, zr });
  }
  const vtTop = vts.length ? Math.max(...vts.map((v) => v.zr + v.h * Math.cos((v.cant || 0) * D2R))) : F.top(L);
  if (s.ht) {
    const z = s.ht.T ? vtTop - 0.15 : s.ht.z !== undefined ? zOf(s.ht.z) : (F.top(s.ht.x + s.ht.cr * 0.5) + F.bot(s.ht.x + s.ht.cr * 0.5)) / 2 + 0.1 * fh;
    surfaces.push({ p: s.ht, z, r: Math.max(0.2, F.halfW(s.ht.x + s.ht.cr * 0.5) * 0.9) });
  }
  const pods = [];
  for (const e of s.eng || []) {
    const zc = e.at === 'nose' ? (e.dz || 0) * fh : e.at === 'over' ? fh / 2 + e.d * 0.35 + (e.dz || 0) : e.at === 'inline' ? zw + (e.dz || 0) : zw - e.d * (e.dz ?? 0.6);
    pods.push({ ...e, zc });
  }

  if (view === 'dessous') {
    // planform: u = y, v = x
    if (s.body === 'flyingwing') {
      both(s.planform.map(([x, y]) => [y, x]));
    } else {
      const xs = samples(0, L, 40);
      const right = xs.map((x) => [F.halfW(x), x]);
      add(poly([...right, ...mirrorU(right).reverse()]));
    }
    if (s.body !== 'flyingwing') for (const { p, r: rr } of surfaces) both(surfPlan(p, rr).map(([x, y]) => [y, x]));
    if (s.lerx) for (const l of [].concat(s.lerx)) both([[fw / 2, l.x0], [fw / 2 + l.w, l.x1], [fw / 2, l.x1 + l.back]]);
    for (const n of s.nacelles || []) both([[n.y - n.w / 2, n.x0], [n.y + n.w / 2, n.x0], [n.y + n.w / 2, n.x1], [n.y - n.w / 2, n.x1]]);
    for (const v of vts) {
      const spread = v.h * Math.sin((v.cant || 0) * D2R);
      const u0 = v.y - 0.15, u1 = v.y + 0.15 + spread * Math.sign(v.y || 1);
      add(rect(Math.min(u0, u1), v.x, Math.max(u0, u1), v.x + v.cr));
    }
    for (const e of pods) {
      const pts = [[e.y - e.d / 2, e.x], [e.y + e.d / 2, e.x], [e.y + e.d / 2, e.x + e.len], [e.y - e.d / 2, e.x + e.len]];
      if (e.y) both(pts); else add(poly(pts));
      if (e.prop) {
        for (const sgn of e.y ? [1, -1] : [1]) add(line([sgn * e.y - e.prop / 2, e.x - 0.15], [sgn * e.y + e.prop / 2, e.x - 0.15], 0.22));
      }
    }
    if (s.rotodome) add(ell(0, s.rotodome.x, s.rotodome.d / 2, s.rotodome.d / 2));
    if (s.tiltrotor) {
      const t = s.tiltrotor;
      for (const y of [t.y, -t.y]) {
        add(ell(y, t.x, t.d / 2, t.d / 2, 0.22));
        for (let k = 0; k < 3; k++) {
          const a = (k * 2 * Math.PI) / 3 + 0.4;
          add(line([y, t.x], [y + (t.d / 2) * Math.cos(a), t.x + (t.d / 2) * Math.sin(a)], 0.5));
        }
        add(rect(y - 0.5, t.x - 1.2, y + 0.5, t.x + 1.6));
      }
    }
    if (s.probe) add(line([0, 0], [0, -s.probe], 0.15));
    return out;
  }

  if (view === 'face') {
    // u = y, v = -z
    const flip = (pts) => pts.map(([y, z]) => [y, -z]);
    for (const e of pods) {
      for (const sgn of e.y ? [1, -1] : [1]) {
        if (e.prop) add(ell(sgn * e.y, -e.zc, e.prop / 2, e.prop / 2, 0.2));
        add(ell(sgn * e.y, -e.zc, e.d / 2, e.d / 2));
      }
    }
    if (s.tiltrotor) {
      const t = s.tiltrotor;
      for (const y of [t.y, -t.y]) {
        add(rect(y - 0.55, -(zw - 0.6), y + 0.55, -(zw + t.nac)));
        add(line([y - t.d / 2, -(zw + t.nac + 0.3)], [y + t.d / 2, -(zw + t.nac + 0.3)], 0.25));
      }
    }
    for (const { p, z, r: rr } of surfaces) {
      const half = surfFace(p, rr, z);
      add(poly(flip(half)));
      add(poly(flip(mirrorU(half))));
    }
    if (s.body === 'flyingwing') {
      add(poly(flip([[-s.wing.span / 2, 0.15], [-2.5, 0.9], [-1.2, 1.4], [1.2, 1.4], [2.5, 0.9], [s.wing.span / 2, 0.15], [s.wing.span / 2, -0.1], [-s.wing.span / 2, -0.1]])));
    } else {
      const hh = s.hump ? s.hump.h : 0;
      add(ell(0, -hh / 2, fw / 2, fh / 2 + hh / 2));
    }
    for (const n of s.nacelles || []) for (const sgn of [1, -1]) add(rect(sgn * n.y - n.w / 2, -(zOf(n.z ?? -0.1) + n.h / 2), sgn * n.y + n.w / 2, -(zOf(n.z ?? -0.1) - n.h / 2)));
    for (const it of s.intakes || []) for (const sgn of it.y ? [1, -1] : [1]) add(rect(sgn * it.y - it.w / 2, -(zOf(it.z) + it.h / 2), sgn * it.y + it.w / 2, -(zOf(it.z) - it.h / 2)));
    for (const v of vts) {
      const c = (v.cant || 0) * D2R * Math.sign(v.y || 1);
      const tx = v.y + v.h * Math.sin(c), tz = v.zr + v.h * Math.cos(c);
      const t = 0.14;
      add(poly([[v.y - t, -v.zr], [v.y + t, -v.zr], [tx + t, -tz], [tx - t, -tz]]));
    }
    if (s.canopy) add(ell(0, -(fh / 2 + s.canopy.h * 0.35), Math.min(fw * 0.32, 0.55), s.canopy.h * 0.75));
    if (s.rotodome) {
      const z = F.top(s.rotodome.x) + s.rotodome.h;
      add(ell(0, -z, s.rotodome.d / 2, 0.42));
      add(line([-0.6, -F.top(s.rotodome.x)], [-0.4, -z], 0.25));
      add(line([0.6, -F.top(s.rotodome.x)], [0.4, -z], 0.25));
    }
    if (s.strut) for (const sgn of [1, -1]) add(line([sgn * fw * 0.45, fh * 0.3], [sgn * s.strut.y, -zw], 0.1));
    return out;
  }

  // profile: u = x, v = -z
  if (s.body === 'flyingwing') {
    add(poly([[0, 0], [s.L * 0.3, -1.4], [s.L * 0.6, -1.2], [s.L, -0.2], [s.L, 0.15], [s.L * 0.4, 0.3], [0, 0.1]]));
    return out;
  }
  const xs = samples(0, L, 50);
  add(poly([...xs.map((x) => [x, -F.top(x)]), ...xs.reverse().map((x) => [x, -F.bot(x)])]));
  if (s.canopy) add(ell(s.canopy.x + s.canopy.len / 2, -F.top(s.canopy.x + s.canopy.len / 2), s.canopy.len / 2, s.canopy.h));
  for (const { p, z, r: rr } of surfaces) add(poly(surfProfile(p, rr, z).map(([x, zz]) => [x, -zz])));
  for (const v of vts) {
    const h = v.h * Math.cos((v.cant || 0) * D2R);
    const le = v.x + h * tan(v.sweep || 0);
    add(poly([[v.x, -v.zr], [le, -(v.zr + h)], [le + v.ct, -(v.zr + h)], [v.x + v.cr, -v.zr]]));
    if (v.dorsal) add(poly([[v.x - v.dorsal, -v.zr], [v.x + 0.3, -(v.zr + h * 0.3)], [v.x + 0.3, -v.zr]]));
  }
  for (const n of s.nacelles || []) add(rect(n.x0, -(zOf(n.z ?? -0.1) + n.h / 2), n.x1, -(zOf(n.z ?? -0.1) - n.h / 2)));
  for (const e of pods) {
    add(poly([[e.x, -(e.zc + e.d * 0.42)], [e.x + e.len * 0.85, -(e.zc + e.d / 2)], [e.x + e.len, -(e.zc + e.d * 0.2)], [e.x + e.len, -(e.zc - e.d * 0.2)], [e.x + e.len * 0.85, -(e.zc - e.d / 2)], [e.x, -(e.zc - e.d * 0.42)]]));
    if (e.prop) add(line([e.x - 0.15, -(e.zc + e.prop / 2)], [e.x - 0.15, -(e.zc - e.prop / 2)], 0.2));
    if (e.spike) add(poly([[e.x - e.d * 0.9, -e.zc], [e.x, -(e.zc + e.d * 0.3)], [e.x, -(e.zc - e.d * 0.3)]]));
  }
  if (s.rotodome) {
    const z = F.top(s.rotodome.x) + s.rotodome.h;
    add(ell(s.rotodome.x, -z, s.rotodome.d / 2, 0.42));
    add(line([s.rotodome.x - 1, -F.top(s.rotodome.x - 1)], [s.rotodome.x - 0.6, -z], 0.3));
    add(line([s.rotodome.x + 1, -F.top(s.rotodome.x + 1)], [s.rotodome.x + 0.6, -z], 0.3));
  }
  if (s.tiltrotor) {
    const t = s.tiltrotor;
    add(rect(t.x - 0.6, -(zw - 0.6), t.x + 0.6, -(zw + t.nac)));
    add(line([t.x - t.d / 2, -(zw + t.nac + 0.3)], [t.x + t.d / 2, -(zw + t.nac + 0.3)], 0.25));
  }
  if (s.probe) add(line([0, -F.top(0.5)], [-s.probe, -(F.top(0.5) + 0.2)], 0.15));
  if (s.strut) add(line([w.x + w.cr * 0.4, -(zw - 0.1)], [w.x + w.cr * 0.1, fh * 0.35], 0.1));
  if (s.boom) add(line([L * 0.88, fh * 0.3], [L * 0.98 + s.boom * 0.5, fh * 0.3 + s.boom * 0.7], 0.25));
  return out;
}

/* ----------------------------------------------------------- helicopter */
function heliShapes(s, view) {
  const { L, fw, fh } = s;
  const cl = L * (s.cab ?? 0.55);
  const boomZ = fh * (s.boomZ ?? 0.12);
  const boomH = s.boomH ?? 0.55;
  const rotors = s.rotors || [s.rotor];
  const mastH = s.mast ?? 0.7;
  const out = [];
  const add = (sh) => out.push(sh);
  const fin = s.fin || { h: 1.6, cr: 1.3 };
  const tail = s.tail || 'rotor';
  const trd = s.trd ?? 2.0;

  if (view === 'profil') {
    const nb = s.nose ?? 0.3; // nose bluntness
    add(poly([
      [0, fh * 0.1], [cl * 0.12, -fh * nb], [cl * 0.3, -fh * 0.45], [cl * 0.45, -fh * 0.5],
      [cl * 0.95, -fh * 0.48], [cl + (L - cl) * 0.12, -(boomZ + boomH / 2)], [L, -(boomZ + boomH * 0.35)],
      [L, -(boomZ - boomH * 0.35)], [cl + (L - cl) * 0.12, -(boomZ - boomH / 2) + 0.15], [cl, fh * 0.32],
      [cl * 0.85, fh * 0.5], [cl * 0.12, fh * 0.5], [0, fh * 0.25],
    ]));
    if (s.pylon) add(poly([[L * 0.7, -fh * 0.48], [L * 0.8, -(fh * 0.5 + s.pylon)], [L, -(fh * 0.5 + s.pylon)], [L, -fh * 0.3]]));
    // fin
    if (tail !== 'none') {
      const fz = boomZ;
      add(poly([[L - fin.cr, -fz], [L - fin.cr * 0.45, -(fz + fin.h)], [L + 0.1, -(fz + fin.h)], [L + 0.15, -(fz - fin.h * 0.3)], [L - fin.cr * 0.7, -(fz - 0.1)]]));
      if (tail === 'rotor') add(ell(L - 0.2, -(fz + fin.h * 0.55), trd / 2, trd / 2, 0.22));
      else add(ell(L - fin.cr * 0.35, -(fz + fin.h * 0.4), trd / 2 + 0.25, trd / 2 + 0.25));
    }
    if (s.ht) add(rect(L - s.ht.x, -(boomZ + 0.1), L - s.ht.x + 1.0, -(boomZ - 0.1)));
    if (s.wings) add(rect(s.wings.x, -(-fh * 0.05 + 0.12), s.wings.x + s.wings.cr, -(-fh * 0.05 - 0.12)));
    for (const ro of rotors) {
      const top = fh * 0.5 + (ro.lift || 0);
      add(rect(ro.x - 0.25, -top, ro.x + 0.25, -(top + mastH)));
      add(line([ro.x - ro.d / 2, -(top + mastH)], [ro.x + ro.d / 2, -(top + mastH)], 0.22));
    }
    if (s.gear === 'skids') {
      const zb = -fh * 0.5 - 0.55;
      add(line([cl * 0.05, -zb + 0.1], [cl * 0.95, -zb], 0.14));
      add(line([cl * 0.3, fh * 0.45], [cl * 0.3, -zb], 0.12));
      add(line([cl * 0.75, fh * 0.45], [cl * 0.75, -zb], 0.12));
    } else {
      add(ell(cl * 0.12, fh * 0.5 + 0.3, 0.35, 0.35));
      add(ell(cl * 0.72, fh * 0.5 + 0.3, 0.38, 0.38));
      if (s.tailWheel) add(ell(L * 0.85, boomZ * -1 + 0.6, 0.2, 0.2));
    }
    if (s.probe) add(line([0.2, -fh * 0.05], [-s.probe, -fh * 0.15], 0.15));
    return out;
  }

  if (view === 'dessous') {
    const xs = samples(0, cl, 16);
    const wAt = (x) => (fw / 2) * Math.pow(Math.min(1, x / (cl * 0.35)), 0.5) * (x > cl * 0.8 ? lerp(1, 0.55, (x - cl * 0.8) / (cl * 0.2)) : 1);
    const right = xs.map((x) => [wAt(x), x]);
    add(poly([...right, [boomH / 2 + 0.05, cl + 0.6], [boomH * 0.35, L], [-boomH * 0.35, L], [-(boomH / 2 + 0.05), cl + 0.6], ...mirrorU(right).reverse()]));
    if (s.ht) add(rect(-s.ht.span / 2, L - s.ht.x, s.ht.span / 2, L - s.ht.x + 0.9));
    if (s.wings) {
      add(rect(-s.wings.span / 2, s.wings.x, s.wings.span / 2, s.wings.x + s.wings.cr));
    }
    if (tail === 'rotor') add(line([0.5, L - 0.2 - trd / 2], [0.5, L - 0.2 + trd / 2], 0.18));
    else if (tail === 'fenestron') add(rect(-0.35, L - fin.cr, 0.35, L + 0.1));
    for (const ro of rotors) {
      add(ell(0, ro.x, ro.d / 2, ro.d / 2, 0.15));
      for (let k = 0; k < ro.n; k++) {
        const a = (k * 2 * Math.PI) / ro.n + 0.35;
        add(line([0, ro.x], [(ro.d / 2) * Math.cos(a), ro.x + (ro.d / 2) * Math.sin(a)], Math.max(0.35, ro.d * 0.028)));
      }
    }
    if (s.probe) add(line([0.4, 0.3], [0.6, -s.probe], 0.15));
    return out;
  }

  // face: u = y, v = -z
  add(ell(0, 0, fw / 2, fh / 2));
  if (s.wings) for (const sgn of [1, -1]) add(poly([[sgn * fw * 0.4, fh * 0.05 - 0.12], [sgn * s.wings.span / 2, fh * 0.05 + (s.wings.span / 2) * tan(s.wings.anh || 0) - 0.08], [sgn * s.wings.span / 2, fh * 0.05 + (s.wings.span / 2) * tan(s.wings.anh || 0) + 0.08], [sgn * fw * 0.4, fh * 0.05 + 0.12]]));
  if (tail !== 'none') add(rect(-0.12, -boomZ, 0.12, -(boomZ + fin.h)));
  if (tail === 'rotor') add(line([0.45, -(boomZ + fin.h * 0.55 - trd / 2)], [0.45, -(boomZ + fin.h * 0.55 + trd / 2)], 0.15));
  if (s.ht) add(rect(-s.ht.span / 2, -(boomZ - 0.08), s.ht.span / 2, -(boomZ + 0.08)));
  const top = fh * 0.5 + Math.max(...rotors.map((r) => r.lift || 0));
  add(rect(-0.25, -top + 0.05, 0.25, -(top + mastH)));
  const dmax = Math.max(...rotors.map((r) => r.d));
  add(line([-dmax / 2, -(top + mastH)], [dmax / 2, -(top + mastH)], 0.22));
  add(ell(0, -(top + mastH), 0.4, 0.22));
  if (s.gear === 'skids') {
    for (const sgn of [1, -1]) {
      add(line([sgn * fw * 0.3, fh * 0.4], [sgn * fw * 0.62, fh / 2 + 0.55], 0.12));
      add(ell(sgn * fw * 0.62, fh / 2 + 0.55, 0.12, 0.12));
    }
  } else for (const sgn of [1, -1]) add(ell(sgn * fw * 0.5, fh / 2 + 0.3, 0.3, 0.38));
  return out;
}

/* ---------------------------------------------------------------- render */
export function shapesFor(s, view) {
  return s.heli ? heliShapes(s, view) : fixedShapes(s, view);
}

function bbox(shapes) {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  const pt = (u, v) => {
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  };
  for (const sh of shapes) {
    if (sh.t === 'poly') sh.pts.forEach(([u, v]) => pt(u, v));
    else if (sh.t === 'ell') { pt(sh.cx - sh.rx, sh.cy - sh.ry); pt(sh.cx + sh.rx, sh.cy + sh.ry); }
    else { pt(...sh.a); pt(...sh.b); }
  }
  return { u0, v0, u1, v1 };
}

/** dimensions of the drawing in metres (width × height of the view) */
export function extent(s, view) {
  const b = bbox(shapesFor(s, view));
  return { w: b.u1 - b.u0, h: b.v1 - b.v0 };
}

export function silhouetteSvg(s, view, { w = 280, h = 200, color = '#15181c', bg = '#f2f4f6', label = '' } = {}) {
  const shapes = shapesFor(s, view);
  const b = bbox(shapes);
  const pad = 10;
  const sc = Math.min((w - 2 * pad) / (b.u1 - b.u0 || 1), (h - 2 * pad - (label ? 14 : 0)) / (b.v1 - b.v0 || 1));
  const ox = (w - (b.u1 - b.u0) * sc) / 2 - b.u0 * sc;
  const oy = (h - (label ? 14 : 0) - (b.v1 - b.v0) * sc) / 2 - b.v0 * sc;
  const X = (u) => (ox + u * sc).toFixed(1);
  const Y = (v) => (oy + v * sc).toFixed(1);
  let body = '';
  for (const sh of shapes) {
    const op = sh.o < 1 ? ` fill-opacity="${sh.o}" stroke-opacity="${sh.o}"` : '';
    if (sh.t === 'poly') body += `<polygon points="${sh.pts.map(([u, v]) => `${X(u)},${Y(v)}`).join(' ')}"${op}/>`;
    else if (sh.t === 'ell') body += `<ellipse cx="${X(sh.cx)}" cy="${Y(sh.cy)}" rx="${(sh.rx * sc).toFixed(1)}" ry="${(sh.ry * sc).toFixed(1)}"${op}/>`;
    else body += `<line x1="${X(sh.a[0])}" y1="${Y(sh.a[1])}" x2="${X(sh.b[0])}" y2="${Y(sh.b[1])}" stroke="${color}" stroke-width="${Math.max(1, sh.w * sc).toFixed(1)}" stroke-linecap="round"${op}/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Silhouette">
    <rect width="${w}" height="${h}" rx="8" fill="${bg}"/><g fill="${color}" stroke="${color}" stroke-width="0.6" stroke-linejoin="round">${body}</g>
    ${label ? `<text x="${w / 2}" y="${h - 6}" text-anchor="middle" font-size="11" fill="#556" font-family="sans-serif">${label}</text>` : ''}</svg>`;
}
