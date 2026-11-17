import { TESTS, SECTIONS, getTest } from './registry.js';
import { makeRng, randomSeed } from './core/rng.js';
import { esc, fmtClock, fmtMinutes, LETTERS, stripHtml } from './core/util.js';
import * as store from './core/storage.js';
import { note20, fmtNote, weekly, globalWeekly, weekLabel, weekKey } from './core/stats.js';
import { loadCustomData, customStatus } from './core/custom.js';
import { renderFlashcards } from './flashcards.js';
import { AERONEFS } from './data/aeronefs-data.js';
import * as cloud from './core/cloud.js';

const app = document.getElementById('app');
let cleanup = null;

function route() {
  if (cleanup) {
    try { cleanup(); } catch (e) { console.error(e); }
    cleanup = null;
  }
  window.scrollTo(0, 0);
  // online version: nothing is reachable without being signed in
  if (cloud.cloudEnabled && !cloud.currentUser()) return renderLogin();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'test' && getTest(parts[1])) renderIntro(getTest(parts[1]));
  else if (parts[0] === 'stats') renderStats();
  else if (parts[0] === 'compte' && cloud.cloudEnabled) renderAccount();
  else if (parts[0] === 'flashcards') {
    document.title = 'Flashcards — Entraînement EOPN';
    cleanup = renderFlashcards(app, topbar);
  } else renderHome();
}
window.addEventListener('hashchange', route);

const SYNC_TXT = { idle: '', pending: '● modifications à envoyer', syncing: '↻ synchronisation…', ok: '✓ synchronisé', error: '⚠ hors ligne, nouvel essai bientôt' };
const topbar = () => `<header class="topbar"><a href="#/" class="brand">Tests psychotechniques — EOPN</a>
  <nav><a href="#/">Épreuves</a><a href="#/flashcards">Flashcards</a><a href="#/stats">Progression</a>
  ${cloud.cloudEnabled && cloud.currentUser() ? `<a href="#/compte" title="${esc(cloud.currentUser().name)}">${esc(cloud.currentUser().name)} <span class="sync-dot" data-state="${cloud.syncStatus.state}">${SYNC_TXT[cloud.syncStatus.state]}</span></a>` : ''}</nav></header>`;
cloud.onStatus((st) => document.querySelectorAll('.sync-dot').forEach((el) => {
  el.dataset.state = st.state;
  el.textContent = SYNC_TXT[st.state];
}));

/* ------------------------------------------------------- login / account */
function renderLogin(message = '') {
  document.title = 'Connexion — Entraînement EOPN';
  app.innerHTML = `<header class="topbar"><span class="brand">Tests psychotechniques — EOPN</span></header>
  <main class="container narrow" style="max-width:440px">
    <h1>Connexion</h1>
    <form class="panel start-form" id="loginForm">
      <label class="field-block">Identifiant<input name="name" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label class="field-block">Mot de passe<input type="password" name="password" autocomplete="current-password" required></label>
      <label style="display:block;margin:.6rem 0"><input type="checkbox" name="remember" checked> Rester connecté sur cet appareil</label>
      <p id="loginMsg" class="hint" style="color:var(--ko)">${esc(message)}</p>
      <button class="btn primary" type="submit">Se connecter</button>
    </form>
    <p class="hint">Accès réservé. Mot de passe oublié : demandez à l’administrateur du site de vous en attribuer un nouveau.</p>
  </main>`;
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('loginMsg');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    msg.style.color = 'var(--muted)';
    msg.textContent = 'Vérification…';
    try {
      await cloud.login(form.name.value, form.password.value, form.remember.checked);
      if (!location.hash || location.hash === '#') location.hash = '#/';
      route();
    } catch (err) {
      msg.style.color = 'var(--ko)';
      msg.textContent = err.message;
      btn.disabled = false;
    }
  };
}

function renderAccount() {
  document.title = 'Compte — Entraînement EOPN';
  const u = cloud.currentUser();
  const nLocal = cloud.localDataCount();
  app.innerHTML = `${topbar()}<main class="container narrow" style="max-width:560px">
    <h1>Mon compte</h1>
    <div class="panel"><div class="stat">Connecté en tant que <b>${esc(u.name)}</b></div>
      <div class="stat">Synchronisation : <span class="sync-dot" data-state="${cloud.syncStatus.state}">${SYNC_TXT[cloud.syncStatus.state] || '—'}</span>
        ${cloud.syncStatus.error ? `<br><span class="hint" style="color:var(--ko)">${esc(cloud.syncStatus.error)}</span>` : ''}</div>
      <p class="hint">Vos résultats et votre progression dans les flashcards sont enregistrés dans le dépôt privé : vous les retrouvez sur n’importe quel appareil.
        Pour changer de mot de passe, l’administrateur génère une nouvelle entrée avec la page <a href="admin.html">admin.html</a>.</p>
      <button class="btn" id="logoutBtn" type="button">Se déconnecter</button></div>
    ${nLocal ? `<div class="panel"><h2 style="margin-top:0">Résultats enregistrés sans connexion</h2>
      <p>Ce navigateur contient ${nLocal} session(s) faites sans être connecté. Voulez-vous les ajouter à votre compte ?</p>
      <button class="btn" id="importLocalBtn" type="button">Ajouter à mon compte</button> <span id="impMsg" class="hint"></span></div>` : ''}
  </main>`;
  document.getElementById('logoutBtn').onclick = async () => {
    await cloud.logout();
    location.hash = '#/';
    renderLogin();
  };
  const imp = document.getElementById('importLocalBtn');
  if (imp) imp.onclick = () => {
    const n = cloud.importLocalData();
    document.getElementById('impMsg').textContent = `${n} session(s) ajoutée(s).`;
    imp.disabled = true;
  };
}

export const metaLabel = (t) => t.metaLabel || `${t.count} questions · ${fmtMinutes(t.time)}`;

/* -------------------------------------------------------------- options */
const OPTS_KEY = 'eopn-training.options.v1';
function savedOpts(t) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem(OPTS_KEY)) || {}; } catch { /* ignore */ }
  const out = {};
  for (const o of t.options || []) {
    const v = all[t.id]?.[o.id];
    out[o.id] = o.choices.some((c) => c.value === v) ? v : o.default;
  }
  return out;
}
function storeOpts(t, opts) {
  try {
    const all = JSON.parse(localStorage.getItem(OPTS_KEY)) || {};
    all[t.id] = opts;
    localStorage.setItem(OPTS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}
const timeFactor = (t, opts) => (t.options || []).reduce((f, o) => f * (o.choices.find((c) => c.value === opts?.[o.id])?.timeFactor || 1), 1);
const optsLabel = (t, opts) => (t.options || [])
  .filter((o) => opts && opts[o.id] !== undefined && opts[o.id] !== o.default)
  .map((o) => o.choices.find((c) => c.value === opts[o.id])?.short || o.choices.find((c) => c.value === opts[o.id])?.label || '')
  .join(', ');

/* ------------------------------------------------------------------ home */
function scoreBadges(id) {
  const h = store.history(id);
  if (!h.length) return '';
  const last = h[h.length - 1];
  const best = Math.max(...h.map((e) => e.pct));
  return `<span class="badge">Dernier : ${fmtNote(last.pct)}</span><span class="badge">Meilleur : ${fmtNote(best)}</span><span class="badge">${h.length} essai${h.length > 1 ? 's' : ''}</span>`;
}

function renderHome() {
  document.title = 'Entraînement EOPN';
  const errs = customStatus.errors;
  app.innerHTML = `${topbar()}<main class="container">
    ${errs.length ? `<div class="panel" style="border-color:var(--ko)"><b style="color:var(--ko)">Erreurs dans vos fichiers personnels</b><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    ${SECTIONS.map((s) => `<section><h2 class="section-title">${esc(s.title)}</h2>
      <div class="cards">${TESTS.filter((t) => t.section === s.id).map((t) => `
        <a class="card" href="#/test/${t.id}">
          <div class="card-body">
            <h3>${esc(t.title)}</h3>
            <p class="desc">${esc(t.description)}</p>
            <p class="meta">${esc(metaLabel(t))}</p>
            <div class="scores">${scoreBadges(t.id)}</div>
          </div>
          <div class="card-icon" aria-hidden="true">${t.icon || ''}</div>
        </a>`).join('')}</div></section>`).join('')}
    <section><h2 class="section-title">Apprentissage</h2><div class="cards">
      <a class="card" href="#/flashcards"><div class="card-body"><h3>Flashcards — aéronefs</h3>
        <p class="desc">Apprenez à reconnaître les avions et hélicoptères civils et militaires les plus répandus : constructeur, pays, rôle, motorisation, signes distinctifs.</p>
        <p class="meta">${AERONEFS.length} fiches · répétition espacée</p></div>
        <div class="card-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><rect x="10" y="14" width="40" height="30" rx="3"/><rect x="16" y="20" width="40" height="30" rx="3" fill="var(--surface)"/><path d="M26 36l8-6 4 3 8-6M36 30l-6 10"/></svg></div></a>
      <a class="card" href="#/stats"><div class="card-body"><h3>Progression</h3>
        <p class="desc">Notes sur 20, historique de chaque session et évolution semaine par semaine.</p>
        <p class="meta">Sauvegarde / restauration de l’historique</p></div>
        <div class="card-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 52h48M12 44l12-12 10 8 18-22"/><circle cx="52" cy="18" r="3" fill="currentColor"/></svg></div></a>
    </div></section>
    <p class="hint" style="margin-top:2rem">Les questions sont générées aléatoirement à chaque session. Les consignes des épreuves de priorisation sont des consignes d’entraînement : appliquez celles qui vous seront données le jour J.
      ${customStatus.culture || customStatus.aeronefs ? `<br>Contenus personnels chargés : ${customStatus.culture} question(s) de culture, ${customStatus.aeronefs} fiche(s) d’aéronef.` : ''}</p>
  </main>`;
}

/* ----------------------------------------------------------------- intro */
function renderIntro(t) {
  document.title = `${t.title} — Entraînement EOPN`;
  const isQuiz = t.kind !== 'realtime';
  const h = store.history(t.id);
  const cur = savedOpts(t);
  app.innerHTML = `${topbar()}<main class="container narrow">
    <a href="#/" class="back">← Toutes les épreuves</a>
    <h1>${esc(t.title)}</h1>
    <p class="lead">${esc(t.description)}</p>
    <div class="panel instructions">${t.instructions || ''}</div>
    ${t.reference ? `<details class="panel"><summary>Aide-mémoire des consignes</summary>${t.reference}</details>` : ''}
    <form class="panel start-form" id="startForm">
      <fieldset><legend>Mode</legend>
        <label><input type="radio" name="mode" value="exam" checked> <b>Examen</b> — conditions réelles, chronométré, correction à la fin</label>
        <label><input type="radio" name="mode" value="training"> <b>Entraînement</b> — sans limite de temps, correction après chaque question</label>
      </fieldset>
      ${(t.options || []).map((o) => `<fieldset><legend>${esc(o.label)}</legend>
        ${o.choices.map((c) => `<label><input type="radio" name="opt-${o.id}" value="${esc(c.value)}" ${cur[o.id] === c.value ? 'checked' : ''}> ${c.label}</label>`).join('')}</fieldset>`).join('')}
      ${isQuiz ? `<label class="field">Nombre de questions <input type="number" name="count" min="1" max="${t.maxCount || t.count * 4}" value="${t.count}"></label>
        <p class="hint" id="durHint"></p>` : ''}
      <button class="btn primary" type="submit">Commencer</button>
    </form>
    ${h.length ? `<div class="panel"><h2 style="margin-top:0">Vos derniers résultats</h2>${historyTable(t, h.slice(-8).reverse())}
      <p><a href="#/stats" data-test="${t.id}" id="seeStats">Voir l’évolution par semaine →</a></p></div>` : ''}
  </main>`;
  const form = document.getElementById('startForm');
  const hint = document.getElementById('durHint');
  const readOpts = () => Object.fromEntries((t.options || []).map((o) => [o.id, form[`opt-${o.id}`].value]));
  const updateHint = () => {
    if (!hint) return;
    const n = clampCount(t, form.count.value);
    hint.textContent = `Durée en mode examen : ${fmtMinutes(examTime(t, n, readOpts()))} (officiel : ${metaLabel(t)}).`;
  };
  if (hint) {
    form.addEventListener('input', updateHint);
    updateHint();
  }
  const see = document.getElementById('seeStats');
  if (see) see.onclick = () => sessionStorage.setItem('eopn-stats-test', t.id);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const mode = form.mode.value;
    const opts = readOpts();
    storeOpts(t, opts);
    if (isQuiz) runQuiz(t, { mode, count: clampCount(t, form.count.value), opts });
    else runRealtime(t, { mode, opts });
  });
}

const clampCount = (t, v) => Math.max(1, Math.min(t.maxCount || t.count * 4, parseInt(v, 10) || t.count));
const examTime = (t, n, opts) => Math.max(10, Math.round(((t.time * n) / t.count) * timeFactor(t, opts)));

function historyTable(t, rows) {
  return `<table class="tbl"><tr><th>Date</th><th>Mode</th><th>Note</th><th>Score</th><th>Temps</th></tr>
    ${rows.map((r) => `<tr><td>${new Date(r.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
      <td>${r.mode === 'exam' ? 'Examen' : 'Entraînement'}${r.opts && optsLabel(t, r.opts) ? `<br><span class="hint">${esc(optsLabel(t, r.opts))}</span>` : ''}</td>
      <td><b>${fmtNote(r.pct)}</b></td>
      <td>${r.pct} %${r.kind === 'realtime' ? '' : ` (${r.score}/${r.total})`}</td>
      <td>${r.duration != null ? fmtClock(r.duration) : '—'}</td></tr>`).join('')}</table>`;
}

/* ------------------------------------------------------------ quiz runner */
function normalize(q) {
  if (!q.study && !q.parts) q.parts = [{ options: q.options, answer: q.answer, layout: q.layout, label: null }];
  return q;
}

function optionHtml(o, i, cls = '') {
  return `<button type="button" class="opt ${cls}" data-i="${i}"><span class="letter">${LETTERS[i]}</span><span class="content">${o.html}</span></button>`;
}

function questionBody(q) {
  return `${q.context ? `<div class="q-context">${q.context}</div>` : ''}
    ${q.visual ? `<div class="q-visual"><div class="paper">${q.visual}</div></div>` : ''}
    <div class="q-prompt">${q.prompt}</div>`;
}

function runQuiz(t, { mode, count, opts }) {
  const seed = randomSeed();
  let questions;
  try {
    questions = t.generate(makeRng(seed), count, opts || {}).map(normalize);
  } catch (e) {
    console.error(e);
    app.innerHTML = `${topbar()}<main class="container narrow"><div class="panel">Erreur de génération : ${esc(e.message)}</div></main>`;
    return;
  }
  const n = questions.length;
  const scored = questions.filter((q) => !q.study);
  const nScored = scored.length;
  const exam = mode === 'exam';
  const studyTime = questions.reduce((s, q) => s + (q.study || 0), 0);
  const timeLimit = exam ? examTime(t, nScored, opts) + studyTime : null;
  const answers = questions.map((q) => (q.study ? [] : q.parts.map(() => null)));
  const t0 = performance.now();
  let idx = 0;
  let revealed = false;
  let done = false;
  let studyTimer = null;

  app.innerHTML = `<div class="runner">
    <header class="run-head">
      <div class="run-title">${esc(t.title)}</div>
      <div class="run-progress" id="prog"></div>
      <div class="run-timer" id="timer"></div>
      ${t.reference ? '<button class="btn small" id="refBtn" type="button">Aide-mémoire</button>' : ''}
      <button class="btn small ghost" id="quitBtn" type="button">Quitter</button>
    </header>
    <div class="progress-bar"><div id="pbar"></div></div>
    <main class="run-main" id="qarea"></main>
    ${t.reference ? `<dialog id="refDlg"><h2 style="margin-top:0">Aide-mémoire</h2>${t.reference}<p style="text-align:right"><button class="btn" id="refClose" type="button">Fermer</button></p></dialog>` : ''}
  </div>`;
  const qarea = document.getElementById('qarea');
  const timerEl = document.getElementById('timer');
  const elapsed = () => (performance.now() - t0) / 1000;

  const tick = () => {
    const e = elapsed();
    if (exam) {
      const rem = timeLimit - e;
      timerEl.textContent = fmtClock(rem);
      timerEl.classList.toggle('low', rem <= Math.max(10, timeLimit * 0.1));
      if (rem <= 0) finish();
    } else timerEl.textContent = fmtClock(e);
  };
  const timer = setInterval(tick, 250);
  tick();

  document.getElementById('quitBtn').onclick = () => {
    if (confirm('Quitter l’épreuve ? La session ne sera pas enregistrée.')) location.hash = `#/test/${t.id}`;
  };
  if (t.reference) {
    const dlg = document.getElementById('refDlg');
    document.getElementById('refBtn').onclick = () => dlg.showModal();
    document.getElementById('refClose').onclick = () => dlg.close();
  }

  const onKey = (e) => {
    if (done || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const q = questions[idx];
    if (q.study) {
      if (e.key === 'Enter') {
        e.preventDefault();
        next();
      }
      return;
    }
    let i = -1;
    if (/^[1-9]$/.test(e.key)) i = +e.key - 1;
    else if (/^[a-hA-H]$/.test(e.key)) i = e.key.toUpperCase().charCodeAt(0) - 65;
    if (i >= 0 && !revealed) {
      let p = answers[idx].findIndex((a) => a === null);
      if (p < 0) p = q.parts.length - 1;
      if (i < q.parts[p].options.length) {
        e.preventDefault();
        choose(p, i);
      }
    } else if (e.key === 'Enter') {
      const btn = document.getElementById('primaryBtn');
      if (btn && !btn.disabled) {
        e.preventDefault();
        btn.click();
      }
    }
  };
  document.addEventListener('keydown', onKey);

  cleanup = () => {
    clearInterval(timer);
    clearInterval(studyTimer);
    document.removeEventListener('keydown', onKey);
  };

  const scoredIndex = (i) => questions.slice(0, i + 1).filter((q) => !q.study).length;

  function showStudy(q) {
    let left = q.study;
    document.getElementById('prog').textContent = 'Mémorisation';
    qarea.innerHTML = `${q.context ? `<div class="q-context">${q.context}</div>` : ''}<div class="q-prompt">${q.prompt}</div>
      <div style="text-align:center;font-size:2rem;font-weight:800" id="studyLeft">${left}</div>
      <div class="q-actions"><button class="btn primary" id="primaryBtn" type="button">J’ai mémorisé (Entrée)</button></div>`;
    document.getElementById('primaryBtn').onclick = next;
    studyTimer = setInterval(() => {
      left--;
      const el = document.getElementById('studyLeft');
      if (el) el.textContent = left;
      if (left <= 0) next();
    }, 1000);
  }

  function show() {
    clearInterval(studyTimer);
    revealed = false;
    const q = questions[idx];
    document.getElementById('pbar').style.width = `${(idx / n) * 100}%`;
    if (q.study) return showStudy(q);
    document.getElementById('prog').textContent = `Question ${scoredIndex(idx)} / ${nScored}`;
    const single = q.parts.length === 1;
    const maxOpt = Math.max(...q.parts.map((p) => p.options.length));
    qarea.innerHTML = `${questionBody(q)}
      ${q.parts.map((p, pi) => `${p.label ? `<div class="q-part-label">${p.label}</div>` : ''}
        <div class="options ${p.layout || q.layout || 'list'}" data-part="${pi}">${p.options.map((o, i) => optionHtml(o, i)).join('')}</div>`).join('')}
      <div id="fb"></div>
      <div class="q-actions" id="actions">
        ${exam ? '<button class="btn" type="button" id="skipBtn">Passer</button>' : ''}
        ${exam && single ? '' : `<button class="btn primary" type="button" id="primaryBtn" ${exam ? '' : 'disabled'}>${exam ? 'Suivant' : 'Valider'}</button>`}
      </div>
      <div class="kbd-hint">Clavier : touches 1–${maxOpt} ou A–${LETTERS[maxOpt - 1]}${exam && single ? '' : ', Entrée pour continuer'}</div>`;
    qarea.querySelectorAll('.options').forEach((box) => {
      const pi = +box.dataset.part;
      box.querySelectorAll('.opt').forEach((b) => (b.onclick = () => !revealed && choose(pi, +b.dataset.i)));
    });
    const skip = document.getElementById('skipBtn');
    if (skip) skip.onclick = next;
    const primary = document.getElementById('primaryBtn');
    if (primary) primary.onclick = () => (exam || revealed ? next() : reveal());
  }

  function choose(pi, i) {
    const q = questions[idx];
    answers[idx][pi] = i;
    const box = qarea.querySelector(`.options[data-part="${pi}"]`);
    box.querySelectorAll('.opt').forEach((b) => b.classList.toggle('selected', +b.dataset.i === i));
    const single = q.parts.length === 1;
    if (exam && single) {
      revealed = true;
      setTimeout(next, 140);
    } else if (!exam && single) {
      reveal();
    } else if (!exam) {
      document.getElementById('primaryBtn').disabled = answers[idx].some((a) => a === null);
    }
  }

  function reveal() {
    revealed = true;
    const q = questions[idx];
    q.parts.forEach((p, pi) => {
      const box = qarea.querySelector(`.options[data-part="${pi}"]`);
      box.querySelectorAll('.opt').forEach((b) => {
        const i = +b.dataset.i;
        b.disabled = true;
        if (i === p.answer) b.classList.add('correct');
        else if (i === answers[idx][pi]) b.classList.add('wrong');
      });
    });
    const ok = q.parts.every((p, pi) => answers[idx][pi] === p.answer);
    document.getElementById('fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'ko'}"><div class="verdict">${ok ? '✓ Bonne réponse' : '✗ Mauvaise réponse'}</div>${q.explanation ? `<div>${q.explanation}</div>` : ''}</div>`;
    const primary = document.getElementById('primaryBtn');
    primary.disabled = false;
    primary.textContent = idx + 1 < n ? 'Question suivante' : 'Voir les résultats';
    primary.focus();
  }

  function next() {
    if (done) return;
    idx++;
    if (idx >= n) finish();
    else show();
  }

  function finish() {
    if (done) return;
    done = true;
    cleanup();
    cleanup = null;
    const duration = Math.round(Math.min(elapsed(), timeLimit ?? Infinity));
    const qs = questions.filter((q) => !q.study);
    const ans = answers.filter((_, i) => !questions[i].study);
    const correct = qs.map((q, i) => q.parts.every((p, pi) => ans[i][pi] === p.answer));
    const blank = ans.filter((a) => a.every((x) => x === null)).length;
    const score = correct.filter(Boolean).length;
    const wrong = qs.length - score - blank;
    const pct = Math.round((100 * score) / qs.length);
    store.add(t.id, { date: Date.now(), mode, score, total: qs.length, pct, wrong, blank, duration, seed, opts });
    renderQuizResults(t, { questions: qs, answers: ans, correct, score, wrong, blank, pct, duration, mode, n: qs.length, timedOut: exam && elapsed() >= timeLimit, count, opts });
  }

  show();
}

function renderQuizResults(t, r) {
  window.scrollTo(0, 0);
  const tags = {};
  r.questions.forEach((q, i) => {
    const k = q.tag || 'Questions';
    tags[k] ||= { ok: 0, n: 0 };
    tags[k].n++;
    if (r.correct[i]) tags[k].ok++;
  });
  const tagRows = Object.entries(tags);
  const prev = store.history(t.id).slice(0, -1).filter((e) => e.mode === r.mode);
  const prevAvg = prev.length ? prev.slice(-5).reduce((a, e) => a + e.pct, 0) / Math.min(5, prev.length) : null;
  app.innerHTML = `${topbar()}<main class="container narrow">
    <a href="#/test/${t.id}" class="back">← ${esc(t.title)}</a>
    <h1>Résultats — ${esc(t.title)}</h1>
    <div class="panel score-hero">
      <div class="score-big">${String(note20(r.pct)).replace('.', ',')}<small> / 20</small></div>
      <div>
        <div class="stat">Bonnes réponses : <b>${r.score} / ${r.n}</b> (${r.pct} %)</div>
        <div class="stat">Fausses : <b>${r.wrong}</b> · Sans réponse : <b>${r.blank}</b></div>
        <div class="stat">Temps : <b>${fmtClock(r.duration)}</b>${r.timedOut ? ' — <b style="color:var(--ko)">temps écoulé</b>' : ''}</div>
        <div class="stat">Mode : <b>${r.mode === 'exam' ? 'Examen' : 'Entraînement'}</b>${optsLabel(t, r.opts) ? ` · ${esc(optsLabel(t, r.opts))}` : ''}</div>
        ${prevAvg !== null ? `<div class="stat">Moyenne de vos 5 sessions précédentes : <b>${fmtNote(prevAvg)}</b> ${r.pct >= prevAvg ? '<span style="color:var(--ok)">▲</span>' : '<span style="color:var(--ko)">▼</span>'}</div>` : ''}
      </div>
    </div>
    ${tagRows.length > 1 ? `<div class="panel"><h2 style="margin-top:0">Par type de question</h2><table class="tbl"><tr><th>Type</th><th>Réussite</th></tr>
      ${tagRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.ok} / ${v.n} (${Math.round((100 * v.ok) / v.n)} %)</td></tr>`).join('')}</table></div>` : ''}
    <p style="display:flex;gap:.6rem;flex-wrap:wrap">
      <button class="btn primary" id="againBtn" type="button">Nouvelle série</button>
      <a class="btn" href="#/">Toutes les épreuves</a>
      <a class="btn" href="#/stats" id="toStats">Progression</a>
    </p>
    <h2>Correction détaillée</h2>
    <div class="filter-bar"><button class="btn small active" data-f="ko" type="button">Erreurs (${r.n - r.score})</button><button class="btn small" data-f="all" type="button">Toutes</button></div>
    <div id="reviewList"></div>
  </main>`;
  document.getElementById('againBtn').onclick = () => runQuiz(t, { mode: r.mode, count: r.count, opts: r.opts });
  document.getElementById('toStats').onclick = () => sessionStorage.setItem('eopn-stats-test', t.id);
  const list = document.getElementById('reviewList');
  const renderList = (f) => {
    const items = r.questions.map((q, i) => ({ q, i })).filter(({ i }) => f === 'all' || !r.correct[i]);
    list.innerHTML = items.length
      ? items.map(({ q, i }) => reviewItem(q, i, r.answers[i], r.correct[i])).join('')
      : '<p class="hint">Aucune erreur — bravo !</p>';
  };
  document.querySelectorAll('.filter-bar .btn').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.filter-bar .btn').forEach((x) => x.classList.toggle('active', x === b));
      renderList(b.dataset.f);
    };
  });
  renderList('ko');
}

function reviewItem(q, i, ans, ok) {
  const sum = stripHtml(q.summary || q.prompt).slice(0, 110);
  return `<details class="review ${ok ? 'ok' : 'ko'}"><summary><b>${ok ? '✓' : '✗'} Q${i + 1}</b><span class="sum-text">${esc(sum)}</span></summary>
    <div class="review-body">${questionBody(q)}
      ${q.parts.map((p, pi) => `${p.label ? `<div class="q-part-label">${p.label}</div>` : ''}
        <div class="options ${p.layout || q.layout || 'list'}">${p.options.map((o, oi) => optionHtml(o, oi, oi === p.answer ? 'correct' : oi === ans[pi] ? 'wrong' : '')).join('')}</div>
        ${ans[pi] === null ? '<p class="hint">Sans réponse.</p>' : ''}`).join('')}
      ${q.explanation ? `<div class="feedback"><b>Explication :</b> ${q.explanation}</div>` : ''}
    </div></details>`;
}

/* -------------------------------------------------------- realtime tests */
function runRealtime(t, { mode, opts }) {
  app.innerHTML = `<div class="runner">
    <header class="run-head"><div class="run-title">${esc(t.title)}</div>
      <button class="btn small ghost" id="quitBtn" type="button">Quitter</button></header>
    <main class="rt-main" id="rt"></main></div>`;
  let stop = null;
  let finished = false;
  const onFinish = (res) => {
    if (finished) return;
    finished = true;
    if (stop) stop();
    cleanup = null;
    store.add(t.id, { kind: 'realtime', date: Date.now(), mode, score: res.score, total: 100, pct: res.score, duration: res.duration, opts });
    app.innerHTML = `${topbar()}<main class="container narrow">
      <a href="#/test/${t.id}" class="back">← ${esc(t.title)}</a>
      <h1>Résultats — ${esc(t.title)}</h1>
      <div class="panel score-hero"><div class="score-big">${String(note20(res.score)).replace('.', ',')}<small> / 20</small></div><div>${res.summaryHtml || ''}
        <div class="stat">Mode : <b>${mode === 'exam' ? 'Examen' : 'Entraînement'}</b>${optsLabel(t, opts) ? ` · ${esc(optsLabel(t, opts))}` : ''}</div></div></div>
      ${res.detailsHtml ? `<div class="panel">${res.detailsHtml}</div>` : ''}
      <p style="display:flex;gap:.6rem"><a class="btn primary" href="#/test/${t.id}">Recommencer</a><a class="btn" href="#/">Toutes les épreuves</a></p>
    </main>`;
  };
  stop = t.run(document.getElementById('rt'), { mode, onFinish, opts: opts || {} });
  cleanup = () => stop && stop();
  document.getElementById('quitBtn').onclick = () => {
    if (confirm('Quitter l’épreuve ?')) location.hash = `#/test/${t.id}`;
  };
}

/* ------------------------------------------------------------------ stats */
function lineChart(series, { height = 200 } = {}) {
  // series: [{ label, points: [{ key, avg }] }] — x axis = union of week keys
  const keys = [...new Set(series.flatMap((s) => s.points.map((p) => p.key)))].sort();
  if (!keys.length) return '<p class="hint">Pas encore de données.</p>';
  const W = 760, H = height, L = 40, R = 12, T = 12, B = 46;
  const x = (k) => (keys.length === 1 ? (L + W - R) / 2 : L + ((W - L - R) * keys.indexOf(k)) / (keys.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / 20);
  const colors = ['var(--accent)', 'var(--primary)', 'var(--ok)', 'var(--ko)'];
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Évolution des notes par semaine">`;
  for (const v of [0, 5, 10, 15, 20]) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`;
  keys.forEach((k, i) => {
    if (keys.length <= 12 || i % Math.ceil(keys.length / 12) === 0) {
      const [yy, m, d] = k.split('-');
      s += `<text x="${x(k)}" y="${H - B + 16}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${d}/${m}</text>`;
    }
  });
  s += `<text x="${(L + W) / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">semaine (lundi)</text>`;
  series.forEach((ser, si) => {
    const pts = ser.points.map((p) => [x(p.key), y(note20(p.avg))]);
    const c = colors[si % colors.length];
    if (pts.length > 1) s += `<polyline points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="2.5"/>`;
    ser.points.forEach((p, i) => (s += `<circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="4" fill="${c}"><title>${esc(ser.label)} — ${weekLabel(p.key)} : ${fmtNote(p.avg)}</title></circle>`));
  });
  return s + '</svg>';
}

function weekTable(rows) {
  if (!rows.length) return '<p class="hint">Aucune session pour cette sélection.</p>';
  const r = [...rows].reverse();
  return `<table class="tbl"><tr><th>Semaine</th><th>Sessions</th><th>Moyenne</th><th>Meilleure</th><th>Évolution</th></tr>
    ${r.map((w, i) => {
      const prev = r[i + 1];
      const d = prev ? note20(w.avg) - note20(prev.avg) : null;
      return `<tr><td>${weekLabel(w.key)}${w.key === weekKey(Date.now()) ? ' <span class="badge">en cours</span>' : ''}</td><td>${w.sessions}</td><td><b>${fmtNote(w.avg)}</b></td><td>${fmtNote(w.best)}</td>
        <td>${d === null ? '—' : `<span style="color:${d >= 0 ? 'var(--ok)' : 'var(--ko)'}">${d >= 0 ? '▲ +' : '▼ '}${d.toFixed(1).replace('.', ',')}</span>`}</td></tr>`;
    }).join('')}</table>`;
}

function renderStats() {
  document.title = 'Progression — Entraînement EOPN';
  const all = store.loadAll();
  let sel = sessionStorage.getItem('eopn-stats-test') || 'all';
  sessionStorage.removeItem('eopn-stats-test');
  let modeF = 'exam';
  const draw = () => {
    const filt = (e) => modeF === 'all' || e.mode === modeF;
    let chart, table, title;
    if (sel === 'all') {
      const g = globalWeekly(all, filt);
      title = 'Toutes les épreuves (moyenne des épreuves pratiquées dans la semaine)';
      chart = lineChart([{ label: 'Moyenne générale', points: g }]);
      table = weekTable(g);
    } else if (sel.startsWith('section:')) {
      const sid = sel.slice(8);
      const ids = TESTS.filter((t) => t.section === sid).map((t) => t.id);
      const sub = Object.fromEntries(Object.entries(all).filter(([id]) => ids.includes(id)));
      const g = globalWeekly(sub, filt);
      title = SECTIONS.find((s) => s.id === sid).title;
      chart = lineChart([{ label: title, points: g }]);
      table = weekTable(g);
    } else {
      const t = getTest(sel);
      const w = weekly((all[sel] || []).filter((e) => filt(e)));
      title = t.title;
      chart = lineChart([{ label: t.title, points: w }]);
      table = weekTable(w);
    }
    const rows = TESTS.map((t) => {
      const h = (all[t.id] || []).filter(filt);
      if (!h.length) return `<tr><td><a href="#/test/${t.id}">${esc(t.title)}</a></td><td colspan="5" class="hint">Pas encore de session</td></tr>`;
      const p = h.map((e) => e.pct);
      const thisW = h.filter((e) => weekKey(e.date) === weekKey(Date.now())).map((e) => e.pct);
      const avg = p.reduce((a, b) => a + b, 0) / p.length;
      return `<tr><td><a href="#/test/${t.id}">${esc(t.title)}</a></td><td>${h.length}</td><td>${fmtNote(p[p.length - 1])}</td><td>${fmtNote(Math.max(...p))}</td><td>${fmtNote(avg)}</td>
        <td>${thisW.length ? fmtNote(thisW.reduce((a, b) => a + b, 0) / thisW.length) : '—'}</td></tr>`;
    });
    document.getElementById('statsBody').innerHTML = `
      <div class="panel"><h2 style="margin-top:0">${esc(title)}</h2>${chart}${table}</div>
      <div class="panel" style="overflow-x:auto"><h2 style="margin-top:0">Toutes les épreuves</h2>
        <table class="tbl"><tr><th>Épreuve</th><th>Sessions</th><th>Dernière</th><th>Meilleure</th><th>Moyenne</th><th>Cette semaine</th></tr>
        ${SECTIONS.map((s) => `<tr><th colspan="6" class="section-title" style="padding-top:1rem">${esc(s.title)}</th></tr>${TESTS.map((t, i) => (t.section === s.id ? rows[i] : '')).join('')}`).join('')}</table></div>`;
  };
  app.innerHTML = `${topbar()}<main class="container narrow">
    <h1>Progression</h1>
    <div class="panel" style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center">
      <label>Épreuve <select id="selTest" class="select">
        <option value="all">Toutes les épreuves</option>
        ${SECTIONS.map((s) => `<option value="section:${s.id}">Section ${esc(s.title)}</option>`).join('')}
        ${TESTS.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join('')}
      </select></label>
      <label>Sessions <select id="selMode" class="select"><option value="exam">Examen uniquement</option><option value="training">Entraînement uniquement</option><option value="all">Toutes</option></select></label>
    </div>
    <p class="hint">Note sur 20 = pourcentage de bonnes réponses ÷ 5 (une question sans réponse compte comme fausse). Les semaines vont du lundi au dimanche ; la moyenne générale donne le même poids à chaque épreuve pratiquée.</p>
    <div id="statsBody"></div>
    <div class="panel"><h2 style="margin-top:0">Sauvegarde</h2>
      <p class="hint">${cloud.cloudEnabled ? 'L’historique est enregistré dans le dépôt privé et synchronisé automatiquement. L’export reste utile comme copie de sécurité.' : 'L’historique est stocké dans ce navigateur. Exportez-le régulièrement pour ne pas le perdre (ou pour le transférer sur un autre ordinateur).'}</p>
      <p style="display:flex;gap:.6rem;flex-wrap:wrap">
        <button class="btn" id="exportBtn" type="button">Exporter (fichier .json)</button>
        <label class="btn" style="cursor:pointer">Importer… <input type="file" id="importFile" accept="application/json,.json" hidden></label>
        <button class="btn danger" id="clearBtn" type="button">Effacer l’historique</button>
      </p><p id="ioMsg" class="hint"></p></div>
  </main>`;
  const selT = document.getElementById('selTest');
  const selM = document.getElementById('selMode');
  if (![...selT.options].some((o) => o.value === sel)) sel = 'all';
  selT.value = sel;
  selT.onchange = () => { sel = selT.value; draw(); };
  selM.onchange = () => { modeF = selM.value; draw(); };
  draw();
  document.getElementById('exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exported: new Date().toISOString(), history: store.loadAll() }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `eopn-historique-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  document.getElementById('importFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const n = store.merge(data.history || data);
      document.getElementById('ioMsg').textContent = `${n} session(s) importée(s).`;
      setTimeout(renderStats, 800);
    } catch (err) {
      document.getElementById('ioMsg').textContent = `Import impossible : ${err.message}`;
    }
  };
  document.getElementById('clearBtn').onclick = () => {
    if (confirm(cloud.cloudEnabled ? 'Effacer définitivement tout votre historique (dans votre compte, sur tous vos appareils) ? Pensez à exporter avant.' : 'Effacer définitivement tout l’historique de ce navigateur ? (Pensez à exporter avant.)')) {
      store.clearAll();
      if (cloud.cloudEnabled) cloud.forcePush().catch((e) => alert(`Effacement en ligne impossible : ${e.message}`));
      renderStats();
    }
  };
}

/* --------------------------------------------------------------- self-test */
/**
 * Renders every page and plays a 2-question training series of every test, in an isolated
 * storage space (nothing is saved to the real history nor synchronised). Returns the errors.
 */
export async function smokeTest() {
  const errors = [];
  const onErr = (ev) => errors.push(`exception : ${ev.message}`);
  window.addEventListener('error', onErr);
  const prevUser = store.currentUser();
  store.setUser('smoke-test');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = async (name, fn) => {
    const before = errors.length;
    try {
      if (cleanup) { cleanup(); cleanup = null; }
      await fn();
    } catch (e) {
      errors.push(`${name} : ${e.message}`);
    }
    for (let i = before; i < errors.length; i++) if (!errors[i].startsWith(name)) errors[i] = `${name} — ${errors[i]}`;
  };
  try {
    await step('accueil', () => { renderHome(); if (!app.querySelector('.card')) throw new Error('aucune carte d’épreuve'); });
    await step('progression', () => { renderStats(); if (!document.getElementById('statsBody')) throw new Error('page vide'); });
    await step('flashcards', () => { cleanup = renderFlashcards(app, topbar); if (!document.getElementById('fcDue')) throw new Error('page vide'); });
    for (const t of TESTS) {
      await step(`présentation ${t.id}`, () => { renderIntro(t); if (!document.getElementById('startForm')) throw new Error('formulaire absent'); });
      if (t.kind === 'realtime') {
        await step(`lancement ${t.id}`, () => { runRealtime(t, { mode: 'training', opts: savedOpts(t) }); if (!document.getElementById('rt').innerHTML) throw new Error('vide'); });
        continue;
      }
      for (const opts of [savedOpts(t), ...(t.options || []).flatMap((o) => o.choices.filter((c) => c.value !== o.default).map((c) => ({ ...savedOpts(t), [o.id]: c.value })))]) {
        await step(`épreuve ${t.id} ${JSON.stringify(opts)}`, async () => {
          runQuiz(t, { mode: 'training', count: 2, opts });
          for (let k = 0; k < 20 && !/Résultats/.test(app.querySelector('h1')?.textContent || ''); k++) {
            const primary = document.getElementById('primaryBtn');
            const boxes = [...app.querySelectorAll('.options[data-part]')];
            if (boxes.length && !app.querySelector('.feedback')) boxes.forEach((b) => b.querySelector('.opt').click());
            else if (primary) primary.click();
            const p2 = document.getElementById('primaryBtn');
            if (p2 && !p2.disabled && app.querySelector('.options[data-part]') && !app.querySelector('.feedback')) p2.click();
            await wait(5);
          }
          if (!/Résultats/.test(app.querySelector('h1')?.textContent || '')) throw new Error('la série ne se termine pas');
          if (store.history(t.id).length < 1) throw new Error('résultat non enregistré');
        });
      }
    }
  } finally {
    if (cleanup) { cleanup(); cleanup = null; }
    for (const k of Object.keys(localStorage)) if (k.endsWith(':smoke-test')) localStorage.removeItem(k);
    store.setUser(prevUser);
    window.removeEventListener('error', onErr);
    app.innerHTML = '';
  }
  return errors;
}

// start once custom content is loaded and every helper above is initialised
await loadCustomData();
if (cloud.cloudEnabled) {
  try {
    await cloud.init();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<main class="container narrow"><div class="panel">Impossible de démarrer la connexion (${esc(e.message)}). Vérifiez votre connexion Internet et js/config.js.</div></main>`;
    throw e;
  }
}
route();
