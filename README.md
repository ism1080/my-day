# MY DAY

Petite app personnelle de routine quotidienne. Une seule idée : **agir même sans envie**.

- 5 prières comme ancres de la journée
- 3 missions (travail / skill / corps) avec 3 paliers : 10 min, 30 min, 60 min+
- un bouton **JE N'AI PAS ENVIE** → timer de 10 minutes → +10 XP
- XP jamais retirés, série (streak) qui peut se couper, niveau, jours réussis

Aucun serveur, aucun compte : c'est une page web (PWA) qui garde ses données dans le navigateur du téléphone.

## Lancer sur le PC

Dans ce dossier :

```bash
python -m http.server 8765
```

Puis ouvrir http://localhost:8765 dans le navigateur.
(Double-cliquer sur `index.html` marche aussi, mais sans le mode hors-ligne.)

## Installer sur le téléphone (Android)

L'app est en ligne ici : **https://ism1080.github.io/my-day/**
Dans Chrome sur le téléphone : ouvrir l'adresse → menu ⋮ → **« Ajouter à l'écran d'accueil »** / **« Installer l'application »**.
Elle s'ouvre alors comme une vraie app, plein écran, et marche sans réseau.

## Modifier les horaires de prière

Dans l'app : onglet **Réglages** → *Horaires de prière*. C'est tout.
Les valeurs par défaut (utilisées la toute première fois) sont dans `app.js`, bloc `DEFAULT_SETTINGS`.

## Modifier les tâches

Dans l'app : onglet **Réglages** → *Tâches* (renommer, changer la catégorie, Mission ↔ Check, supprimer, ajouter).
Les tâches par défaut sont aussi dans `app.js`, bloc `DEFAULT_SETTINGS.tasks`.

## Passer les données d'un appareil à l'autre

Réglages → *Sauvegarde* → **Copier mes données**, puis coller et **Importer** sur l'autre appareil.

## Mettre à jour l'app après une modification des fichiers

Changer le numéro de version (`?v=2` → `?v=3`) dans `index.html` et dans `sw.js` (`CACHE` et `FILES`), sinon le téléphone peut garder l'ancienne version en cache.
Puis publier :

```bash
git add -A && git commit -m "maj" && git push
```

Le site se met à jour tout seul en 1 à 2 minutes.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | squelette de la page |
| `style.css` | apparence (clair / sombre automatique) |
| `app.js` | toute la logique : XP, timer, prières, écrans |
| `manifest.webmanifest` | nom + icône pour l'installation sur téléphone |
| `sw.js` | mode hors-ligne |
| `icons/` | icônes (régénérables avec `python tools/make_icons.py`) |
