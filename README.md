# Entraînement EOPN — tests psychotechniques et anglais

Site local, sans abonnement ni dépendance, pour s'entraîner aux épreuves de sélection EOPN
(armée de l'Air et de l'Espace).

## Lancer le site

```bash
./start.sh
```

Puis ouvrir <http://localhost:8000>. (Python 3 suffit ; aucun paquet à installer.)

## Épreuves

| Section | Épreuve | Format officiel reproduit |
|---|---|---|
| CSO — TAMIC | Suite de cubes, Rotation, Mathématiques, Attention, Français, Codage | nombre de questions et durée des épreuves réelles |
| EOPN — Tours | Cadran, Culture aéronautique, Orientation, Priorisation Drones, Priorisation Vaisseau, SECPIL, T3A, Math 1, Math 3 | idem |
| Anglais | Anglais écrit (type TOEIC Reading) | 150 QCM en 55 min |

- Questions **générées aléatoirement** (cubes, damiers, cadrans, avions 3D, maths, codage, attention, priorisation)
  ou tirées de banques rédigées (français, culture, anglais).
- Deux modes : **Examen** (chronométré, correction à la fin) et **Entraînement** (correction immédiate expliquée).
- Niveaux de difficulté / variantes : Cadran, Orientation, Codage, SECPIL (axes inversés ou non), T3A (bruits parasites).
- Notation sur 20, page **Progression** avec évolution semaine par semaine, export / import de l'historique.
- **Flashcards** des aéronefs civils et militaires (répétition espacée) ; ces fiches alimentent aussi l'épreuve Culture.
- Vos propres questions de culture et fiches d'aéronefs : `data/culture-perso.json` et `data/aeronefs-perso.json` (mode d'emploi : `data/LISEZMOI.md`).
- Les consignes des épreuves de priorisation (Drones, Vaisseau) sont des consignes d'entraînement :
  le jour J, appliquez celles qui vous sont fournies.

## Auto-tests

<http://localhost:8000/tests.html> génère des milliers de questions et vérifie chaque réponse
de façon indépendante (re-calcul, simulation, unicité de la bonne réponse, validité des SVG,
cohérence des banques). La page doit afficher « TOUS LES TESTS PASSENT ».

## Mettre le site en ligne

Hébergement gratuit sur GitHub Pages, accès par identifiant + mot de passe, résultats enregistrés dans
un dépôt GitHub privé : suivez le guide pas à pas **[HEBERGEMENT.md](HEBERGEMENT.md)**.
Tant que `owner` est vide dans `js/config.js`, le site fonctionne en local, sans connexion.
