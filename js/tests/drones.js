import { esc, retry } from '../core/util.js';

export const MESSAGES = [
  'Descendez de 500 ft immédiatement',
  'Montez de 500 ft immédiatement',
  'Faites demi-tour, quittez la zone',
  'Rentrez à la base',
  'Rapprochez-vous de la base',
  'Poursuivez la mission',
];
export const ALERTS = { none: 'Aucune', traffic: 'Trafic proche', intrusion: 'Zone interdite', link: 'Liaison dégradée' };

/** priority level of one drone (1 = most urgent, 5 = nothing to report) and the matching message */
export function droneStatus(d) {
  if (d.alert === 'traffic') return { level: 1, msg: d.alt >= 1500 ? 0 : 1, why: `trafic proche à ${d.alt} ft (${d.alt >= 1500 ? '≥' : '<'} 1 500 ft)` };
  if (d.alert === 'intrusion') return { level: 2, msg: 2, why: 'intrusion en zone interdite' };
  if (d.batt < 2 * d.dist) return { level: 3, msg: 3, why: `autonomie critique : ${d.batt} % < 2 × ${d.dist} km = ${2 * d.dist}` };
  if (d.alert === 'link') return { level: 4, msg: 4, why: 'liaison dégradée' };
  return { level: 5, msg: 5, why: 'aucune anomalie' };
}

/** index of the priority drone among `drones` (ties: lowest altitude; if nothing to report: lowest battery) */
export function solve(drones) {
  const st = drones.map(droneStatus);
  const best = Math.min(...st.map((s) => s.level));
  const idx = drones.map((_, i) => i).filter((i) => st[i].level === best);
  let pick;
  if (best === 5) pick = idx.reduce((a, b) => (drones[b].batt < drones[a].batt ? b : a));
  else pick = idx.reduce((a, b) => (drones[b].alt < drones[a].alt ? b : a));
  return { index: pick, msg: st[pick].msg, status: st, level: best, tied: idx.length };
}

function randomDrone(rng, wantLevel) {
  for (let t = 0; t < 200; t++) {
    const d = {
      batt: rng.int(8, 98),
      dist: rng.int(2, 40),
      alt: 100 * rng.int(3, 30),
      alert: rng.weighted([['none', 4], ['traffic', 1.2], ['intrusion', 1.2], ['link', 1.5]]),
    };
    if (d.batt === 2 * d.dist || Math.abs(d.batt - 2 * d.dist) < 3) continue; // avoid borderline readings
    if (d.alt === 1500) continue;
    if (wantLevel === undefined || droneStatus(d).level >= wantLevel) return d;
  }
  throw new Error('drone');
}

export function genQuestion(rng) {
  return retry(() => {
    const target = rng.weighted([[1, 3], [2, 3], [3, 3], [4, 2], [5, 1]]);
    const drones = [0, 1, 2, 3].map(() => randomDrone(rng, target));
    if (!drones.some((d) => droneStatus(d).level === target)) throw new Error('level');
    if (new Set(drones.map((d) => d.alt)).size < 4 || new Set(drones.map((d) => d.batt)).size < 4) throw new Error('dup');
    const sol = solve(drones);
    const names = ['A', 'B', 'C', 'D'];
    const card = (d, i) => `<div class="drone"><h4>Drone ${names[i]}</h4><dl>
      <dt>Batterie</dt><dd>${d.batt} %</dd><dt>Distance base</dt><dd>${d.dist} km</dd>
      <dt>Altitude</dt><dd>${d.alt} ft</dd><dt>Alerte</dt><dd>${esc(ALERTS[d.alert])}</dd></dl></div>`;
    const steps = drones.map((d, i) => `Drone ${names[i]} : niveau ${sol.status[i].level} (${sol.status[i].why})`).join('<br>');
    return {
      tag: `Priorité niveau ${sol.level}`,
      context: `<div class="drone-grid">${drones.map(card).join('')}</div>`,
      prompt: 'Quel drone est prioritaire, et quel message radio lui adressez-vous ?',
      summary: `Drones : ${drones.map((d, i) => `${names[i]} ${ALERTS[d.alert]}`).join(', ')}`,
      parts: [
        { label: 'Drone prioritaire', options: names.map((n) => ({ html: `Drone ${n}`, key: n })), answer: sol.index, layout: 'inline' },
        { label: 'Message radio', options: MESSAGES.map((m, i) => ({ html: esc(m), key: String(i) })), answer: sol.msg, layout: 'list' },
      ],
      explanation: `${steps}<br>→ Niveau le plus urgent : ${sol.level}${sol.tied > 1 ? (sol.level === 5 ? ' (égalité : batterie la plus faible)' : ' (égalité : drone le plus bas)') : ''}. <b>Drone ${names[sol.index]}</b> — « ${esc(MESSAGES[sol.msg])} ».`,
      meta: { drones },
    };
  });
}

export const REFERENCE = `<table class="ref-table">
  <tr><th>Ordre</th><th>Situation</th><th>Message radio</th></tr>
  <tr><td>1</td><td><b>Trafic proche</b></td><td>Altitude ≥ 1 500 ft : « Descendez de 500 ft immédiatement »<br>Altitude &lt; 1 500 ft : « Montez de 500 ft immédiatement »</td></tr>
  <tr><td>2</td><td><b>Zone interdite</b> (intrusion)</td><td>« Faites demi-tour, quittez la zone »</td></tr>
  <tr><td>3</td><td><b>Autonomie critique</b> : batterie (%) inférieure au double de la distance à la base (km)</td><td>« Rentrez à la base »</td></tr>
  <tr><td>4</td><td><b>Liaison dégradée</b></td><td>« Rapprochez-vous de la base »</td></tr>
  <tr><td>5</td><td>Aucune des situations ci-dessus</td><td>« Poursuivez la mission »</td></tr>
  </table>
  <ul><li>Un drone est classé selon sa situation <b>la plus urgente</b> (un drone en zone interdite avec une batterie critique est au niveau 2).</li>
  <li>Égalité de niveau : le drone le plus <b>bas</b> en altitude est prioritaire.</li>
  <li>Si aucun drone n’a de problème : le prioritaire est celui qui a la <b>batterie la plus faible</b>, message « Poursuivez la mission ».</li></ul>`;

export default {
  id: 'drones',
  section: 'eopn',
  title: 'Priorisation Drones',
  description: 'Comparez quatre situations de drones : désignez la prioritaire et le message radio adapté.',
  count: 18,
  time: 5 * 60,
  instructions: `<ul><li>Quatre drones sont décrits (batterie, distance à la base, altitude, alerte).</li>
    <li>Appliquez les consignes pour désigner le drone prioritaire <b>et</b> le message radio à lui transmettre. La réponse n’est juste que si les deux le sont.</li>
    <li>Les consignes ci-dessous sont des consignes d’entraînement : apprenez-les avant de commencer, elles restent consultables via le bouton « Aide-mémoire ».</li></ul>`,
  reference: REFERENCE,
  generate: (rng, count) => Array.from({ length: count }, () => genQuestion(rng)),
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><circle cx="14" cy="14" r="9"/><circle cx="50" cy="14" r="9"/><circle cx="14" cy="50" r="9"/><circle cx="50" cy="50" r="9"/><path d="M20 20l24 24M44 20 20 44"/><rect x="27" y="27" width="10" height="10" fill="currentColor"/></svg>`,
};
