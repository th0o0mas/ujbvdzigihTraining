# Ajouter vos propres contenus

Deux fichiers sont prévus pour vous. Ils sont lus à chaque chargement du site : modifiez-les avec
n'importe quel éditeur de texte, enregistrez, puis rechargez la page (F5).

## 1. Questions de culture aéronautique — `culture-perso.json`

Ajoutez des objets dans la liste `"questions"` :

```json
{
  "questions": [
    {
      "question": "Quel est l'indicatif de la Patrouille de France ?",
      "reponse": "Athos",
      "distracteurs": ["Ramex", "Cartouche", "Rafale"],
      "explication": "Les avions de la Patrouille de France utilisent l'indicatif Athos.",
      "theme": "Armée"
    },
    {
      "question": "Deuxième question…",
      "reponse": "…",
      "distracteurs": ["…", "…", "…"]
    }
  ]
}
```

- `question`, `reponse` et exactement **3** `distracteurs` sont obligatoires ; `explication` et `theme` sont facultatifs.
- Séparez les objets par une virgule, sans virgule après le dernier.
- Vos questions apparaissent dans l'épreuve « Culture aéronautique ».

## 2. Fiches d'aéronefs — `aeronefs-perso.json`

Ajoutez des objets dans la liste `"aeronefs"` (voir l'exemple `_exemple` dans le fichier). Champs obligatoires :
`nom`, `categorie`, `constructeur`, `pays`, `role`, `motorisation`, `signes`. Facultatifs : `anecdote`, `image`.

- `categorie` : de préférence l'une de « Avion de combat », « Transport, soutien et entraînement »,
  « Hélicoptère militaire », « Avion civil », « Hélicoptère civil ».
- `signes` : les signes distinctifs, **sans écrire le nom de l'appareil** (ils servent de question « Quel aéronef est-ce ? »).
- `image` : chemin d'une photo que vous avez placée dans `data/images/` (par ex. `data/images/falcon7x.jpg`).
- Vos fiches apparaissent dans les flashcards et dans les questions de reconnaissance.

## En cas d'erreur

Si une entrée est invalide, la page d'accueil affiche un message qui indique le fichier, le numéro de
l'entrée et le problème. Les autres entrées sont quand même chargées. La page `tests.html` vérifie aussi vos ajouts.
