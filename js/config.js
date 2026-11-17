// ---------------------------------------------------------------------------
// Configuration de la version en ligne (connexion + résultats dans un dépôt GitHub privé).
//
// Laissez « owner » vide pour utiliser le site en local, sans connexion
// (les résultats restent dans votre navigateur).
//
// Pour la version en ligne : renseignez le dépôt PRIVÉ qui contiendra les résultats,
// puis créez les utilisateurs avec la page admin.html (voir HEBERGEMENT.md).
// ---------------------------------------------------------------------------
export const DATA_REPO = {
  owner: 'th0o0mas', // votre pseudo GitHub
  repo: 'ihdiDuuuAuuuTuuuA', // dépôt PRIVÉ des résultats
  branch: 'main', // branche où écrire les résultats
  folder: 'utilisateurs', // dossier des fichiers de résultats (un fichier par utilisateur)
};
