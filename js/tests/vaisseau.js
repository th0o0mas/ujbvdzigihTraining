import { esc, retry } from '../core/util.js';

export const SYSTEMS = ['Oxygène', 'Coque', 'Propulsion', 'Énergie', 'Communications'];
export const LEVELS = ['Critique', 'Majeure', 'Mineure']; // index 0 = most severe
const LVL_CLASS = ['crit', 'maj', 'min'];
export const PHASES = {
  Croisière: ['Oxygène', 'Coque', 'Propulsion', 'Énergie', 'Communications'],
  Amarrage: ['Propulsion', 'Oxygène', 'Coque', 'Énergie', 'Communications'],
  Combat: ['Coque', 'Oxygène', 'Propulsion', 'Énergie', 'Communications'],
};

/**
 * alerts: [{ sys, level (0..2), handled: bool }]
 * Rules:
 *  1. alerts already handled are ignored;
 *  2. an active CRITICAL Énergie alert comes first, whatever the phase;
 *  3. otherwise the most severe level first;
 *  4. same level: order of systems for the current phase.
 */
export function solve(phase, alerts) {
  const active = alerts.filter((a) => !a.handled);
  if (!active.length) return null;
  const crit = active.find((a) => a.sys === 'Énergie' && a.level === 0);
  if (crit) return { sys: 'Énergie', rule: 'Énergie en alerte critique : elle passe avant tout.' };
  const best = Math.min(...active.map((a) => a.level));
  const order = PHASES[phase];
  const cands = active.filter((a) => a.level === best).sort((x, y) => order.indexOf(x.sys) - order.indexOf(y.sys));
  return {
    sys: cands[0].sys,
    rule: cands.length > 1
      ? `Plusieurs alertes de niveau ${LEVELS[best].toLowerCase()} : en phase ${phase}, l’ordre est ${order.join(' > ')}.`
      : `C’est la seule alerte active de niveau ${LEVELS[best].toLowerCase()}, le plus grave.`,
  };
}

export function genQuestion(rng) {
  return retry(() => {
    const phase = rng.pick(Object.keys(PHASES));
    const n = rng.int(3, 5);
    const systems = rng.sample(SYSTEMS, n);
    const alerts = systems.map((sys) => ({ sys, level: rng.weighted([[0, 2], [1, 3], [2, 3]]), handled: false }));
    if (rng.chance(0.35)) rng.pick(alerts).handled = true;
    const sol = solve(phase, alerts);
    if (!sol) throw new Error('none active');
    // make tie-breaks frequent: require at least two alerts in the winning level most of the time
    const active = alerts.filter((a) => !a.handled);
    const best = Math.min(...active.map((a) => a.level));
    if (active.filter((a) => a.level === best).length < 2 && rng.chance(0.6) && sol.rule.indexOf('Énergie') !== 0) throw new Error('easy');
    const answer = SYSTEMS.indexOf(sol.sys);
    const list = alerts
      .map((a) => `<div class="alert ${a.handled ? 'handled' : ''}"><span>${esc(a.sys)}${a.handled ? ' — <i>déjà prise en charge</i>' : ''}</span><span class="lvl ${LVL_CLASS[a.level]}">${LEVELS[a.level]}</span></div>`)
      .join('');
    return {
      tag: `Phase ${phase}`,
      context: `<div class="phase">Phase de vol : ${esc(phase)}</div><div class="alert-list">${list}</div>`,
      prompt: 'Quelle alerte traitez-vous en premier ?',
      summary: `${phase} — ${alerts.map((a) => `${a.sys} ${LEVELS[a.level]}${a.handled ? ' (prise en charge)' : ''}`).join(', ')}`,
      options: SYSTEMS.map((s) => ({ html: `Traiter : ${esc(s)}`, key: s })),
      answer,
      layout: 'list',
      explanation: `${alerts.some((a) => a.handled) ? 'Les alertes déjà prises en charge sont ignorées. ' : ''}${esc(sol.rule)} → <b>${esc(sol.sys)}</b>.`,
      meta: { phase, alerts },
    };
  });
}

export const REFERENCE = `<ol>
  <li>Ignorez les alertes <b>déjà prises en charge</b>.</li>
  <li>Une alerte <b>Énergie critique</b> se traite toujours en premier (tous les systèmes en dépendent).</li>
  <li>Sinon, traitez l’alerte la plus <b>grave</b> : Critique &gt; Majeure &gt; Mineure.</li>
  <li>À gravité égale, suivez l’ordre de la <b>phase de vol</b> :</li></ol>
  <table class="ref-table"><tr><th>Phase</th><th>Ordre des systèmes</th></tr>
  ${Object.entries(PHASES).map(([p, o]) => `<tr><td>${p}</td><td>${o.join(' &gt; ')}</td></tr>`).join('')}</table>`;

export default {
  id: 'vaisseau',
  section: 'eopn',
  title: 'Priorisation Vaisseau',
  description:
    'Appliquez les consignes de priorité de l’épreuve pour choisir la bonne réponse à chaque situation. Cinq réponses possibles par question. L’aide-mémoire des consignes est consultable pendant l’épreuve.',
  count: 30,
  time: 7 * 60,
  instructions: `<ul><li>Un vaisseau affiche plusieurs alertes (système + gravité) et sa phase de vol.</li>
    <li>Choisissez le système à traiter en premier en appliquant les consignes ci-dessous (cinq réponses possibles).</li>
    <li>Consignes d’entraînement : mémorisez-les pour répondre vite ; l’aide-mémoire reste accessible pendant l’épreuve.</li></ul>`,
  reference: REFERENCE,
  generate: (rng, count) => Array.from({ length: count }, () => genQuestion(rng)),
  icon: `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><circle cx="32" cy="32" r="26"/><circle cx="32" cy="32" r="18"/><path d="M32 14v10M32 40v10M14 32h10M40 32h10"/><path d="M32 32l6-10" stroke-width="3"/></svg>`,
};
