# Jeu cooperatif photo-hunt - Template

Application web 100% statique pour valider des zones de jeu a partir de la geolocalisation du smartphone. Tout le traitement est local au navigateur : aucune photo n'est demandee, aucune authentification n'est requise, aucun backend n'est necessaire.

## Arborescence

```text
app/
├── app.js
├── index.html
├── maif.svg
├── README.md
├── scripts/
│   └── build-zones.js
├── style.css
├── vendor/
│   └── exifr-lite.umd.js
├── vercel.json
└── gameConfig.json
```

## Architecture

- `index.html` : interface mobile-first, structure en 3 etapes, resume des validations, messages d'erreur.
- `style.css` : look MAIF, optimise mobile, cartes simples et lisibles.
- `app.js` : chargement de configuration, geolocalisation navigateur, geofencing, anti-doublon localStorage, rendu UI.
- `gameConfig.json` : fichier de configuration charge cote client.
- `scripts/build-zones.js` : script de preparation pour definir ou regenerer `gameConfig.json` avant le jeu.
- `vercel.json` : headers `no-store` pour eviter un cache stale de `gameConfig.json`.

## Fonctionnement

1. Le participant appuie sur le bouton `Geolocalise-moi`.
2. Le navigateur demande l'autorisation de geolocalisation (si necessaire).
3. La position GPS courante est comparee aux zones chargees depuis `gameConfig.json`.
4. Si la position est dans une zone valide, la recompense associee est affichee.
5. Une validation deja obtenue pour la meme zone sur le meme appareil est refusee via `localStorage`.

## Lancement local

### Option recommandee

Servir le dossier avec un serveur statique local pour que `fetch('gameConfig.json')` fonctionne correctement.

Exemples :

```bash
# Node si npx est disponible
npx serve .

# Ou tout autre serveur statique equivalent
```

### Mode offline / file://

Si vous ouvrez directement `index.html` en `file://`, certains navigateurs bloquent `fetch` sur `gameConfig.json`.

Dans ce cas, utilisez un petit serveur statique local.

## Deploiement Vercel

1. Creer un projet Vercel en important le dossier de l'application.
2. Choisir un deploiement statique simple, sans framework.
3. Verifier que `vercel.json` est bien pris en compte.
4. Publier puis tester l'URL publique sur iPhone et Android en 4G/5G.

L'application ne depend d'aucun backend et ne stocke les validations qu'en local sur l'appareil.

## Preparation des zones

Le fichier source de jeu est `gameConfig.json`.

Pour preparer ou regenerer ce fichier avec une structure propre :

```bash
node scripts/build-zones.js ./scripts/descriptif_jeu.json
node scripts/build-zones.js --check ./scripts/descriptif_jeu.json
```

L'option `--check` valide le fichier sans generer `gameConfig.json`.

Le script lit tous les parametres depuis un seul fichier JSON: metadata du jeu, lieux, et solution.

Format attendu pour les lieux :

```json
{
	"game": {
		"name": "Nom du jeu",
		"description": "Description du jeu",
		"maxAgeMinutes": 240,
		"defaultRadiusMeter": 150
	},
	"solution": {
		"value": "Votre phrase solution",
		"split": "syllable"
	},
	"places": [
		{ "label": "Lieu 1", "name": "Nom technique 1", "coordinates": "46.20802491707116, -1.5157652181555226" },
		{ "label": "Lieu 2", "radiusMeters": 90, "coordinates": "46.20359, -1.36716" }
	]
}
```

`solution.split` accepte `syllable`, `word` ou `mot`.

`game.defaultRadiusMeter` definit le rayon par defaut. Vous pouvez surcharger localement un lieu avec `places[].radiusMeters`.

`game.id` est genere automatiquement par le script et sert a isoler le stockage local par jeu (`jeu_coop_<id>`).

`places[].name` est un champ technique pour vous reperer dans le fichier source et n'est pas affiche dans l'application.

Le script decoupe `solution.value` selon `solution.split`, associe aleatoirement les fragments aux lieux, et ecrit chaque reward sous la forme `numeroDeLigne=valeur` pour permettre la reconstitution du texte final.

Le script valide aussi automatiquement:
- la syntaxe/structure JSON (`game`, `solution`, `places`),
- la correspondance entre nombre de lieux et nombre de fragments de solution,
- l'unicite des coordonnees GPS,
- les recouvrements de zones (bloque si le recouvrement est trop important).

## Mobile et permissions

### iPhone / iOS

- Autoriser la geolocalisation pour Safari (ou le navigateur utilise).
- Verifier que la localisation du telephone est activee.
- Ouvrir l'application en HTTPS pour autoriser `navigator.geolocation`.

### Android

- Autoriser la geolocalisation pour Chrome (ou le navigateur utilise).
- Verifier que la localisation du telephone est activee en haute precision le jour du jeu.
- Ouvrir l'application en HTTPS pour autoriser `navigator.geolocation`.

## Tests

### Tests fonctionnels a faire avant le jour J

1. Validation d'une zone avec geolocalisation activee.
2. Tentative hors zone pour verifier le message d'echec.
3. Refus d'une seconde validation de la meme zone sur le meme appareil.
4. Verification de persistance locale apres rechargement de la page.
5. Chargement en 4G/5G sur iPhone et Android.
6. Ouverture en navigation privee pour verifier le comportement `localStorage` selon les navigateurs.
7. Refus de permission geolocalisation pour verifier le message utilisateur.

### Check-list terrain

1. Tester l'URL finale sur au moins deux iPhone et deux Android.
2. Verifier le temps de chargement en conditions reseau reelles.
3. Controler que les zones du fichier `gameConfig.json` correspondent bien aux lieux reels.
4. Valider la marge du rayon en metres en marchant juste a l'exterieur puis a l'interieur.
5. Confirmer le message utilisateur en cas de permission refusee et hors zone.
6. Verifier que les recompenses affichees sont les bonnes.
7. Garder une version offline de secours du projet sur un poste local.

## Securite et vie privee

- Aucune photo n'est demandee.
- Aucune donnee sensible n'est demandee.
- Aucun tracking, cookie tiers ou analytics n'est integre.
- Les validations restent sur l'appareil via `localStorage`.

## Limitations connues

- La precision GPS varie selon le telephone, l'environnement (interieur/exterieur) et les conditions reseau.
- La geolocalisation web exige une page HTTPS (ou localhost en local).
- Si l'utilisateur refuse la permission, la validation est impossible tant que la permission n'est pas reautorisee.
- En navigation privee, certains navigateurs peuvent effacer `localStorage` plus agressivement.

## Ameliorations possibles

1. Ajouter un mode organisateur pour exporter/importer les validations locales.
2. Ajouter un niveau de confiance lie a la precision GPS (accuracy).
3. Ajouter une signature visuelle selon la qualite de precision geolocalisation.
4. Ajouter un mode multi-langue si certains participants ne sont pas francophones.
5. Integrer une carte offline simplifiee des zones autorisees.
6. Ajouter un QR code par zone comme mecanisme de secours complementaire.
