const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const outputFile = path.join(__dirname, "..", "gameConfig.json");

const SUPPORTED_SPLITS = ["syllable", "word", "mot"];
const SAME_COORDINATE_THRESHOLD_METERS = 1;
const MAX_REASONABLE_OVERLAP_METERS = 5;

function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const descriptorPathArg = cli.descriptorPath;

  if (!descriptorPathArg) {
    printUsageAndExit();
  }

  const descriptorPath = path.resolve(process.cwd(), descriptorPathArg);

  const descriptorInput = readJsonFile(descriptorPath);
  validateDescriptorSyntax(descriptorInput);

  const game = normalizeGameConfig(descriptorInput.game);

  const places = extractPlaces(descriptorInput).map(function (place, index) {
    return normalizePlace(place, index);
  });
  const solution = readSolution(descriptorInput.solution);
  const fragments = splitSolution(solution.value, solution.split);
  const rewards = buildRewardsFromFragments(fragments);

  if (places.length === 0) {
    throw new Error("Aucun lieu detecte dans le JSON fourni.");
  }

  if (fragments.length === 0) {
    throw new Error("La solution ne produit aucun fragment apres decoupage.");
  }

  if (rewards.length !== places.length) {
    throw new Error(
      "Le nombre de lieux doit correspondre au nombre de fragments de solution (places=" +
        places.length +
        ", fragments=" +
        rewards.length +
        ")."
    );
  }

  const validationWarnings = validatePlacesGeometry(places, game.defaultRadiusMeter);

  const shuffledPlaceIndexes = shuffle(range(places.length));

  rewards.forEach(function (reward, rewardIndex) {
    const placeIndex = shuffledPlaceIndexes[rewardIndex];
    places[placeIndex].reward = reward;
  });

  const zones = places.map(function (place, index) {
    const zone = {
      id: generateZoneId(place, index),
      label: place.label,
      center: place.center,
      reward: place.reward
    };

    if (place.name) {
      zone.name = place.name;
    }

    if (Number.isFinite(place.radiusMeters) && place.radiusMeters > 0) {
      zone.radiusMeters = place.radiusMeters;
    }

    return zone;
  });

  const gameId = generateGameId(game, solution, zones);

  const config = {
    game: {
      id: gameId,
      name: game.name,
      description: game.description,
      maxAgeMinutes: game.maxAgeMinutes,
      defaultRadiusMeter: game.defaultRadiusMeter
    },
    zones: zones
  };

  if (cli.checkOnly) {
    console.log("Validation OK (mode --check)");
    console.log(
      "Lieux: " +
        places.length +
        " | Fragments: " +
        rewards.length +
        " | Split: " +
        solution.split +
        " | Game ID: " +
        config.game.id +
        " | Rayon par defaut: " +
        config.game.defaultRadiusMeter +
        " m"
    );
  } else {
    fs.writeFileSync(outputFile, JSON.stringify(config, null, 2) + "\n", "utf8");
    console.log("gameConfig.json mis a jour : " + outputFile);
    console.log(
      "Lieux: " +
        places.length +
        " | Rewards: " +
        rewards.length +
        " | Split: " +
        solution.split +
        " | Game ID: " +
        config.game.id +
        " | Rayon par defaut: " +
        config.game.defaultRadiusMeter +
        " m"
    );
  }

  validationWarnings.forEach(function (warning) {
    console.warn("[Avertissement] " + warning);
  });
}

function printUsageAndExit() {
  console.error("Usage: node scripts/build-zones.js [--check] <descriptif_jeu.json>");
  console.error("- descriptif_jeu.json: lieux + metadonnees game + solution { value, split }");
  console.error("- game.defaultRadiusMeter: rayon par defaut en metres");
  console.error("- places[].radiusMeters (optionnel): surcharge locale du rayon");
  console.error("- places[].name (optionnel): nom technique, non affiche dans l'application");
  console.error("- --check: valide sans ecrire gameConfig.json");
  process.exit(1);
}

function parseCliArgs(args) {
  const options = {
    checkOnly: false,
    descriptorPath: ""
  };

  const positional = [];

  args.forEach(function (arg) {
    if (arg === "--check") {
      options.checkOnly = true;
      return;
    }

    if (arg.startsWith("-")) {
      throw new Error("Option inconnue: " + arg);
    }

    positional.push(arg);
  });

  if (positional.length > 1) {
    throw new Error("Trop d'arguments. Un seul fichier descriptif est attendu.");
  }

  options.descriptorPath = positional[0] || "";
  return options;
}

function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Syntaxe JSON invalide dans " + filePath + " (" + error.message + ")");
    }
    throw new Error("Impossible de lire le JSON des lieux: " + filePath + " (" + error.message + ")");
  }
}

function validateDescriptorSyntax(descriptorInput) {
  if (!descriptorInput || typeof descriptorInput !== "object" || Array.isArray(descriptorInput)) {
    throw new Error("Le fichier doit etre un objet JSON contenant game, solution et places.");
  }

  if (!descriptorInput.game || typeof descriptorInput.game !== "object" || Array.isArray(descriptorInput.game)) {
    throw new Error("Le champ 'game' doit etre un objet JSON.");
  }

  if (!descriptorInput.solution || typeof descriptorInput.solution !== "object" || Array.isArray(descriptorInput.solution)) {
    throw new Error("Le champ 'solution' doit etre un objet JSON.");
  }

  if (!Array.isArray(descriptorInput.places) && !Array.isArray(descriptorInput.zones)) {
    throw new Error("Le champ 'places' (ou 'zones') doit etre un tableau.");
  }
}

function readSolution(rawSolution) {
  if (!rawSolution || typeof rawSolution !== "object") {
    throw new Error("Le JSON doit contenir un objet 'solution' avec 'value' et 'split'.");
  }

  const value = typeof rawSolution.value === "string" ? rawSolution.value.trim() : "";
  const split = typeof rawSolution.split === "string" ? rawSolution.split.trim().toLowerCase() : "";

  if (!value) {
    throw new Error("solution.value est obligatoire.");
  }

  if (!SUPPORTED_SPLITS.includes(split)) {
    throw new Error("solution.split invalide. Valeurs acceptees: " + SUPPORTED_SPLITS.join(", "));
  }

  return { value: value, split: split };
}

function buildRewardsFromFragments(fragments) {
  return fragments.map(function (fragment, index) {
    return String(index + 1) + "=" + fragment;
  });
}

function splitSolution(value, splitMode) {
  if (splitMode === "word" || splitMode === "mot") {
    return value
      .trim()
      .split(/\s+/)
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean);
  }

  return splitBySyllables(value);
}

function splitBySyllables(text) {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const fragments = [];

  words.forEach(function (word) {
    const chunks = splitWordBySyllables(word);
    chunks.forEach(function (chunk) {
      if (chunk) {
        fragments.push(chunk);
      }
    });
  });

  return fragments;
}

function splitWordBySyllables(word) {
  const cleanWord = String(word)
    .trim()
    .replace(/^[^A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]+|[^A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]+$/g, "");

  if (!cleanWord) {
    return [];
  }

  const parts = cleanWord.split(/['’\-]/).filter(Boolean);
  const fragments = [];

  parts.forEach(function (part) {
    const syllables = splitSingleWord(part);
    syllables.forEach(function (syllable) {
      fragments.push(syllable);
    });
  });

  return fragments;
}

function splitSingleWord(word) {
  const vowelClass = "aeiouyAEIOUYàâäéèêëîïôöùûüÿÀÂÄÉÈÊËÎÏÔÖÙÛÜŸœŒæÆ";
  const pattern = new RegExp("[^" + vowelClass + "]*[" + vowelClass + "]+", "g");
  const matches = word.match(pattern);

  if (!matches || matches.length === 0) {
    return [word];
  }

  const consumedLength = matches.join("").length;
  if (consumedLength < word.length) {
    matches[matches.length - 1] += word.slice(consumedLength);
  }

  return matches;
}

function extractPlaces(input) {
  if (input && Array.isArray(input.places)) {
    return input.places;
  }

  if (input && Array.isArray(input.zones)) {
    return input.zones;
  }

  throw new Error("Format JSON non reconnu. Utilisez un tableau, ou un objet avec 'places' ou 'zones'.");
}

function normalizePlace(rawPlace, index) {
  if (!rawPlace || typeof rawPlace !== "object" || Array.isArray(rawPlace)) {
    throw new Error("Chaque element de places doit etre un objet JSON (index " + index + ").");
  }

  const label = readRequiredString(rawPlace.label, "places[" + index + "].label");
  const name = readOptionalString(rawPlace.name);

  const coordinateText = readFirstString(rawPlace, ["coordinates", "coord", "coords", "latLng", "google", "position"]);
  const radiusMeters = readOptionalPositiveNumber(rawPlace.radiusMeters, "places[" + index + "].radiusMeters");
  const radiusMeterLegacy = readOptionalPositiveNumber(rawPlace.radiusMeter, "places[" + index + "].radiusMeter");

  const locationHint = name || label || "(lieu sans nom)";

  if (!coordinateText) {
    throw new Error("Le lieu '" + locationHint + "' ne contient pas de coordonnees texte.");
  }

  if (radiusMeters !== null && radiusMeterLegacy !== null && radiusMeters !== radiusMeterLegacy) {
    throw new Error("Le lieu '" + locationHint + "' contient radiusMeters et radiusMeter avec des valeurs differentes.");
  }

  const effectiveRadius = radiusMeters !== null ? radiusMeters : radiusMeterLegacy;

  return {
    label: label,
    name: name,
    center: parseCoordinateText(coordinateText),
    radiusMeters: effectiveRadius,
    reward: null
  };
}

function readRequiredString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(fieldName + " est obligatoire.");
  }
  return value.trim();
}

function readOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function readOptionalPositiveNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const candidate = Number(value);
  if (!Number.isFinite(candidate) || candidate <= 0) {
    throw new Error(fieldName + " doit etre un nombre strictement positif.");
  }

  return candidate;
}

function validatePlacesGeometry(places, defaultRadiusMeter) {
  const warnings = [];

  for (let index = 0; index < places.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < places.length; otherIndex += 1) {
      const placeA = places[index];
      const placeB = places[otherIndex];

      const distance = haversineDistance(placeA.center, placeB.center);

      if (distance < SAME_COORDINATE_THRESHOLD_METERS) {
        throw new Error(
          "Coordonnees GPS en doublon (ou quasi identiques) entre '" +
            getPlaceIdentifier(placeA) +
            "' et '" +
            getPlaceIdentifier(placeB) +
            "'."
        );
      }

      const radiusA = resolvePlaceRadius(placeA, defaultRadiusMeter);
      const radiusB = resolvePlaceRadius(placeB, defaultRadiusMeter);
      const overlapMeters = radiusA + radiusB - distance;

      if (overlapMeters > MAX_REASONABLE_OVERLAP_METERS) {
        throw new Error(
          "Recouvrement trop important entre '" +
            getPlaceIdentifier(placeA) +
            "' (" +
            Math.round(radiusA) +
            "m) et '" +
            getPlaceIdentifier(placeB) +
            "' (" +
            Math.round(radiusB) +
            "m): recouvrement ~" +
            Math.round(overlapMeters) +
            "m."
        );
      }

      if (overlapMeters > 0) {
        warnings.push(
          "Recouvrement leger entre '" +
            getPlaceIdentifier(placeA) +
            "' et '" +
            getPlaceIdentifier(placeB) +
            "' (~" +
            Math.round(overlapMeters) +
            "m)."
        );
      }
    }
  }

  return warnings;
}

function resolvePlaceRadius(place, defaultRadiusMeter) {
  if (Number.isFinite(place && place.radiusMeters) && place.radiusMeters > 0) {
    return place.radiusMeters;
  }
  return defaultRadiusMeter;
}

function getPlaceIdentifier(place) {
  return place.name || place.label || "(lieu inconnu)";
}

function readPositiveNumber() {
  for (let index = 0; index < arguments.length; index += 1) {
    const candidate = Number(arguments[index]);
    if (Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }

  return null;
}

function readFirstString(objectValue, keys) {
  if (!objectValue || typeof objectValue !== "object") {
    return "";
  }

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof objectValue[key] === "string" && objectValue[key].trim()) {
      return objectValue[key].trim();
    }
  }

  return "";
}

function parseCoordinateText(value) {
  const normalized = String(value).trim();
  const chunks = normalized.split(",");

  if (chunks.length !== 2) {
    throw new Error("Coordonnees invalides: '" + value + "'. Format attendu: 'lat, lng'.");
  }

  const lat = Number(chunks[0].trim());
  const lng = Number(chunks[1].trim());

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Coordonnees invalides: '" + value + "'.");
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("Coordonnees hors bornes: '" + value + "'.");
  }

  return { lat: lat, lng: lng };
}

function haversineDistance(from, to) {
  const earthRadiusMeters = 6371000;
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function normalizeGameConfig(rawGame) {
  if (!rawGame || typeof rawGame !== "object" || Array.isArray(rawGame)) {
    throw new Error("game doit etre un objet JSON complet.");
  }

  return {
    name: readRequiredString(rawGame.name, "game.name"),
    description: readRequiredString(rawGame.description, "game.description"),
    maxAgeMinutes: readRequiredPositiveNumber(rawGame.maxAgeMinutes, "game.maxAgeMinutes"),
    defaultRadiusMeter: readRequiredPositiveNumber(rawGame.defaultRadiusMeter, "game.defaultRadiusMeter")
  };
}

function readRequiredPositiveNumber(value, fieldName) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate) || candidate <= 0) {
    throw new Error(fieldName + " doit etre un nombre strictement positif.");
  }
  return candidate;
}

function generateZoneId(place, index) {
  const raw = [index, place.name || "", place.label, place.center.lat, place.center.lng, place.radiusMeters || ""].join("|");
  return crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

function generateGameId(game, solution, zones) {
  const payload = {
    game: {
      name: game.name,
      description: game.description,
      maxAgeMinutes: game.maxAgeMinutes,
      defaultRadiusMeter: game.defaultRadiusMeter
    },
    solution: {
      value: solution.value,
      split: solution.split
    },
    zones: zones
  };

  return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
}

function range(length) {
  return Array.from({ length: length }, function (_, index) {
    return index;
  });
}

function shuffle(items) {
  const copy = items.slice();

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const temp = copy[index];
    copy[index] = copy[randomIndex];
    copy[randomIndex] = temp;
  }

  return copy;
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}