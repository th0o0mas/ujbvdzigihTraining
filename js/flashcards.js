// Flashcards des aéronefs — répétition espacée (système de Leitner, 5 boîtes).
import { AERONEFS, CATEGORIES } from './data/aeronefs-data.js';
import { esc } from './core/util.js';
import * as store from './core/storage.js';
import { SILHOUETTES } from './data/silhouettes-data.js';
import { silhouetteSvg, VIEWS } from './silhouettes.js';

// progress is stored per user via core/storage.js (document 'flashcards')
const PREFS = 'eopn-training.flashcards.prefs.v1';
export const INTERVALS = [0, 0, 1, 3, 7, 16]; // jours avant la prochaine révision, selon la boîte (1 à 5)
const DAY = 86400000;
const SESSION_SIZE = 20;

const load = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) || d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

/** Leitner update. grade: 0 = à revoir, 1 = hésitant, 2 = su */
export function review(state, grade, now = Date.now()) {
  const s = { box: 0, due: 0, ok: 0, ko: 0, ...state };
  if (grade === 0) {
    s.box = 1;
    s.ko++;
  } else if (grade === 1) {
    s.box = Math.max(1, s.box);
  } else {
    s.box = Math.min(5, s.box + 1);
    s.ok++;
  }
  s.due = now + INTERVALS[s.box] * DAY;
  return s;
}

const allCats = () => [...new Set([...CATEGORIES, ...AERONEFS.map((a) => a.cat)])];

function cardBack(c) {
  return `<dl class="fc-dl">
    <dt>Catégorie</dt><dd>${esc(c.cat)}</dd>
    <dt>Constructeur</dt><dd>${esc(c.constructeur)}</dd>
    <dt>Pays</dt><dd>${esc(c.pays)}</dd>
    <dt>Rôle</dt><dd>${esc(c.role)}</dd>
    <dt>Motorisation</dt><dd>${esc(c.motorisation)}</dd>
    <dt>Signes distinctifs</dt><dd>${esc(c.signes)}</dd>
    ${c.anecdote ? `<dt>À retenir</dt><dd>${esc(c.anecdote)}</dd>` : ''}</dl>`;
}
const silOf = (c) => SILHOUETTES[c.id];
const threeViews = (c, w = 200, h = 140) => `<div class="fc-views">${Object.keys(VIEWS).map((v) => silhouetteSvg(silOf(c), v, { w, h, label: VIEWS[v] })).join('')}</div>`;
const img = (c) => (c.image ? `<img src="${esc(c.image)}" alt="" style="max-width:100%;max-height:220px;border-radius:8px;margin:.5rem auto;display:block">` : '');

export function renderFlashcards(app, topbar) {
  const progress = store.getDoc('flashcards');
  const prefs = { dir: 'name', view: 'random', cats: allCats(), ...load(PREFS, {}) };
  // silhouette recognition is tracked separately from the « fiche » knowledge
  const pk = (c) => (prefs.dir === 'shadow' ? `sil-${c.id}` : c.id);
  let cleanup = null;

  const selected = () => AERONEFS.filter((c) => prefs.cats.includes(c.cat) && (prefs.dir !== 'shadow' || silOf(c)));
  const isDue = (c) => !progress[pk(c)] || progress[pk(c)].due <= Date.now();

  function overview() {
    if (cleanup) cleanup();
    const sel = selected();
    const boxes = [0, 1, 2, 3, 4, 5].map((b) => sel.filter((c) => (progress[pk(c)]?.box || 0) === b).length);
    const due = sel.filter(isDue).length;
    app.innerHTML = `${topbar()}<main class="container narrow">
      <a href="#/" class="back">← Accueil</a>
      <h1>Flashcards — aéronefs</h1>
      <p class="lead">${AERONEFS.length} fiches d’avions et d’hélicoptères civils et militaires. Les cartes que vous connaissez reviennent de moins en moins souvent (répétition espacée).</p>
      <div class="panel">
        <b>Catégories</b>
        <div style="display:flex;flex-wrap:wrap;gap:.3rem 1rem;margin:.4rem 0 .8rem">${allCats().map((c) => `<label><input type="checkbox" class="fc-cat" value="${esc(c)}" ${prefs.cats.includes(c) ? 'checked' : ''}> ${esc(c)} (${AERONEFS.filter((a) => a.cat === c).length})</label>`).join('')}</div>
        <b>Sens</b>
        <div style="margin:.4rem 0 .8rem">
          <label><input type="radio" name="fcdir" value="name" ${prefs.dir === 'name' ? 'checked' : ''}> Nom → fiche (que savez-vous de cet appareil ?)</label><br>
          <label><input type="radio" name="fcdir" value="desc" ${prefs.dir === 'desc' ? 'checked' : ''}> Description → nom (reconnaître l’appareil)</label><br>
          <label><input type="radio" name="fcdir" value="shadow" ${prefs.dir === 'shadow' ? 'checked' : ''}> <b>Silhouette → nom</b> (reconnaître l’appareil à son ombre ou à sa vue de face / de profil)</label>
        </div>
        ${prefs.dir === 'shadow' ? `<b>Vue montrée</b>
        <div style="margin:.4rem 0 .8rem">${[['random', 'Au hasard'], ...Object.entries(VIEWS)].map(([v, l]) => `<label style="margin-right:1rem"><input type="radio" name="fcview" value="${v}" ${prefs.view === v ? 'checked' : ''}> ${l}</label>`).join('')}
          <p class="hint">Silhouettes dessinées d’après les dimensions réelles (proportions approchées). Vue de face et vue arrière donnent la même silhouette.</p></div>` : ''}
        <table class="tbl"><tr><th>Nouvelles</th><th>Boîte 1</th><th>Boîte 2</th><th>Boîte 3</th><th>Boîte 4</th><th>Boîte 5 (acquises)</th></tr>
          <tr>${boxes.map((n) => `<td>${n}</td>`).join('')}</tr></table>
        <p style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem">
          <button class="btn primary" id="fcDue" type="button" ${due ? '' : 'disabled'}>Réviser les cartes à revoir (${Math.min(due, SESSION_SIZE)}${due > SESSION_SIZE ? ` sur ${due}` : ''})</button>
          <button class="btn" id="fcAll" type="button" ${sel.length ? '' : 'disabled'}>Session libre (${Math.min(sel.length, SESSION_SIZE)} cartes au hasard)</button>
          <button class="btn" id="fcList" type="button">Catalogue</button>
          <button class="btn ghost danger" id="fcReset" type="button">Remettre à zéro</button>
        </p>
        <p class="hint">Ajoutez vos propres fiches (et photos) dans <code>data/aeronefs-perso.json</code> — voir <code>data/LISEZMOI.md</code>.</p>
      </div></main>`;
    app.querySelectorAll('.fc-cat').forEach((cb) => (cb.onchange = () => {
      prefs.cats = [...app.querySelectorAll('.fc-cat:checked')].map((x) => x.value);
      save(PREFS, prefs);
      overview();
    }));
    app.querySelectorAll('input[name=fcdir]').forEach((r) => (r.onchange = () => {
      prefs.dir = r.value;
      save(PREFS, prefs);
      overview();
    }));
    app.querySelectorAll('input[name=fcview]').forEach((r) => (r.onchange = () => {
      prefs.view = r.value;
      save(PREFS, prefs);
    }));
    document.getElementById('fcDue').onclick = () => {
      // due cards: overdue first (lowest box), then new ones
      const d = selected().filter(isDue).sort((a, b) => (progress[pk(a)]?.box ?? 9) - (progress[pk(b)]?.box ?? 9) || Math.random() - 0.5);
      session(d.slice(0, SESSION_SIZE), true);
    };
    document.getElementById('fcAll').onclick = () => session(shuffle(selected()).slice(0, SESSION_SIZE), false);
    document.getElementById('fcList').onclick = catalog;
    document.getElementById('fcReset').onclick = () => {
      if (confirm('Effacer votre progression sur toutes les flashcards ?')) {
        for (const k of Object.keys(progress)) delete progress[k];
        store.setDoc('flashcards', progress);
        overview();
      }
    };
  }

  function session(queue, graded) {
    queue = [...queue];
    let flipped = false;
    let done = 0;
    const tally = [0, 0, 0];
    const total = queue.length;
    const show = () => {
      const c = queue[0];
      if (!c) return finish();
      flipped = false;
      const view = prefs.view === 'random' || !VIEWS[prefs.view] ? Object.keys(VIEWS)[Math.floor(Math.random() * 3)] : prefs.view;
      const front = prefs.dir === 'name'
        ? `<div class="fc-name">${esc(c.nom)}</div><div class="hint">${esc(c.cat)}</div>${img(c)}`
        : prefs.dir === 'shadow'
          ? `<div class="hint">Quel est cet aéronef ? — ${esc(VIEWS[view])}</div><div class="fc-sil">${silhouetteSvg(silOf(c), view, { w: 520, h: 300 })}</div>`
          : `<div class="hint">${esc(c.cat)} — ${esc(c.role)}</div><div class="fc-desc">« ${esc(c.signes)} »</div><div class="hint">${esc(c.motorisation)}</div>`;
      app.innerHTML = `${topbar()}<main class="container narrow">
        <div style="display:flex;justify-content:space-between;align-items:center"><a href="#/flashcards" class="back" id="fcBack">← Flashcards</a><span class="hint">${done} / ${total}</span></div>
        <div class="panel fc-card" id="fcCard" tabindex="0">
          ${front}
          <div id="fcBackSide" style="display:none"><hr>${prefs.dir !== 'name' ? `<div class="fc-name">${esc(c.nom)}</div>${prefs.dir === 'shadow' ? threeViews(c) : ''}${img(c)}` : ''}${cardBack(c)}</div>
        </div>
        <div id="fcBtns" style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap">
          <button class="btn primary" id="fcFlip" type="button">Retourner (Espace)</button>
        </div></main>`;
      document.getElementById('fcBack').onclick = (e) => {
        e.preventDefault();
        overview();
      };
      document.getElementById('fcFlip').onclick = flip;
      document.getElementById('fcCard').onclick = () => !flipped && flip();
    };
    const flip = () => {
      flipped = true;
      document.getElementById('fcBackSide').style.display = '';
      document.getElementById('fcBtns').innerHTML = `
        <button class="btn" style="border-color:var(--ko)" data-g="0" type="button">1 · À revoir</button>
        <button class="btn" style="border-color:var(--warn)" data-g="1" type="button">2 · Hésitant</button>
        <button class="btn" style="border-color:var(--ok)" data-g="2" type="button">3 · Je savais</button>`;
      document.querySelectorAll('#fcBtns [data-g]').forEach((b) => (b.onclick = () => grade(+b.dataset.g)));
    };
    const grade = (g) => {
      const c = queue.shift();
      tally[g]++;
      progress[pk(c)] = review(progress[pk(c)], g);
      store.setDoc('flashcards', progress);
      if (g === 0) queue.splice(Math.min(queue.length, 3), 0, c); // revient quelques cartes plus loin
      else done++;
      show();
    };
    const onKey = (e) => {
      if (e.key === ' ' && !flipped) {
        e.preventDefault();
        flip();
      } else if (flipped && ['1', '2', '3'].includes(e.key)) grade(+e.key - 1);
    };
    document.addEventListener('keydown', onKey);
    cleanup = () => document.removeEventListener('keydown', onKey);
    const finish = () => {
      cleanup();
      cleanup = null;
      app.innerHTML = `${topbar()}<main class="container narrow"><h1>Session terminée</h1>
        <div class="panel"><p>${total} cartes révisées : <b style="color:var(--ok)">${tally[2]} sues</b>, <b style="color:var(--warn)">${tally[1]} hésitantes</b>, <b style="color:var(--ko)">${tally[0]} à revoir</b> (les cartes « à revoir » ont été reproposées jusqu’à être sues ou jugées hésitantes).</p>
        <button class="btn primary" id="fcAgain" type="button">Retour aux flashcards</button></div></main>`;
      document.getElementById('fcAgain').onclick = overview;
    };
    show();
  }

  function catalog() {
    const cats = allCats();
    app.innerHTML = `${topbar()}<main class="container narrow">
      <a href="#/flashcards" class="back" id="fcBack">← Flashcards</a><h1>Catalogue des aéronefs</h1>
      ${cats.map((cat) => `<h2 class="section-title">${esc(cat)}</h2>${AERONEFS.filter((c) => c.cat === cat).map((c) => `
        <details class="review ok"><summary><b>${esc(c.nom)}</b><span class="sum-text">${esc(c.role)}</span></summary>
        <div class="review-body">${silOf(c) ? threeViews(c) : ''}${img(c)}${cardBack(c)}<p class="hint">Fiche : boîte ${progress[c.id]?.box || '— (nouvelle)'} · Silhouette : boîte ${progress[`sil-${c.id}`]?.box || '— (nouvelle)'}</p></div></details>`).join('')}`).join('')}
    </main>`;
    document.getElementById('fcBack').onclick = (e) => {
      e.preventDefault();
      overview();
    };
  }

  overview();
  return () => cleanup && cleanup();
}

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
