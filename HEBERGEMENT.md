# Mettre le site en ligne (gratuit, accès privé, plusieurs appareils)

Résultat : une adresse `https://PSEUDO.github.io/eopn-training/` qui demande un **identifiant et un
mot de passe**. Vos résultats et vos flashcards sont enregistrés dans un **dépôt GitHub privé** et vous
les retrouvez sur tous vos appareils. Tout est gratuit : un seul compte GitHub, rien d'autre.

## Comment c'est construit

| Dépôt | Visibilité | Contenu |
|---|---|---|
| `ujbvdzigihTraining` (ex. eopn-training) | **public** (obligatoire pour GitHub Pages gratuit) | le site : code, questions, et `js/users.js` (jeton **chiffré**) |
|  `ihdiDuuuAuuuTuuuA` (ex. eopn-donnees) | **privé** | vos résultats : `utilisateurs/<identifiant>.json` |

- Le site accède au dépôt privé avec un **jeton GitHub** limité à ce seul dépôt (lecture/écriture des fichiers, rien d'autre).
- Ce jeton est **chiffré avec votre mot de passe** (AES-256 + PBKDF2, 600 000 itérations) avant d'être mis dans le dépôt public.
  Sans le mot de passe, le jeton est inutilisable : personne ne peut lire ni modifier vos résultats.
- Le dépôt public ne contient aucune donnée personnelle. Les fichiers du site (questions, code) sont
  techniquement visibles par qui connaît l'adresse, ce qui est sans conséquence.
- **Choisissez un mot de passe solide** (12 caractères minimum, idéalement une phrase) : c'est lui qui protège le jeton.

---

## Étape 1 — Compte GitHub et clé SSH (déjà fait si Claude a configuré votre machine)

1. Créez un compte gratuit sur <https://github.com> et activez la **double authentification**
   (Settings → Password and authentication → Two-factor authentication).
2. Ajoutez la clé SSH de cet ordinateur : copiez le contenu de `~/.ssh/id_ed25519.pub`, puis sur GitHub :
   **Settings → SSH and GPG keys → New SSH key** → collez → **Add SSH key**.
3. Vérifiez dans un terminal :

   ```bash
   ssh -T git@github.com
   ```

   Réponse attendue : « Hi PSEUDO! You've successfully authenticated… ».

## Étape 2 — Créer les deux dépôts

Sur GitHub, **+ → New repository**, sans cocher aucune option (pas de README) :

1. `ujbvdzigihTraining` (ex. eopn-training) → **Public** → *Create repository*.
2.  `ihdiDuuuAuuuTuuuA` (ex. eopn-donnees) → **Private** → cochez cette fois **Add a README file** (le dépôt doit contenir au moins un fichier) → *Create repository*.

## Étape 3 — Envoyer le site

Dans le dossier du site :

```bash
cd "/mnt/HDD Linux/Pilot/Website_training" && git push -u origin main
```

(Le dépôt local et l'adresse `origin` sont déjà préparés. Sinon : `git remote add origin git@github.com:PSEUDO/eopn-training.git`.)

## Étape 4 — Activer GitHub Pages

Dépôt `ujbvdzigihTraining` (ex. eopn-training) → **Settings → Pages** → *Source* : **Deploy from a branch** → branche **main**, dossier **/ (root)** → **Save**.
Après 1 à 2 minutes, l'adresse `https://PSEUDO.github.io/eopn-training/` s'affiche en haut de la page.

## Étape 5 — Créer le jeton d'accès au dépôt privé

GitHub → photo de profil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token** :

- *Token name* : `eopn-site`
- *Expiration* : la durée maximale proposée (à renouveler à l'échéance, voir plus bas)
- *Repository access* : **Only select repositories** →  `ihdiDuuuAuuuTuuuA` (ex. eopn-donnees) **uniquement**
- *Permissions → Repository permissions → Contents* : **Read and write** (laissez tout le reste sur « No access »)
- **Generate token**, puis copiez le jeton (`github_pat_…`). Il ne sera plus affiché ensuite.

## Étape 6 — Relier le site et créer votre identifiant

1. Ouvrez `js/config.js` et remplissez :

   ```js
   export const DATA_REPO = {
     owner: 'PSEUDO',
     repo: 'eopn-donnees',
     branch: 'main',
     folder: 'utilisateurs',
   };
   ```

2. Lancez le site en local (`./start.sh`) et ouvrez <http://localhost:8000/admin.html>.
   Choisissez un identifiant et un mot de passe, collez le jeton, cliquez **Générer l'entrée**.
   La page vérifie le jeton puis affiche une ligne : copiez-la entre les accolades de `js/users.js`.
3. Envoyez la mise à jour :

   ```bash
   cd "/mnt/HDD Linux/Pilot/Website_training" && git add js/config.js js/users.js && git commit -m "Configuration de la connexion" && git push
   ```

4. Supprimez le jeton en clair de votre presse-papiers (copiez autre chose).

## Étape 7 — Vérifier

- Ouvrez `https://PSEUDO.github.io/eopn-training/` en navigation privée : seul l'écran de connexion apparaît.
- Connectez-vous, faites une épreuve. Dans le dépôt privé `eopn-donnees`, un fichier `utilisateurs/IDENTIFIANT.json`
  apparaît (chaque synchronisation est un commit).
- Sur votre téléphone ou un autre ordinateur : même adresse, même identifiant, mêmes résultats.
- Le lien avec votre identifiant, en haut à droite, affiche l'état de la synchronisation et permet de se déconnecter.
  Il propose aussi d'ajouter à votre compte les résultats faits avant, sans connexion, sur ce navigateur.

---

## Entretien

- **Mettre à jour le site** (nouvelles questions, etc.) :

  ```bash
  cd "/mnt/HDD Linux/Pilot/Website_training" && git add . && git commit -m "Mise à jour" && git push
  ```

  Le site en ligne se met à jour en 1 à 2 minutes (Ctrl+Maj+R pour forcer le rechargement).
- **Changer de mot de passe** : refaites l'étape 6.2 avec le même identifiant, remplacez la ligne dans `js/users.js`, envoyez.
  Les appareils restés connectés le restent ; déconnectez-les depuis le lien Compte si besoin.
- **Jeton expiré** (GitHub vous prévient par e-mail) : régénérez-le (étape 5, bouton *Regenerate token*), puis refaites l'étape 6.2.
- **Appareil perdu** : révoquez le jeton sur GitHub (Fine-grained tokens → *Delete*), créez-en un nouveau, refaites l'étape 6.2.
- **Sauvegarde** : vos résultats sont versionnés dans le dépôt privé ; la page *Progression* permet aussi un export en fichier.
- **Version locale** : tant que `owner` est vide dans `js/config.js`, le site fonctionne sans connexion, hors ligne.

---

## Ajouter des utilisateurs depuis le site (administration)

À faire une seule fois, pour vous donner le rôle d'administrateur :

1. GitHub → **Settings → Developer settings → Fine-grained tokens → Generate new token** :
   *Repository access* = **Only select repositories** → le dépôt **du site** (`ujbvdzigihTraining`) uniquement ;
   *Permissions → Contents* = **Read and write** ; rien d'autre. Copiez la clé.
2. Sur le site connecté : cliquez votre identifiant (en haut à droite) → **Devenir administrateur** →
   votre mot de passe + la clé → **Activer**. La clé est chiffrée avec votre mot de passe et enregistrée.

Ensuite, le lien **Admin** apparaît : retapez votre mot de passe pour déverrouiller, puis ajoutez un
utilisateur (identifiant + mot de passe), changez un mot de passe ou retirez un compte. Le changement est
publié automatiquement ; il est actif en quelques minutes (cache de GitHub Pages, 10 min maximum).

- Tous les comptes partagent le même dépôt privé de résultats : chacun ne voit que les siens dans le site,
  mais un utilisateur averti pourrait techniquement lire ceux des autres.
- La clé d'administration n'est jamais gardée dans le navigateur : elle est déchiffrée à chaque déverrouillage.

## Joystick pour le SECPIL

Branchez le joystick (testé pour le Thrustmaster T.16000M, tout joystick USB convient), choisissez
**Commande du manche → Joystick** avant de commencer, puis **appuyez sur un bouton du joystick** : le navigateur
ne le rend visible qu'après une action. Le palonnier reste aux flèches ← → du clavier.
