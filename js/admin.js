// Page d'administration : chiffre un jeton GitHub avec un mot de passe (tout se passe dans le navigateur).
import { encryptSecret, normalizeName, validName, checkToken, cloudEnabled } from './core/cloud.js';
import { DATA_REPO } from './config.js';
const f = document.getElementById('f');
const msg = document.getElementById('msg');
document.getElementById('repoInfo').textContent = cloudEnabled
  ? `Dépôt des résultats : ${DATA_REPO.owner}/${DATA_REPO.repo} (branche ${DATA_REPO.branch}).`
  : '⚠ js/config.js n’est pas encore rempli (owner / repo) : la vérification du jeton est impossible.';
const say = (t, ok) => { msg.textContent = t; msg.style.color = ok ? 'var(--ok)' : ok === false ? 'var(--ko)' : 'var(--muted)'; };
f.onsubmit = async (e) => {
  e.preventDefault();
  const name = normalizeName(f.name.value);
  if (!validName(name)) return say('Identifiant invalide : 2 à 32 caractères parmi a-z, 0-9, point, tiret, souligné.', false);
  if (f.pw.value !== f.pw2.value) return say('Les deux mots de passe sont différents.', false);
  if (f.pw.value.length < 12) return say('Mot de passe trop court (12 caractères minimum).', false);
  const token = f.token.value.trim();
  if (!/^(github_pat_|ghp_)/.test(token)) return say('Ce n’est pas un jeton GitHub (il doit commencer par github_pat_).', false);
  try {
    if (f.check.checked) {
      if (!cloudEnabled) return say('Remplissez d’abord js/config.js, ou décochez la vérification.', false);
      say('Vérification du jeton…');
      const repo = await checkToken(token);
      say(`Jeton valide pour ${repo}. Chiffrement…`, true);
    } else say('Chiffrement…');
    const entry = await encryptSecret(token, f.pw.value);
    document.getElementById('line').value = `  ${JSON.stringify(name)}: ${JSON.stringify(entry)},`;
    document.getElementById('out').style.display = '';
    say('Entrée générée. Le jeton en clair n’est conservé nulle part.', true);
    f.token.value = f.pw.value = f.pw2.value = '';
  } catch (err) {
    say(`Problème : ${err.message}`, false);
  }
};
document.getElementById('copy').onclick = async () => {
  const t = document.getElementById('line');
  try { await navigator.clipboard.writeText(t.value); } catch { t.select(); document.execCommand('copy'); }
  document.getElementById('copy').textContent = 'Copié ✓';
};
