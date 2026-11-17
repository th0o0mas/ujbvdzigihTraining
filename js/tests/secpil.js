import { makeRng, randomSeed } from '../core/rng.js';
import { fmtClock } from '../core/util.js';

const ROUNDS = 5;
const ROUND_SEC = 52;

export const LEVELS = {
  easy: { label: 'Facile', tgtAmp: 0.55, tgtFreq: [0.15, 0.45], comps: 2, ballAmp: 0.6, ballFreq: [0.12, 0.35], tol: 0.16, numEvery: 4.5, numShow: 2.2, numMax: 9, mult: false },
  normal: { label: 'Normal', tgtAmp: 0.7, tgtFreq: [0.2, 0.7], comps: 3, ballAmp: 0.75, ballFreq: [0.18, 0.55], tol: 0.13, numEvery: 3.4, numShow: 1.6, numMax: 19, mult: false },
  hard: { label: 'Difficile', tgtAmp: 0.85, tgtFreq: [0.3, 1.3], comps: 5, ballAmp: 0.85, ballFreq: [0.3, 1.0], tol: 0.11, numEvery: 2.4, numShow: 1.0, numMax: 49, mult: true },
};

/** smooth erratic signal in [-1, 1]: sum of sines with random frequencies/phases */
function signal(rng, comps, [fMin, fMax]) {
  const parts = Array.from({ length: comps }, () => ({ a: 0.4 + rng.next(), w: 2 * Math.PI * (fMin + rng.next() * (fMax - fMin)), p: rng.next() * Math.PI * 2 }));
  const norm = parts.reduce((s, c) => s + c.a, 0);
  return (t) => parts.reduce((s, c) => s + c.a * Math.sin(c.w * t + c.p), 0) / norm;
}

/**
 * Sequence of numbers to accumulate mentally during a round.
 * items: [{ at (s), text, op: 'start'|'add'|'mul', v }]
 */
export function makeSequence(rng, level, duration = ROUND_SEC) {
  const L = LEVELS[level];
  const items = [];
  let acc = rng.int(1, L.numMax);
  items.push({ at: 1, text: String(acc), op: 'start', v: acc });
  for (let at = 1 + L.numEvery; at < duration - 2; at += L.numEvery) {
    if (L.mult && Math.abs(acc) <= 40 && acc !== 0 && rng.chance(0.18)) {
      const m = rng.pick([2, 3, -1]);
      acc *= m;
      items.push({ at, text: m === -1 ? '× (−1)' : `× ${m}`, op: 'mul', v: m });
      continue;
    }
    let v = rng.int(1, L.numMax) * (rng.chance(0.45) ? -1 : 1);
    if (Math.abs(acc + v) > 150) v = -Math.sign(acc) * Math.abs(v); // keep the total reasonable
    acc += v;
    items.push({ at, text: v < 0 ? `− ${-v}` : `+ ${v}`, op: 'add', v });
  }
  return items;
}
export const evalSequence = (items) => items.reduce((a, it) => (it.op === 'start' ? it.v : it.op === 'add' ? a + it.v : a * it.v), 0);

export function run(root, { mode, onFinish, opts = {} }) {
  const rng = makeRng(randomSeed());
  const training = mode === 'training';
  const level = LEVELS[opts.level] ? opts.level : 'normal';
  const L = LEVELS[level];
  const invert = opts.axes !== 'normal';
  root.innerHTML = `
    <div class="panel" id="sp-intro">
      <h2 style="margin-top:0">SECPIL — trois tâches simultanées (${L.label})</h2>
      <ul>
        <li><b>Manche (souris)</b> : gardez la croix orange sur le <b>point vert</b> qui se déplace. ${invert ? 'Les axes sont <b>inversés</b> comme sur un manche : souris vers le haut → la croix descend, souris vers la gauche → la croix va à droite.' : 'Axes normaux.'}</li>
        <li><b>Palonnier (flèches ← →)</b> : en haut, gardez le curseur jaune sous la <b>bille rouge</b>.</li>
        <li><b>Calcul</b> : des nombres s’affichent brièvement au centre. Faites le total de tête ; il vous sera demandé à la fin de la manche.</li>
        <li>${ROUNDS} manches de ${ROUND_SEC} s. La souris est capturée pendant la manche (Échap pour la libérer).</li></ul>
      <button class="btn primary" id="sp-start" type="button">Démarrer la manche 1</button>
    </div>
    <div id="sp-game" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem">
        <b id="sp-round"></b><span id="sp-lock" class="hint"></span><b id="sp-time" class="run-timer"></b>
      </div>
      <canvas id="sp-canvas" width="720" height="560" style="background:#10161d;border-radius:10px;width:100%;max-width:720px;display:block;margin:0 auto;cursor:none;touch-action:none"></canvas>
      <div id="sp-live" class="hint" style="text-align:center;margin-top:.4rem"></div>
    </div>`;

  const cv = root.querySelector('#sp-canvas');
  const ctx = cv.getContext('2d');
  const results = [];
  let round = 0, raf = null, state = null;
  const keys = { left: false, right: false };

  const onMove = (e) => {
    if (!state || !state.running) return;
    const s = invert ? -1 : 1;
    state.cur.x = clamp(state.cur.x + s * e.movementX * 0.0045, -1, 1);
    state.cur.y = clamp(state.cur.y + s * e.movementY * 0.0045, -1, 1);
  };
  const onKey = (down) => (e) => {
    if (e.key === 'ArrowLeft') { keys.left = down; e.preventDefault(); }
    if (e.key === 'ArrowRight') { keys.right = down; e.preventDefault(); }
  };
  const kd = onKey(true), ku = onKey(false);
  const onLock = () => {
    const el = root.querySelector('#sp-lock');
    if (el) el.textContent = document.pointerLockElement === cv ? '' : 'Souris libérée — cliquez sur la zone pour reprendre le contrôle';
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('keydown', kd);
  document.addEventListener('keyup', ku);
  document.addEventListener('pointerlockchange', onLock);
  const lock = () => { try { const p = cv.requestPointerLock && cv.requestPointerLock(); if (p && p.catch) p.catch(onLock); } catch { onLock(); } };
  cv.addEventListener('click', () => state && state.running && lock());

  function startRound() {
    root.querySelector('#sp-intro').style.display = 'none';
    root.querySelector('#sp-game').style.display = '';
    lock();
    const diff = 1 + round * 0.08; // a little harder each round
    state = {
      running: true, t: 0, last: performance.now(), diff,
      cur: { x: 0, y: 0 }, rud: 0,
      tx: signal(rng, L.comps, L.tgtFreq), ty: signal(rng, L.comps, L.tgtFreq), tb: signal(rng, L.comps, L.ballFreq),
      seq: makeSequence(rng, level), inStick: 0, inRud: 0, samples: 0, errSum: 0,
    };
    root.querySelector('#sp-round').textContent = `Manche ${round + 1} / ${ROUNDS}`;
    raf = requestAnimationFrame(frame);
  }

  const target = (s) => ({ x: s.tx(s.t * s.diff) * L.tgtAmp, y: s.ty(s.t * s.diff + 17) * L.tgtAmp });
  const ball = (s) => s.tb(s.t * s.diff) * L.ballAmp;

  function frame(now) {
    if (!state || !state.running) return;
    const s = state;
    const dt = Math.min(0.05, (now - s.last) / 1000);
    s.last = now;
    s.t += dt;
    s.rud = clamp(s.rud + ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * 1.25 * dt, -1, 1);
    const tg = target(s), b = ball(s);
    const d = Math.hypot(s.cur.x - tg.x, s.cur.y - tg.y);
    s.samples += dt;
    s.errSum += d * dt;
    if (d <= L.tol) s.inStick += dt;
    if (Math.abs(s.rud - b) <= L.tol) s.inRud += dt;
    draw(tg, b);
    root.querySelector('#sp-time').textContent = fmtClock(ROUND_SEC - s.t);
    if (training) root.querySelector('#sp-live').textContent = `Sur le point : ${Math.round((100 * s.inStick) / s.samples)} % · Sous la bille : ${Math.round((100 * s.inRud) / s.samples)} %`;
    if (s.t >= ROUND_SEC) endRound();
    else raf = requestAnimationFrame(frame);
  }

  function draw(tg, b) {
    const s = state;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    // --- rudder strip (top)
    const RY = 40, RX0 = 60, RX1 = W - 60, RC = (RX0 + RX1) / 2, RR = (RX1 - RX0) / 2;
    ctx.fillStyle = '#1d2731';
    ctx.fillRect(RX0 - 14, RY - 22, RX1 - RX0 + 28, 44);
    ctx.strokeStyle = '#33414f';
    ctx.beginPath(); ctx.moveTo(RX0, RY); ctx.lineTo(RX1, RY); ctx.stroke();
    ctx.fillStyle = '#e53935';
    ctx.beginPath(); ctx.arc(RC + b * RR, RY - 6, 9, 0, Math.PI * 2); ctx.fill();
    const mx = RC + s.rud * RR;
    ctx.fillStyle = '#ffb000';
    ctx.beginPath(); ctx.moveTo(mx, RY + 4); ctx.lineTo(mx - 9, RY + 18); ctx.lineTo(mx + 9, RY + 18); ctx.fill();
    // --- tracking area
    const AX = W / 2, AY = 90 + (H - 90) / 2, AR = (H - 110) / 2;
    ctx.strokeStyle = '#26323e';
    ctx.strokeRect(AX - AR, AY - AR, 2 * AR, 2 * AR);
    ctx.beginPath(); ctx.moveTo(AX - AR, AY); ctx.lineTo(AX + AR, AY); ctx.moveTo(AX, AY - AR); ctx.lineTo(AX, AY + AR); ctx.stroke();
    const gx = AX + tg.x * AR, gy = AY + tg.y * AR;
    ctx.strokeStyle = 'rgba(62,207,142,.35)';
    ctx.beginPath(); ctx.arc(gx, gy, L.tol * AR, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#3ecf8e';
    ctx.beginPath(); ctx.arc(gx, gy, 7, 0, Math.PI * 2); ctx.fill();
    const cx = AX + s.cur.x * AR, cy = AY + s.cur.y * AR;
    ctx.strokeStyle = '#ffb000';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - 14, cy); ctx.lineTo(cx + 14, cy); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 14); ctx.stroke();
    ctx.lineWidth = 1;
    // --- current number (shown briefly)
    const cur = s.seq.filter((it) => it.at <= s.t && s.t < it.at + L.numShow).pop();
    if (cur) {
      ctx.fillStyle = 'rgba(16,22,29,.75)';
      ctx.fillRect(W - 170, 80, 150, 64);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 38px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(cur.text, W - 95, 126);
    }
  }

  function endRound() {
    const s = state;
    s.running = false;
    cancelAnimationFrame(raf);
    if (document.pointerLockElement) document.exitPointerLock();
    keys.left = keys.right = false;
    const stickPct = s.inStick / s.samples, rudPct = s.inRud / s.samples;
    const expected = evalSequence(s.seq);
    root.querySelector('#sp-game').style.display = 'none';
    const intro = root.querySelector('#sp-intro');
    intro.style.display = '';
    intro.innerHTML = `<h2 style="margin-top:0">Manche ${round + 1} terminée — résultat du calcul ?</h2>
      <p>Quel est le total de tous les nombres affichés pendant la manche ?</p>
      <form id="sp-ansForm" style="display:flex;gap:.6rem;align-items:center">
        <input id="sp-ans" inputmode="numeric" autocomplete="off" style="font-size:1.6rem;width:9rem;text-align:center;padding:.3rem;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text)">
        <button class="btn primary" type="submit">Valider</button></form>`;
    const input = intro.querySelector('#sp-ans');
    input.focus();
    intro.querySelector('#sp-ansForm').onsubmit = (e) => {
      e.preventDefault();
      const raw = input.value.trim().replace('−', '-').replace(/\s/g, '');
      if (!/^-?\d+$/.test(raw)) return;
      const given = parseInt(raw, 10);
      const ok = given === expected;
      results.push({ stickPct, rudPct, ok, given, expected, seq: s.seq.map((it) => it.text).join('  ') });
      round++;
      intro.innerHTML = `<h2 style="margin-top:0">Manche ${round} : ${ok ? '<span style="color:var(--ok)">calcul juste</span>' : '<span style="color:var(--ko)">calcul faux</span>'}</h2>
        <p>Suite : <span class="mono" style="letter-spacing:0">${s.seq.map((it) => it.text).join(' ; ')}</span> → total <b>${expected}</b> (votre réponse : ${given}).</p>
        <p>Point suivi : <b>${Math.round(stickPct * 100)} %</b> du temps · Bille suivie : <b>${Math.round(rudPct * 100)} %</b> du temps.</p>
        ${round < ROUNDS ? `<button class="btn primary" id="sp-next" type="button">Démarrer la manche ${round + 1}</button>` : '<button class="btn primary" id="sp-end" type="button">Voir le résultat final</button>'}`;
      const nb = intro.querySelector('#sp-next') || intro.querySelector('#sp-end');
      nb.onclick = round < ROUNDS ? startRound : finish;
      nb.focus();
    };
  }

  function finish() {
    const avg = (f) => results.reduce((a, r) => a + f(r), 0) / results.length;
    const stick = avg((r) => r.stickPct), rud = avg((r) => r.rudPct), calc = avg((r) => (r.ok ? 1 : 0));
    const score = Math.round(100 * (0.4 * stick + 0.3 * rud + 0.3 * calc));
    onFinish({
      score,
      duration: ROUNDS * ROUND_SEC,
      summaryHtml: `<div class="stat">Niveau : <b>${L.label}</b>${invert ? ' · axes inversés' : ''}</div>
        <div class="stat">Point suivi (manche) : <b>${Math.round(stick * 100)} %</b> du temps</div>
        <div class="stat">Bille suivie (palonnier) : <b>${Math.round(rud * 100)} %</b> du temps</div>
        <div class="stat">Calculs justes : <b>${results.filter((r) => r.ok).length} / ${results.length}</b></div>`,
      detailsHtml: `<h2 style="margin-top:0">Détail par manche</h2><table class="tbl"><tr><th>Manche</th><th>Point</th><th>Bille</th><th>Calcul</th></tr>
        ${results.map((r, i) => `<tr><td>${i + 1}</td><td>${Math.round(r.stickPct * 100)} %</td><td>${Math.round(r.rudPct * 100)} %</td><td>${r.ok ? '✓' : '✗'} ${r.given} (attendu ${r.expected})</td></tr>`).join('')}</table>
        <p class="hint">Score = 40 % manche + 30 % palonnier + 30 % calculs justes.</p>`,
    });
  }

  root.querySelector('#sp-start').onclick = startRound;
  return () => {
    if (state) state.running = false;
    cancelAnimationFrame(raf);
    if (document.pointerLockElement) document.exitPointerLock();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('keydown', kd);
    document.removeEventListener('keyup', ku);
    document.removeEventListener('pointerlockchange', onLock);
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default {
  id: 'secpil',
  section: 'eopn',
  title: 'SECPIL',
  kind: 'realtime',
  description: 'Trois tâches menées de front : tenez le manche, corrigez au palonnier et résolvez des calculs.',
  metaLabel: `${ROUNDS} manches · ${ROUND_SEC} s par manche`,
  count: ROUNDS,
  time: ROUNDS * ROUND_SEC,
  options: [
    {
      id: 'level', label: 'Difficulté', default: 'normal', choices: [
        { value: 'easy', label: '<b>Facile</b> — trajectoires lentes, nombres de 1 à 9 affichés 2 s', short: 'Facile' },
        { value: 'normal', label: '<b>Normal</b> — nombres jusqu’à 19 affichés 1,6 s' },
        { value: 'hard', label: '<b>Difficile</b> — trajectoires erratiques, nombres jusqu’à 49 affichés 1 s, multiplications (×2, ×3, ×(−1))', short: 'Difficile' },
      ],
    },
    {
      id: 'axes', label: 'Manche', default: 'inverted', choices: [
        { value: 'inverted', label: 'Axes inversés (comme un vrai manche)' },
        { value: 'normal', label: 'Axes normaux', short: 'Axes normaux' },
      ],
    },
  ],
  instructions: `<ul>
    <li><b>Manche</b> (souris) : suivez le point vert avec la croix. Axes inversés par défaut : on pousse vers l’avant pour descendre, comme en avion.</li>
    <li><b>Palonnier</b> (flèches ← →) : maintenez le curseur jaune sous la bille rouge qui se déplace en haut de l’écran.</li>
    <li><b>Calcul</b> : additionnez de tête les nombres qui apparaissent (positifs et négatifs, et multiplications en difficile). Le total est demandé à la fin de chaque manche.</li>
    <li>${ROUNDS} manches de ${ROUND_SEC} s, un peu plus rapides à chaque manche. Utilisez une souris plutôt qu’un pavé tactile.</li></ul>`,
  run,
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="14" width="56" height="36" rx="3"/><circle cx="22" cy="32" r="8"/><path d="M14 32h-4M30 32h4M22 24v-4"/><path d="M40 40h16M48 36v8"/></svg>`,
};
