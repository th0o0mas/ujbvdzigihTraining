// Connexion par identifiant + mot de passe, résultats stockés dans un dépôt GitHub privé.
//
// Principe : chaque utilisateur (js/users.js) possède un jeton d'accès GitHub chiffré avec
// son mot de passe (AES-256-GCM, clé dérivée par PBKDF2-SHA-256). Le bon mot de passe
// déchiffre le jeton, qui permet de lire/écrire le fichier de résultats de l'utilisateur
// dans le dépôt privé (js/config.js). Sans le mot de passe, le jeton est inutilisable.
import { DATA_REPO, SITE_REPO } from '../config.js';
import { USERS } from '../users.js';
import * as store from './storage.js';

export const cloudEnabled = !!(DATA_REPO.owner && DATA_REPO.repo);
const SESSION_KEY = 'eopn-training.session.v1';
const DOCS = ['history', 'flashcards'];
export const ITERATIONS = 600000;

let user = null; // { name, token }
let fileSha = null;
let pushTimer = null;
let retryTimer = null;
export const syncStatus = { state: 'idle', at: null, error: '' };
const statusListeners = new Set();
export const onStatus = (fn) => (statusListeners.add(fn), () => statusListeners.delete(fn));
const setStatus = (state, error = '') => {
  Object.assign(syncStatus, { state, error, at: state === 'ok' ? new Date() : syncStatus.at });
  statusListeners.forEach((fn) => fn(syncStatus));
};

/* ------------------------------------------------------------ chiffrement */
const enc = new TextEncoder();
const dec = new TextDecoder();
export function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const b64ToBytes = (b64) => Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0));
export const utf8ToB64 = (str) => bytesToB64(enc.encode(str));
export const b64ToUtf8 = (b64) => dec.decode(b64ToBytes(b64));

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptSecret(secret, password, iterations = ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(secret)));
  return { salt: bytesToB64(salt), iv: bytesToB64(iv), data: bytesToB64(ct), iter: iterations };
}
/** returns the secret, or null when the password is wrong */
export async function decryptSecret(entry, password) {
  const key = await deriveKey(password, b64ToBytes(entry.salt), entry.iter || ITERATIONS);
  try {
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(entry.iv) }, key, b64ToBytes(entry.data)));
  } catch {
    return null;
  }
}
/**
 * User entry: the shared results key encrypted with the user's password, and — for an
 * administrator only — the admin key (write access to js/users.js) encrypted with the same password.
 */
export async function encryptEntry(password, dataToken, adminToken = null, iterations = ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, iterations);
  const seal = async (secret) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(secret)));
    return { iv: bytesToB64(iv), data: bytesToB64(ct) };
  };
  const e = { salt: bytesToB64(salt), ...(await seal(dataToken)), iter: iterations };
  if (adminToken) e.adm = await seal(adminToken);
  return e;
}
/** admin key of an entry, or null (wrong password / not an administrator) */
export async function decryptAdmin(entry, password) {
  if (!entry || !entry.adm) return null;
  return decryptSecret({ salt: entry.salt, iter: entry.iter, iv: entry.adm.iv, data: entry.adm.data }, password);
}

/* users.js is generated, never edited by hand: header + one JSON line per user */
export function usersFileText(users) {
  const names = Object.keys(users).sort();
  return `// ---------------------------------------------------------------------------
// Utilisateurs autorisés — fichier GÉNÉRÉ par la page « Admin » du site (ne pas modifier à la main).
// Chaque entrée contient la clé d’accès aux résultats CHIFFRÉE avec le mot de passe de
// l’utilisateur (AES-256-GCM, PBKDF2-SHA-256) ; « adm » (administrateur seulement) contient la clé
// d’administration chiffrée avec le même mot de passe. Sans les mots de passe, rien n’est lisible.
// ---------------------------------------------------------------------------
export const USERS = {
${names.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(users[n])},`).join('\n')}
};
`;
}
export function parseUsersFile(text) {
  const start = text.indexOf('{', text.indexOf('export const USERS'));
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('fichier des utilisateurs illisible');
  // only whole comment lines are dropped: base64 values may contain "//"
  const json = text.slice(start, end + 1).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(json);
}

export const normalizeName = (s) => String(s || '').trim().toLowerCase();
export const validName = (s) => /^[a-z0-9][a-z0-9._-]{1,31}$/.test(s);

/* --------------------------------------------------------------- GitHub API */
async function api(path, opts = {}, token = user?.token) {
  return fetch(`https://api.github.com/repos/${DATA_REPO.owner}/${DATA_REPO.repo}${path}`, {
    cache: 'no-store',
    ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
  });
}
const filePath = () => `${DATA_REPO.folder || 'utilisateurs'}/${encodeURIComponent(user.name)}.json`;
const httpMessage = (r) => (r.status === 401 ? 'jeton GitHub expiré ou révoqué' : r.status === 403 ? 'accès refusé par GitHub (droits du jeton ou limite de requêtes)' : r.status === 404 ? 'dépôt de données introuvable (vérifiez js/config.js et les droits du jeton)' : `erreur GitHub ${r.status}`);

async function readRemote() {
  const r = await api(`/contents/${filePath()}?ref=${encodeURIComponent(DATA_REPO.branch || 'main')}`);
  if (r.status === 404) {
    fileSha = null;
    return { history: {}, flashcards: {} };
  }
  if (!r.ok) throw new Error(httpMessage(r));
  const j = await r.json();
  fileSha = j.sha;
  const doc = JSON.parse(b64ToUtf8(j.content || ''));
  return { history: doc.history || {}, flashcards: doc.flashcards || {} };
}

async function writeRemote(doc) {
  const body = {
    message: `Résultats de ${user.name}`,
    content: utf8ToB64(JSON.stringify(doc)),
    branch: DATA_REPO.branch || 'main',
    ...(fileSha ? { sha: fileSha } : {}),
  };
  const r = await api(`/contents/${filePath()}`, { method: 'PUT', body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) return false; // modified elsewhere meanwhile
  if (!r.ok) throw new Error(httpMessage(r));
  fileSha = (await r.json()).content.sha;
  return true;
}

/* ------------------------------------------------------------ synchronisation */
/** flashcards: keep, for each card, the state with the most reviews (ties → most recent due date) */
const cleanCard = (s) => {
  if (!s || typeof s !== 'object') return null;
  const n = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : 0);
  return { box: Math.round(n(s.box, 5)), due: n(s.due, 1e15), ok: Math.round(n(s.ok, 1e6)), ko: Math.round(n(s.ko, 1e6)) };
};
const cleanCards = (m) => Object.fromEntries(Object.entries(m && typeof m === 'object' ? m : {}).filter(([id]) => /^[a-z0-9-]{1,80}$/.test(id)).map(([id, s]) => [id, cleanCard(s)]).filter(([, s]) => s));
export function mergeFlashcards(a = {}, b = {}) {
  const out = cleanCards(a);
  for (const [id, s] of Object.entries(cleanCards(b))) {
    const c = out[id];
    const n = (x) => (x ? (x.ok || 0) + (x.ko || 0) : -1);
    if (!c || n(s) > n(c) || (n(s) === n(c) && (s.due || 0) > (c.due || 0))) out[id] = s;
  }
  return out;
}

/** fetch the copy stored on GitHub, merge it with the local one, then write it back if needed */
async function sync(force = false) {
  // never send data that does not belong to the signed-in user (e.g. self-test sandbox)
  if (!user || store.currentUser() !== user.name) return;
  clearTimeout(retryTimer);
  setStatus('syncing');
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await readRemote();
      const history = force ? store.getDoc('history') : store.mergeHistories(store.getDoc('history'), remote.history).all;
      const flashcards = force ? store.getDoc('flashcards') : mergeFlashcards(store.getDoc('flashcards'), remote.flashcards);
      store.setDoc('history', history, { silent: true });
      store.setDoc('flashcards', flashcards, { silent: true });
      const doc = { history, flashcards };
      if (fileSha && JSON.stringify(doc) === JSON.stringify(remote)) break; // nothing new: no commit
      if (await writeRemote({ ...doc, updated: new Date().toISOString() })) break;
    }
    setStatus('ok');
  } catch (e) {
    console.error(e);
    setStatus('error', e.message || String(e));
    retryTimer = setTimeout(() => sync(), 60000);
  }
}

function schedulePush(name) {
  if (!user || !DOCS.includes(name) || store.currentUser() !== user.name) return;
  clearTimeout(pushTimer);
  setStatus('pending');
  pushTimer = setTimeout(() => sync(), 4000); // groups several changes into a single commit
}
store.onChange(schedulePush);

async function startSession(u) {
  user = u;
  store.setUser(u.name);
  await sync();
}

export const currentUser = () => user && { name: user.name };

/** restores the session saved on this device (if any); returns the user or null */
export async function init() {
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || 'null');
  } catch { /* ignore */ }
  if (saved && saved.name && saved.token && USERS[saved.name]) await startSession(saved);
  return currentUser();
}

export async function login(name, password, remember) {
  name = normalizeName(name);
  const entry = USERS[name];
  const token = entry ? await decryptSecret(entry, password) : null;
  if (!token) throw new Error('Identifiant ou mot de passe incorrect.');
  let r;
  try {
    r = await api('', {}, token);
  } catch {
    throw new Error('Impossible de joindre GitHub. Vérifiez votre connexion Internet.');
  }
  if (!r.ok) throw new Error(`Connexion impossible : ${httpMessage(r)}.`);
  const session = JSON.stringify({ name, token });
  try {
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, session);
  } catch { /* ignore */ }
  await startSession({ name, token });
  return currentUser();
}

export async function logout() {
  clearTimeout(pushTimer);
  if (syncStatus.state === 'pending') await sync();
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
  user = null;
  adminToken = null;
  fileSha = null;
  store.setUser('local');
}

/** overwrite the copy stored on GitHub with the local one (after « effacer l'historique ») */
export async function forcePush() {
  clearTimeout(pushTimer);
  await sync(true);
  if (syncStatus.state === 'error') throw new Error(syncStatus.error);
}

/** check a token against the data repository (used by admin.html) */
export async function checkToken(token) {
  const r = await api('', {}, token);
  if (!r.ok) throw new Error(httpMessage(r));
  const j = await r.json();
  if (!j.private) throw new Error('attention : le dépôt de données est PUBLIC, rendez-le privé');
  if (j.permissions && !j.permissions.push) throw new Error('le jeton n’a pas le droit d’écrire dans le dépôt (Contents : Read and write)');
  return j.full_name;
}

/* ------------------------------------------------------------ administration */
let adminToken = null; // kept in memory only, never stored
export const isAdmin = () => !!(user && USERS[user.name] && USERS[user.name].adm);
export const adminUnlocked = () => !!adminToken;
export const userList = () => Object.keys(USERS).sort().map((n) => ({ name: n, admin: !!USERS[n].adm, me: user && n === user.name }));

async function siteApi(path, opts = {}, token = adminToken) {
  return fetch(`https://api.github.com/repos/${SITE_REPO.owner}/${SITE_REPO.repo}${path}`, {
    cache: 'no-store', ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) },
  });
}
const siteMessage = (r) => (r.status === 401 ? 'clé d’administration expirée ou révoquée' : r.status === 403 || r.status === 404 ? 'la clé d’administration n’a pas le droit d’écrire dans le dépôt du site' : `erreur GitHub ${r.status}`);

/** checks that a key can write into the site repository */
export async function checkAdminToken(token) {
  const r = await siteApi('', {}, token);
  if (!r.ok) throw new Error(siteMessage(r));
  const j = await r.json();
  if (j.permissions && !j.permissions.push) throw new Error('la clé n’a que la lecture : il faut « Contents : Read and write » sur le dépôt du site');
  return j.full_name;
}

/** read users.js on GitHub, apply `change(users)`, write it back (retries if modified meanwhile) */
async function updateUsers(change, message) {
  if (!adminToken) throw new Error('administration verrouillée');
  const path = `/contents/${SITE_REPO.usersFile}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await siteApi(`${path}?ref=${encodeURIComponent(SITE_REPO.branch)}`);
    if (!r.ok) throw new Error(siteMessage(r));
    const j = await r.json();
    const users = parseUsersFile(b64ToUtf8(j.content));
    await change(users);
    const w = await siteApi(path, { method: 'PUT', body: JSON.stringify({ message, content: utf8ToB64(usersFileText(users)), sha: j.sha, branch: SITE_REPO.branch }) });
    if (w.status === 409 || w.status === 422) continue;
    if (!w.ok) throw new Error(siteMessage(w));
    for (const k of Object.keys(USERS)) delete USERS[k];
    Object.assign(USERS, users); // keep this page in sync
    return;
  }
  throw new Error('le fichier a été modifié en même temps ailleurs, réessayez');
}

/** unlock the admin key with the administrator's password */
export async function unlockAdmin(password) {
  const t = await decryptAdmin(USERS[user?.name], password);
  if (!t) throw new Error('mot de passe incorrect');
  await checkAdminToken(t);
  adminToken = t;
}
export const lockAdmin = () => { adminToken = null; };

/** first administrator: attach an admin key to the signed-in account */
export async function becomeAdmin(password, token) {
  token = String(token || '').trim();
  const mine = await decryptSecret(USERS[user?.name], password);
  if (!mine || mine !== user.token) throw new Error('mot de passe incorrect');
  await checkAdminToken(token);
  adminToken = token;
  await updateUsers(async (u) => { u[user.name] = await encryptEntry(password, user.token, token); }, `Administration activée pour ${user.name}`);
}

/** add a user, or give an existing one a new password */
export async function saveUser(name, password) {
  name = normalizeName(name);
  if (!validName(name)) throw new Error('identifiant invalide (2 à 32 caractères : a-z, 0-9, . _ -)');
  if (!password || password.length < 12) throw new Error('mot de passe trop court (12 caractères minimum)');
  const existed = !!USERS[name];
  await updateUsers(async (u) => {
    const keepAdmin = u[name] && u[name].adm ? adminToken : null; // an administrator stays administrator
    u[name] = await encryptEntry(password, user.token, keepAdmin);
  }, existed ? `Nouveau mot de passe pour ${name}` : `Ajout de l’utilisateur ${name}`);
  return existed;
}

/** remove a user (and optionally their results file) */
export async function removeUser(name, deleteResults) {
  if (name === user.name) throw new Error('vous ne pouvez pas supprimer votre propre compte');
  await updateUsers(async (u) => { delete u[name]; }, `Suppression de l’utilisateur ${name}`);
  if (deleteResults) {
    const path = `/contents/${DATA_REPO.folder || 'utilisateurs'}/${encodeURIComponent(name)}.json`;
    const r = await api(`${path}?ref=${encodeURIComponent(DATA_REPO.branch || 'main')}`);
    if (r.ok) {
      const { sha } = await r.json();
      await api(path, { method: 'DELETE', body: JSON.stringify({ message: `Résultats de ${name} supprimés`, sha, branch: DATA_REPO.branch || 'main' }) });
    }
  }
}

/** copy the results recorded without an account in this browser into the signed-in account */
export function importLocalData() {
  const prev = store.currentUser();
  store.setUser('local');
  const h = store.getDoc('history');
  const f = store.getDoc('flashcards');
  store.setUser(prev);
  const { all, added } = store.mergeHistories(store.getDoc('history'), h);
  store.setDoc('flashcards', mergeFlashcards(store.getDoc('flashcards'), f), { silent: true });
  store.setDoc('history', all);
  return added;
}

export function localDataCount() {
  const prev = store.currentUser();
  store.setUser('local');
  const n = Object.values(store.getDoc('history')).reduce((a, l) => a + l.length, 0);
  store.setUser(prev);
  return n;
}
