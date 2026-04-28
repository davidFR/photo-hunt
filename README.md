# Jeu cooperatif photo-hunt - Template

Application web 100% statique pour valider des zones de jeu a partir d'une photo prise sur mobile. Tout le traitement est local au navigateur : aucune photo n'est envoyee, aucune authentification n'est requise, aucun backend n'est necessaire.

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
- `app.js` : chargement de configuration, lecture EXIF, geolocalisation navigateur, geofencing, anti-doublon localStorage, rendu UI.
- `gameConfig.json` : fichier de configuration charge cote client.
- `scripts/build-zones.js` : script de preparation pour definir ou regenerer `gameConfig.json` avant le jeu.
- `vendor/exifr-lite.umd.js` : dependance locale pour lire les metadonnees EXIF sans CDN.
- `vercel.json` : headers `no-store` pour eviter un cache stale de `gameConfig.json`.

## Fonctionnement

1. Le participant choisit une photo prise sur place depuis son mobile.
2. L'application lit les EXIF de la photo pour recuperer GPS et heure de prise de vue.
3. L'evaluation est lancee automatiquement apres selection de la photo.
4. Si le GPS EXIF est absent, l'app propose un fallback via `navigator.geolocation` avec un avertissement de fiabilite.
5. La distance est calculee avec Haversine et comparee aux zones chargees depuis `gameConfig.json`.
6. Si la photo est assez recente et situee dans une zone valide, la recompense associee est affichee.
7. Une validation deja obtenue pour la meme zone sur le meme appareil est refusee via `localStorage`.

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

- Autoriser l'acces a l'appareil photo depuis Safari si vous utilisez la capture directe.
- Dans Reglages > Confidentialite et securite > Service de localisation, verifier que l'appareil photo peut enregistrer la position.
- Si les photos ne contiennent pas de GPS, l'app proposera le fallback de geolocalisation navigateur.

### Android

- Verifier que l'appareil photo peut acceder a la localisation.
- Verifier que la localisation du telephone est activee en haute precision le jour du jeu.
- Autoriser la geolocalisation du navigateur si le fallback doit etre utilise.

## Tests

### Tests fonctionnels a faire avant le jour J

1. Photo recente prise dans une zone test avec GPS EXIF present.
2. Photo recente hors zone pour verifier le message d'echec.
3. Photo trop ancienne pour verifier le seuil `maxAgeMinutes`.
4. Photo sans GPS EXIF puis validation via fallback geolocalisation.
5. Refus d'une seconde validation de la meme zone sur le meme appareil.
6. Verification de persistance locale apres rechargement de la page.
7. Chargement en 4G/5G sur iPhone et Android.
8. Ouverture en navigation privee pour verifier le comportement `localStorage` selon les navigateurs.

### Check-list terrain

1. Tester l'URL finale sur au moins deux iPhone et deux Android.
2. Verifier le temps de chargement en conditions reseau reelles.
3. Controler que les zones du fichier `gameConfig.json` correspondent bien aux lieux reels.
4. Prendre une photo de reference sur chaque lieu cle avant l'evenement.
5. Valider la marge du rayon en metres en marchant juste a l'exterieur puis a l'interieur.
6. Confirmer le message utilisateur en cas de GPS absent, photo trop ancienne et permission refusee.
7. Verifier que les recompenses affichees sont les bonnes.
8. Garder une version offline de secours du projet sur un poste local.

## Securite et vie privee

- Aucune photo n'est envoyee au reseau.
- Aucune donnee sensible n'est demandee.
- Aucun tracking, cookie tiers ou analytics n'est integre.
- Les validations restent sur l'appareil via `localStorage`.

## Limitations connues

- Les applications photo de certains telephones retirent parfois le GPS EXIF lors de partages ou retouches.
- La date EXIF peut etre absente ; dans ce cas, l'application utilise `lastModified` avec un avertissement.
- Le fallback navigateur est moins fiable que le GPS de la photo.
- En navigation privee, certains navigateurs peuvent effacer `localStorage` plus agressivement.

## Ameliorations possibles

1. Ajouter un mode organisateur pour exporter/importer les validations locales.
2. Afficher un apercu compresse de la photo sans conserver l'original.
3. Ajouter une signature visuelle pour distinguer validation EXIF et validation geolocalisation.
4. Ajouter un mode multi-langue si certains participants ne sont pas francophones.
5. Integrer une carte offline simplifiee des zones autorisees.
6. Ajouter un QR code par zone comme mecanisme de secours complementaire.
