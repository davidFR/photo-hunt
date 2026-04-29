(function () {
  const STORAGE_KEY_PREFIX = "jeu_coop_";

  const elements = {
    gameName: document.getElementById("gameName"),
    gameDescription: document.getElementById("gameDescription"),
    geolocationButton: document.getElementById("geolocationButton"),
    helpToggle: document.getElementById("helpToggle"),
    helpPanel: document.getElementById("helpPanel"),
    helpClose: document.getElementById("helpClose"),
    statusBox: document.getElementById("statusBox"),
    summaryEmpty: document.getElementById("summaryEmpty"),
    summaryList: document.getElementById("summaryList"),
    pendingEmpty: document.getElementById("pendingEmpty"),
    pendingList: document.getElementById("pendingList"),
    gameInfo: document.getElementById("gameInfo")
  };

  const state = {
    config: null,
    isLoading: false,
    isHelpOpen: false
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    await loadConfig();
    renderValidationSummary();
  }

  function bindEvents() {
    elements.geolocationButton.addEventListener("click", handleGeolocationValidation);
    elements.helpToggle.addEventListener("click", toggleHelpPanel);
    elements.helpClose.addEventListener("click", closeHelpPanel);
    document.addEventListener("keydown", handleGlobalKeydown);
    document.addEventListener("click", handleGlobalClick);
  }

  function handleGlobalKeydown(event) {
    if (event.key === "Escape") {
      closeHelpPanel();
    }
  }

  function handleGlobalClick(event) {
    if (!state.isHelpOpen) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("#helpPanel") || target.closest("#helpToggle")) {
      return;
    }

    closeHelpPanel();
  }

  function toggleHelpPanel() {
    if (state.isHelpOpen) {
      closeHelpPanel();
      return;
    }

    state.isHelpOpen = true;
    elements.helpPanel.hidden = false;
    elements.helpToggle.setAttribute("aria-expanded", "true");
  }

  function closeHelpPanel() {
    state.isHelpOpen = false;
    elements.helpPanel.hidden = true;
    elements.helpToggle.setAttribute("aria-expanded", "false");
  }

  async function loadConfig() {
    try {
      const response = await fetch("./gameConfig.json", {
        cache: "no-store",
        headers: { "Cache-Control": "no-store" }
      });

      if (!response.ok) {
        throw new Error("Impossible de charger gameConfig.json");
      }

      const data = await response.json();
      state.config = normalizeConfig(data);
      applyGameBranding();
      updateGameInfo();
    } catch (error) {
      updateGameInfo("Configuration non chargee.");
      setStatus("Impossible de charger un gameConfig.json valide.", "error");
    }
  }

  function normalizeConfig(rawConfig) {
    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
      throw new Error("Configuration invalide: objet racine attendu.");
    }

    const gameConfig = rawConfig.game;
    const rawZones = rawConfig.zones;

    if (!gameConfig || typeof gameConfig !== "object" || Array.isArray(gameConfig)) {
      throw new Error("Configuration invalide: game doit etre un objet.");
    }

    if (!Array.isArray(rawZones) || rawZones.length === 0) {
      throw new Error("Configuration invalide: zones doit etre un tableau non vide.");
    }

    return {
      game: {
        id: requireNonEmptyString(gameConfig.id, "game.id"),
        name: requireNonEmptyString(gameConfig.name, "game.name"),
        description: requireNonEmptyString(gameConfig.description, "game.description"),
        defaultRadiusMeter: requirePositiveNumber(gameConfig.defaultRadiusMeter, "game.defaultRadiusMeter")
      },
      zones: rawZones.map(function (zone, index) {
        if (!zone || typeof zone !== "object" || Array.isArray(zone)) {
          throw new Error("Configuration invalide: zones[" + index + "] doit etre un objet.");
        }

        const center = zone.center;
        if (!center || typeof center !== "object" || Array.isArray(center)) {
          throw new Error("Configuration invalide: zones[" + index + "].center doit etre un objet.");
        }

        const lat = requireNumber(center.lat, "zones[" + index + "].center.lat");
        const lng = requireNumber(center.lng, "zones[" + index + "].center.lng");
        const zoneRadius = readOptionalPositiveNumber(zone.radiusMeters, "zones[" + index + "].radiusMeters");

        if (!Object.prototype.hasOwnProperty.call(zone, "reward") || zone.reward === null) {
          throw new Error("Configuration invalide: zones[" + index + "].reward est obligatoire.");
        }

        return {
          id: requireNonEmptyString(zone.id, "zones[" + index + "].id"),
          label: requireNonEmptyString(zone.label, "zones[" + index + "].label"),
          name: readOptionalString(zone.name),
          center: { lat: lat, lng: lng },
          reward: zone.reward,
          radiusMeters: zoneRadius
        };
      })
    };
  }

  function applyGameBranding() {
    if (!state.config || !state.config.game) {
      return;
    }

    const gameName = state.config.game.name;
    const gameDescription = state.config.game.description;

    if (elements.gameName) {
      elements.gameName.textContent = gameName;
    }

    if (elements.gameDescription) {
      elements.gameDescription.textContent = gameDescription;
    }

    document.title = gameDescription;
  }

  async function handleGeolocationValidation() {
    if (state.isLoading) {
      return;
    }

    if (!state.config) {
      setStatus("La configuration du jeu n'est pas disponible.", "error");
      return;
    }

    if (!navigator.geolocation) {
      setStatus("La geolocalisation navigateur n'est pas disponible sur cet appareil.", "error");
      return;
    }

    if (!window.isSecureContext) {
      setStatus("La geolocalisation navigateur exige une page HTTPS.", "error");
      return;
    }

    setStatus("Recuperation de votre position actuelle...", "warning");
    setBusy(true);

    try {
      const position = await getCurrentPosition();
      const validation = validateAttempt({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      });
      renderValidationResult(validation);
      renderValidationSummary();
    } catch (error) {
      renderFailure(error.message || "Validation impossible.");
    } finally {
      setBusy(false);
    }
  }

  function getCurrentPosition() {
    return new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(
        resolve,
        function (error) {
          if (error && error.code === error.PERMISSION_DENIED) {
            reject(new Error(buildPermissionDeniedMessage()));
            return;
          }

          if (error && error.code === error.POSITION_UNAVAILABLE) {
            reject(new Error("Position actuelle indisponible."));
            return;
          }

          if (error && error.code === error.TIMEOUT) {
            reject(new Error("Le delai de geolocalisation a expire."));
            return;
          }

          reject(new Error("Impossible de recuperer la position actuelle."));
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0
        }
      );
    });
  }

  function buildPermissionDeniedMessage() {
    const platform = detectMobilePlatform();

    if (platform === "android") {
      return (
        "Permission de geolocalisation refusee. Android: ouvrez les parametres du navigateur, " +
        "section site/page, puis Position > Autoriser. Rechargez ensuite la page."
      );
    }

    if (platform === "ios") {
      return (
        "Permission de geolocalisation refusee. iPhone: Reglages > Safari > Localisation > Autoriser, " +
        "puis revenez sur la page et rechargez-la."
      );
    }

    return "Permission de geolocalisation refusee. Autorisez la localisation dans le navigateur puis rechargez la page.";
  }

  function detectMobilePlatform() {
    const userAgent = navigator.userAgent || "";

    if (/android/i.test(userAgent)) {
      return "android";
    }

    if (/iphone|ipad|ipod/i.test(userAgent)) {
      return "ios";
    }

    return "other";
  }

  function validateAttempt(position) {
    const match = findMatchingZone(position, state.config.zones, state.config.game.defaultRadiusMeter);

    if (!match) {
      throw new Error("Aucune zone reconnue autour de votre position actuelle.");
    }

    if (hasExistingValidation(match.zone.id)) {
      throw new Error("Cette zone a deja ete validee sur cet appareil.");
    }

    const record = {
      zoneId: match.zone.id,
      zoneLabel: match.zone.label,
      zoneName: match.zone.name || "",
      reward: match.zone.reward,
      distanceMeters: match.distanceMeters,
      accuracyMeters: Number.isFinite(position.accuracy) ? position.accuracy : null,
      validatedAt: new Date().toISOString(),
      source: "Geolocalisation navigateur"
    };

    saveValidation(record);

    return {
      zone: match.zone,
      record
    };
  }

  function findMatchingZone(position, zones, defaultRadiusMeter) {
    const effectiveDefaultRadius = Number(defaultRadiusMeter);

    const candidates = zones
      .map(function (zone) {
        const distanceMeters = haversineDistance(position, zone.center);
        const zoneRadius = Number.isFinite(Number(zone.radiusMeters)) && Number(zone.radiusMeters) > 0
          ? Number(zone.radiusMeters)
          : effectiveDefaultRadius;
        return { zone: zone, distanceMeters: distanceMeters, zoneRadius: zoneRadius };
      })
      .filter(function (item) {
        return item.distanceMeters <= item.zoneRadius;
      })
      .sort(function (left, right) {
        return left.distanceMeters - right.distanceMeters;
      });

    return candidates[0] || null;
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

  function renderValidationResult(validation) {
    const visibleName = validation.zone.name ? " (" + escapeHtml(validation.zone.name) + ")" : "";
    const accuracyText = Number.isFinite(validation.record.accuracyMeters)
      ? " Precision GPS: ~" + escapeHtml(formatDistance(validation.record.accuracyMeters)) + "."
      : "";

    setStatus(
      "Zone " +
        escapeHtml(validation.zone.label) +
        visibleName +
        " validee (distance " +
        escapeHtml(formatDistance(validation.record.distanceMeters)) +
        ")." +
        accuracyText +
        " Votre recompense : <strong>" +
        escapeHtml(formatReward(validation.zone.reward)) +
        "</strong>",
      "success",
      true
    );
  }

  function renderFailure(message) {
    setStatus(message, resolveStatusVariant(message));
  }

  function renderValidationSummary() {
    if (!state.config) {
      elements.summaryEmpty.hidden = false;
      elements.summaryList.hidden = true;
      elements.summaryList.innerHTML = "";
      elements.pendingEmpty.hidden = false;
      elements.pendingEmpty.textContent = "Configuration du jeu indisponible.";
      elements.pendingList.hidden = true;
      elements.pendingList.innerHTML = "";
      return;
    }

    const validations = getValidations();
    const validatedZoneIds = new Set(validations.map(function (record) {
      return record.zoneId;
    }));
    const pendingZones = state.config.zones.filter(function (zone) {
      return !validatedZoneIds.has(zone.id);
    });

    if (validations.length === 0) {
      elements.summaryEmpty.hidden = false;
      elements.summaryList.hidden = true;
      elements.summaryList.innerHTML = "";
    } else {
      elements.summaryEmpty.hidden = true;
      elements.summaryList.hidden = false;
      elements.summaryList.innerHTML = validations
        .sort(function (left, right) {
          return new Date(right.validatedAt).getTime() - new Date(left.validatedAt).getTime();
        })
        .map(function (record) {
          const foundName = resolveZoneName(record);
          const foundNameHtml = foundName ? '<div class="summary-item__name">' + escapeHtml(foundName) + "</div>" : "";

          return (
            '<li class="summary-item">' +
            "<strong>" +
            escapeHtml(record.zoneLabel) +
            "</strong>" +
            foundNameHtml +
            "<div>" +
            escapeHtml(formatReward(record.reward)) +
            "</div>" +
            "<small>" +
            escapeHtml(formatDateTime(new Date(record.validatedAt))) +
            "</small>" +
            "</li>"
          );
        })
        .join("");
    }

    if (pendingZones.length === 0) {
      elements.pendingEmpty.hidden = false;
      elements.pendingList.hidden = true;
      elements.pendingList.innerHTML = "";
    } else {
      elements.pendingEmpty.hidden = true;
      elements.pendingList.hidden = false;
      elements.pendingList.innerHTML = pendingZones
        .map(function (zone) {
          return '<li class="summary-item"><strong>' + escapeHtml(zone.label) + "</strong></li>";
        })
        .join("");
    }
  }

  function resolveZoneName(record) {
    if (record && typeof record.zoneName === "string" && record.zoneName.trim()) {
      return record.zoneName.trim();
    }

    if (!state.config || !Array.isArray(state.config.zones)) {
      return "";
    }

    const matchingZone = state.config.zones.find(function (zone) {
      return zone.id === record.zoneId;
    });

    return matchingZone && typeof matchingZone.name === "string" ? matchingZone.name.trim() : "";
  }

  function saveValidation(record) {
    const storageKey = requireStorageKey();
    const store = readStore();
    store.push(record);
    localStorage.setItem(storageKey, JSON.stringify(store));
  }

  function hasExistingValidation(zoneId) {
    return getValidations().some(function (record) {
      return record.zoneId === zoneId;
    });
  }

  function getValidations() {
    return readStore();
  }

  function readStore() {
    try {
      const storageKey = resolveStorageKey();
      if (!storageKey) {
        return [];
      }

      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        return parsed;
      }

      if (parsed && typeof parsed === "object") {
        const flattened = Object.values(parsed)
          .filter(Array.isArray)
          .flat();

        const dedupByZone = [];
        const seen = new Set();

        flattened.forEach(function (record) {
          if (!record || !record.zoneId || seen.has(record.zoneId)) {
            return;
          }
          seen.add(record.zoneId);
          dedupByZone.push(record);
        });

        return dedupByZone;
      }

      return [];
    } catch (error) {
      return [];
    }
  }

  function setStatus(message, variant, allowHtml) {
    if (allowHtml) {
      elements.statusBox.innerHTML = message;
    } else {
      elements.statusBox.textContent = message;
    }

    elements.statusBox.hidden = false;
    elements.statusBox.className = "notice";

    if (variant === "error") {
      elements.statusBox.classList.add("notice--error");
    } else if (variant === "warning") {
      elements.statusBox.classList.add("notice--warning");
    } else if (variant === "success") {
      elements.statusBox.classList.add("notice--success");
    }
  }

  function resolveStatusVariant(message) {
    const normalized = String(message || "").toLowerCase();

    if (normalized.includes("refusee") || normalized.includes("deja ete validee")) {
      return "warning";
    }

    return "error";
  }

  function setBusy(isBusy) {
    state.isLoading = isBusy;
    elements.geolocationButton.disabled = isBusy;
  }

  function updateGameInfo(extraMessage) {
    if (!state.config) {
      elements.gameInfo.textContent = "Configuration du jeu indisponible.";
      return;
    }

    let message =
      state.config.game.name +
      " · " +
      state.config.zones.length +
      " zone(s) · rayon " +
      Math.round(state.config.game.defaultRadiusMeter) +
      " m · mode geolocalisation";

    if (extraMessage) {
      message += " · " + extraMessage;
    }

    elements.gameInfo.textContent = message;
  }

  function formatDistance(distanceMeters) {
    if (!Number.isFinite(distanceMeters)) {
      return "-";
    }

    if (distanceMeters < 1000) {
      return Math.round(distanceMeters) + " m";
    }

    return (distanceMeters / 1000).toFixed(2) + " km";
  }

  function formatReward(reward) {
    if (typeof reward === "string") {
      return reward;
    }

    return JSON.stringify(reward);
  }

  function formatDateTime(date) {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function resolveStorageKey() {
    if (!state.config || !state.config.game || !state.config.game.id) {
      return null;
    }

    const rawId = String(state.config.game.id).trim();
    if (!rawId) {
      return null;
    }

    return STORAGE_KEY_PREFIX + rawId;
  }

  function requireStorageKey() {
    const storageKey = resolveStorageKey();
    if (!storageKey) {
      throw new Error("Identifiant de jeu manquant: impossible de sauvegarder.");
    }
    return storageKey;
  }

  function requireNonEmptyString(value, fieldName) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("Configuration invalide: " + fieldName + " est obligatoire.");
    }
    return value.trim();
  }

  function readOptionalString(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim();
  }

  function requirePositiveNumber(value, fieldName) {
    const candidate = Number(value);
    if (!Number.isFinite(candidate) || candidate <= 0) {
      throw new Error("Configuration invalide: " + fieldName + " doit etre un nombre strictement positif.");
    }
    return candidate;
  }

  function readOptionalPositiveNumber(value, fieldName) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const candidate = Number(value);
    if (!Number.isFinite(candidate) || candidate <= 0) {
      throw new Error("Configuration invalide: " + fieldName + " doit etre un nombre strictement positif.");
    }

    return candidate;
  }

  function requireNumber(value, fieldName) {
    const candidate = Number(value);
    if (!Number.isFinite(candidate)) {
      throw new Error("Configuration invalide: " + fieldName + " doit etre un nombre.");
    }
    return candidate;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
