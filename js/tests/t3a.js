import { makeRng, randomSeed } from '../core/rng.js';
import { fmtClock } from '../core/util.js';

const DURATION = 90;
const LETTERS = 'BCDFGHKLMNPRSTV';
const ARROWS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

export function run(root, { mode, onFinish, opts = {} }) {
  const rng = makeRng(randomSeed());
  const training = mode === 'training';
  root.innerHTML = `
    <div class="panel" id="t3-intro">
      <h2 style="margin-top:0">T3A — attention partagée (1 min 30)</h2>
      <table class="ref-table">
        <tr><th>Zone</th><th>Consigne</th><th>Touche</th></tr>
        <tr><td>Lettres</td><td>La lettre affichée est <b>identique à la précédente</b> (chaque lettre s’efface brièvement avant la suivante)</td><td><b>F</b></td></tr>
        <tr><td>Flèches</td><td>Une flèche apparaît : indiquez sa direction</td><td><b>← ↑ → ↓</b></td></tr>
        <tr><td>Son</td><td>Un bip <b>aigu</b> retentit (ignorez les bips graves)</td><td><b>Espace</b></td></tr>
        <tr><td>Jauge</td><td>La jauge dépasse le trait rouge : remettez-la à zéro</td><td><b>R</b></td></tr>
      </table>
      <p class="hint">Activez le son. Un bip aigu puis un bip grave vont être joués pour vous les faire entendre.</p>
      <button class="btn" id="t3-demo" type="button">Écouter les deux bips</button>
      <button class="btn primary" id="t3-start" type="button">Commencer</button>
    </div>
    <div id="t3-game" style="display:none">
      <div style="display:flex;justify-content:space-between;margin-bottom:.5rem"><b>T3A</b><b id="t3-time" class="run-timer"></b></div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem">
        <div class="panel t3-zone" id="z-letter" style="text-align:center;margin:0"><div class="hint">Lettres — F si identique à la précédente</div><div id="t3-letter" style="font-size:4rem;font-weight:800;height:5rem"></div></div>
        <div class="panel t3-zone" id="z-arrow" style="text-align:center;margin:0"><div class="hint">Flèches — touche fléchée correspondante</div><div id="t3-arrow" style="font-size:4rem;font-weight:800;height:5rem"></div></div>
        <div class="panel t3-zone" id="z-sound" style="text-align:center;margin:0"><div class="hint">Son — Espace sur bip aigu</div><div id="t3-sound" style="font-size:3rem;height:5rem">🔈</div></div>
        <div class="panel t3-zone" id="z-gauge" style="margin:0"><div class="hint" style="text-align:center">Jauge — R au-dessus du trait rouge</div>
          <div style="position:relative;height:5rem;width:60px;margin:0 auto;border:2px solid var(--border);border-radius:6px;overflow:hidden">
            <div id="t3-fill" style="position:absolute;bottom:0;left:0;right:0;background:var(--primary);height:0"></div>
            <div style="position:absolute;left:0;right:0;bottom:80%;border-top:3px solid var(--ko)"></div>
          </div></div>
      </div>
      <div id="t3-live" class="hint" style="margin-top:.6rem"></div>
    </div>`;

  let audio = null;
  const beep = (high) => {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = high ? 1400 : 420;
      g.gain.setValueAtTime(0.0001, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.28);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.3);
    } catch {
      /* audio unavailable */
    }
  };
  root.querySelector('#t3-demo').onclick = () => {
    beep(true);
    setTimeout(() => beep(false), 700);
  };

  const stats = {
    letter: { targets: 0, hits: 0, fa: 0, rt: [] },
    arrow: { targets: 0, hits: 0, wrong: 0, rt: [] },
    sound: { targets: 0, hits: 0, fa: 0, rt: [] },
    gauge: { targets: 0, hits: 0, fa: 0, rt: [] },
  };
  const timers = [];
  let t0 = 0;
  let running = false;
  let raf = null;
  const now = () => (performance.now() - t0) / 1000;
  const later = (sec, fn) => timers.push(setTimeout(() => running && fn(), sec * 1000));
  const flash = (zone, ok) => {
    if (!training) return;
    const el = root.querySelector(zone);
    el.style.borderColor = ok ? 'var(--ok)' : 'var(--ko)';
    setTimeout(() => (el.style.borderColor = ''), 250);
  };

  // --- letters (1-back)
  const letter = { cur: null, prev: null, isTarget: false, answered: false, shownAt: 0 };
  function nextLetter() {
    if (letter.isTarget && !letter.answered) flash('#z-letter', false);
    // the letter disappears briefly, so that a repeated letter is visibly a NEW letter
    letter.isTarget = false;
    root.querySelector('#t3-letter').textContent = '';
    later(0.35, () => {
      const target = letter.cur !== null && rng.chance(0.3);
      letter.prev = letter.cur;
      letter.cur = target ? letter.cur : rng.pick([...LETTERS].filter((c) => c !== letter.cur));
      letter.isTarget = target;
      letter.answered = false;
      letter.shownAt = now();
      if (target) stats.letter.targets++;
      root.querySelector('#t3-letter').textContent = letter.cur;
      later(1.35, nextLetter);
    });
  }

  // --- optional parasitic noise (background hiss + random distracting sounds to ignore)
  const noiseOn = opts.noise === 'on';
  let noiseNodes = [];
  function startNoise() {
    if (!noiseOn) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const buf = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = audio.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = audio.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g = audio.createGain();
      g.gain.value = 0.06;
      src.connect(lp).connect(g).connect(audio.destination);
      src.start();
      noiseNodes.push(src);
      parasite.buf = buf;
    } catch { /* audio unavailable */ }
    later(1 + rng.next() * 2, parasite);
  }
  function parasite() {
    try {
      const t = audio.currentTime;
      const kind = rng.pick(['burst', 'chirp', 'buzz', 'clicks']);
      const g = audio.createGain();
      g.connect(audio.destination);
      if (kind === 'burst') {
        const s = audio.createBufferSource();
        s.buffer = parasite.buf;
        const bp = audio.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2500;
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        s.connect(bp).connect(g);
        s.start(t, rng.next());
        s.stop(t + 0.3);
      } else if (kind === 'chirp') {
        const o = audio.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(rng.pick([300, 500]), t);
        o.frequency.linearRampToValueAtTime(rng.pick([800, 950]), t + 0.25);
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g);
        o.start(t);
        o.stop(t + 0.32);
      } else if (kind === 'buzz') {
        const o = audio.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 160 + rng.int(0, 60);
        g.gain.setValueAtTime(0.05, t);
        g.gain.linearRampToValueAtTime(0.0001, t + 0.45);
        o.connect(g);
        o.start(t);
        o.stop(t + 0.46);
      } else {
        for (let k = 0; k < 3; k++) {
          const o = audio.createOscillator();
          o.frequency.value = 2600;
          const gk = audio.createGain();
          gk.gain.setValueAtTime(0.08, t + k * 0.09);
          gk.gain.exponentialRampToValueAtTime(0.001, t + k * 0.09 + 0.03);
          o.connect(gk).connect(audio.destination);
          o.start(t + k * 0.09);
          o.stop(t + k * 0.09 + 0.04);
        }
      }
    } catch { /* ignore */ }
    later(0.9 + rng.next() * 2.6, parasite);
  }
  // --- arrows
  const arrow = { key: null, shownAt: 0 };
  function showArrow() {
    const key = rng.pick(Object.keys(ARROWS));
    arrow.key = key;
    arrow.shownAt = now();
    stats.arrow.targets++;
    root.querySelector('#t3-arrow').textContent = ARROWS[key];
    later(2, () => {
      if (arrow.key) {
        flash('#z-arrow', false);
        arrow.key = null;
        root.querySelector('#t3-arrow').textContent = '';
      }
      later(1 + rng.next() * 2.5, showArrow);
    });
  }
  // --- sounds
  const sound = { high: false, open: false, at: 0 };
  function playSound() {
    const high = rng.chance(0.4);
    sound.high = high;
    sound.open = true;
    sound.at = now();
    if (high) stats.sound.targets++;
    beep(high);
    root.querySelector('#t3-sound').textContent = '🔊';
    later(1.5, () => {
      if (sound.open && sound.high) flash('#z-sound', false);
      sound.open = false;
      root.querySelector('#t3-sound').textContent = '🔈';
      later(1 + rng.next() * 2.5, playSound);
    });
  }
  // --- gauge
  const gauge = { level: 0, rate: 0.08, over: false, overAt: 0 };
  let lastFrame = 0;
  function frame() {
    if (!running) return;
    const t = now();
    const dt = Math.min(0.1, t - lastFrame);
    lastFrame = t;
    gauge.level += gauge.rate * dt;
    if (gauge.level >= 0.8 && !gauge.over) {
      gauge.over = true;
      gauge.overAt = t;
      stats.gauge.targets++;
    }
    if (gauge.level >= 1) {
      flash('#z-gauge', false);
      resetGauge();
    }
    root.querySelector('#t3-fill').style.height = `${Math.min(100, gauge.level * 100)}%`;
    root.querySelector('#t3-fill').style.background = gauge.over ? 'var(--ko)' : 'var(--primary)';
    root.querySelector('#t3-time').textContent = fmtClock(DURATION - t);
    if (training) root.querySelector('#t3-live').textContent = `Lettres ${stats.letter.hits}/${stats.letter.targets} · Flèches ${stats.arrow.hits}/${stats.arrow.targets} · Sons ${stats.sound.hits}/${stats.sound.targets} · Jauge ${stats.gauge.hits}/${stats.gauge.targets}`;
    if (t >= DURATION) return finish();
    raf = requestAnimationFrame(frame);
  }
  function resetGauge() {
    gauge.level = 0;
    gauge.over = false;
    gauge.rate = 0.06 + rng.next() * 0.1;
  }

  const onKey = (e) => {
    if (!running || e.repeat) return;
    const t = now();
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      if (letter.isTarget && !letter.answered) {
        letter.answered = true;
        stats.letter.hits++;
        stats.letter.rt.push(t - letter.shownAt);
        flash('#z-letter', true);
      } else {
        stats.letter.fa++;
        flash('#z-letter', false);
      }
    } else if (ARROWS[e.key]) {
      e.preventDefault();
      if (!arrow.key) return;
      if (e.key === arrow.key) {
        stats.arrow.hits++;
        stats.arrow.rt.push(t - arrow.shownAt);
        flash('#z-arrow', true);
      } else {
        stats.arrow.wrong++;
        flash('#z-arrow', false);
      }
      arrow.key = null;
      root.querySelector('#t3-arrow').textContent = '';
    } else if (e.key === ' ') {
      e.preventDefault();
      if (sound.open && sound.high) {
        stats.sound.hits++;
        stats.sound.rt.push(t - sound.at);
        sound.open = false;
        flash('#z-sound', true);
      } else {
        stats.sound.fa++;
        flash('#z-sound', false);
      }
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      if (gauge.over) {
        stats.gauge.hits++;
        stats.gauge.rt.push(t - gauge.overAt);
        flash('#z-gauge', true);
        resetGauge();
      } else {
        stats.gauge.fa++;
        flash('#z-gauge', false);
      }
    }
  };
  document.addEventListener('keydown', onKey);

  function start() {
    root.querySelector('#t3-intro').style.display = 'none';
    root.querySelector('#t3-game').style.display = '';
    beep(false); // unlock audio inside the click gesture
    running = true;
    t0 = performance.now();
    lastFrame = 0;
    resetGauge();
    nextLetter();
    startNoise();
    later(1.2, showArrow);
    later(2, playSound);
    raf = requestAnimationFrame(frame);
  }
  root.querySelector('#t3-start').onclick = start;

  function finish() {
    running = false;
    timers.forEach(clearTimeout);
    noiseNodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } });
    cancelAnimationFrame(raf);
    const rows = [
      ['Lettres (F)', stats.letter, stats.letter.fa],
      ['Flèches', stats.arrow, stats.arrow.wrong],
      ['Son aigu (Espace)', stats.sound, stats.sound.fa],
      ['Jauge (R)', stats.gauge, stats.gauge.fa],
    ];
    const totalTargets = rows.reduce((a, [, s]) => a + s.targets, 0);
    const totalHits = rows.reduce((a, [, s]) => a + s.hits, 0);
    const totalErr = rows.reduce((a, [, , e]) => a + e, 0);
    const score = totalTargets ? Math.max(0, Math.round((100 * (totalHits - 0.5 * totalErr)) / totalTargets)) : 0;
    const mean = (a) => (a.length ? `${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2).replace('.', ',')} s` : '—');
    onFinish({
      score: Math.min(100, score),
      duration: DURATION,
      summaryHtml: `<div class="stat">Détections : <b>${totalHits} / ${totalTargets}</b></div><div class="stat">Erreurs / fausses alertes : <b>${totalErr}</b></div>`,
      detailsHtml: `<table class="tbl"><tr><th>Tâche</th><th>Réussies</th><th>Erreurs</th><th>Temps de réaction moyen</th></tr>
        ${rows.map(([n, s, e]) => `<tr><td>${n}</td><td>${s.hits} / ${s.targets}</td><td>${e}</td><td>${mean(s.rt)}</td></tr>`).join('')}</table>
        <p class="hint">Score = (réussites − 0,5 × erreurs) / nombre de cibles.</p>`,
    });
  }

  return () => {
    running = false;
    timers.forEach(clearTimeout);
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    if (audio) audio.close().catch(() => {});
  };
}

export default {
  id: 't3a',
  section: 'eopn',
  title: 'T3A',
  kind: 'realtime',
  description: 'Le T3A mesure votre attention quand plusieurs tâches se disputent en même temps.',
  metaLabel: '1 séquence · 1 min 30',
  options: [
    {
      id: 'noise', label: 'Bruits parasites', default: 'off', choices: [
        { value: 'off', label: 'Désactivés' },
        { value: 'on', label: 'Activés — souffle de fond et sons parasites à ignorer (grésillements, bips, bourdonnements)', short: 'Avec parasites' },
      ],
    },
  ],
  count: 1,
  time: DURATION,
  instructions: `<ul>
    <li>Quatre tâches à surveiller en même temps pendant 1 min 30 : lettres, flèches, sons et jauge.</li>
    <li>Réagissez vite mais sans précipitation : les fausses alertes sont pénalisées.</li>
    <li>Son nécessaire (casque conseillé). Gardez les doigts sur F, Espace, R et les flèches.</li></ul>`,
  run,
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="56" height="56" rx="3"/><rect x="9" y="9" width="12" height="12"/><text x="11" y="19" font-size="10" fill="currentColor" stroke="none" font-family="sans-serif">A</text><path d="M38 22l12-12M44 10h6v6"/><path d="M10 40h5l6-5v16l-6-5h-5z"/><rect x="40" y="40" width="14" height="14" fill="currentColor" opacity=".4"/></svg>`,
};
