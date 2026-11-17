// Chargement des fichiers personnels data/culture-perso.json et data/aeronefs-perso.json.
// Les entrées valides sont ajoutées aux banques ; les erreurs sont signalées sur la page d'accueil.
import { CULTURE } from '../data/culture-data.js';
import { AERONEFS } from '../data/aeronefs-data.js';

export const FILES = { culture: 'data/culture-perso.json', aeronefs: 'data/aeronefs-perso.json' };
export const customStatus = { culture: 0, aeronefs: 0, errors: [] };

const str = (v) => typeof v === 'string' && v.trim().length > 0;
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** returns [question, answer, distractors[3], explanation, theme] or throws a readable message */
export function parseCultureEntry(e) {
  if (!e || typeof e !== 'object') throw new Error('entrée non valide');
  if (!str(e.question)) throw new Error('« question » manquante');
  if (!str(e.reponse)) throw new Error('« reponse » manquante');
  if (!Array.isArray(e.distracteurs) || e.distracteurs.length !== 3 || !e.distracteurs.every(str)) throw new Error('« distracteurs » doit contenir exactement 3 textes');
  const all = [e.reponse, ...e.distracteurs].map((s) => s.trim().toLowerCase());
  if (new Set(all).size !== 4) throw new Error('la réponse et les distracteurs doivent tous être différents');
  return [e.question.trim(), e.reponse.trim(), e.distracteurs.map((s) => s.trim()), str(e.explication) ? e.explication.trim() : '', str(e.theme) ? e.theme.trim() : 'Personnel'];
}

export function parseAeronefEntry(e) {
  if (!e || typeof e !== 'object') throw new Error('entrée non valide');
  for (const f of ['nom', 'categorie', 'constructeur', 'pays', 'role', 'motorisation', 'signes']) if (!str(e[f])) throw new Error(`champ « ${f} » manquant`);
  if (e.signes.toLowerCase().includes(e.nom.toLowerCase())) throw new Error('« signes » ne doit pas contenir le nom de l’aéronef');
  return {
    id: 'perso-' + slug(e.nom), nom: e.nom.trim(), cat: e.categorie.trim(), constructeur: e.constructeur.trim(), groupe: [e.constructeur.trim()],
    pays: e.pays.trim(), paysKeys: [e.pays.trim()], role: e.role.trim(), motorisation: e.motorisation.trim(), signes: e.signes.trim(),
    anecdote: str(e.anecdote) ? e.anecdote.trim() : '', image: str(e.image) ? e.image.trim() : '', perso: true,
  };
}

async function readJson(url) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    return null;
  }
  if (!res.ok) return null; // missing file: nothing to load
  try {
    return await res.json();
  } catch (e) {
    customStatus.errors.push(`${url} : JSON invalide (${e.message}). Vérifiez les virgules et les guillemets.`);
    return null;
  }
}

export async function loadCustomData() {
  const cul = await readJson(FILES.culture);
  if (cul) {
    const list = Array.isArray(cul.questions) ? cul.questions : [];
    const known = new Set(CULTURE.map((c) => c[0].toLowerCase()));
    list.forEach((e, i) => {
      try {
        const item = parseCultureEntry(e);
        if (known.has(item[0].toLowerCase())) throw new Error('question déjà présente');
        known.add(item[0].toLowerCase());
        CULTURE.push(item);
        customStatus.culture++;
      } catch (err) {
        customStatus.errors.push(`${FILES.culture}, question n°${i + 1} : ${err.message}`);
      }
    });
  }
  const aer = await readJson(FILES.aeronefs);
  if (aer) {
    const list = Array.isArray(aer.aeronefs) ? aer.aeronefs : [];
    const known = new Set(AERONEFS.map((a) => a.nom.toLowerCase()));
    list.forEach((e, i) => {
      try {
        const item = parseAeronefEntry(e);
        if (known.has(item.nom.toLowerCase())) throw new Error(`« ${item.nom} » existe déjà`);
        known.add(item.nom.toLowerCase());
        AERONEFS.push(item);
        customStatus.aeronefs++;
      } catch (err) {
        customStatus.errors.push(`${FILES.aeronefs}, fiche n°${i + 1} : ${err.message}`);
      }
    });
  }
  return customStatus;
}
