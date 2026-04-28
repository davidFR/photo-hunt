(function () {
  const STORAGE_KEY_PREFIX = "jeu_coop_";
  const LARGE_FILE_WARNING_BYTES = 15 * 1024 * 1024;

  const elements = {
    form: document.getElementById("gameForm"),
    gameName: document.getElementById("gameName"),
    gameDescription: document.getElementById("gameDescription"),
    photoInput: document.getElementById("photoInput"),
    uploadZone: document.getElementById("uploadZone"),
    geolocationButton: document.getElementById("geolocationButton"),
    helpToggle: document.getElementById("helpToggle"),
    helpPanel: document.getElementById("helpPanel"),
    helpClose: document.getElementById("helpClose"),
    statusBox: document.getElementById("statusBox"),
    photoMeta: document.getElementById("photoMeta"),
    summaryEmpty: document.getElementById("summaryEmpty"),
    summaryList: document.getElementById("summaryList"),
    pendingEmpty: document.getElementById("pendingEmpty"),
    pendingList: document.getElementById("pendingList"),
    gameInfo: document.getElementById("gameInfo")
  };

  const state = {
    config: null,
    currentFile: null,
    lastAnalysis: null,
    geolocationPosition: null,
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
    elements.photoInput.addEventListener("change", handlePhotoSelection);
    elements.geolocationButton.addEventListener("click", handleGeolocationFallback);
    elements.uploadZone.addEventListener("click", openFilePicker);
    elements.uploadZone.addEventListener("keydown", handleUploadZoneKeydown);
    elements.uploadZone.addEventListener("dragover", handleUploadZoneDragOver);
    elements.uploadZone.addEventListener("dragleave", handleUploadZoneDragLeave);
    elements.uploadZone.addEventListener("drop", handleUploadZoneDrop);
    elements.helpToggle.addEventListener("click", toggleHelpPanel);
    elements.helpClose.addEventListener("click", closeHelpPanel);
    document.addEventListener("keydown", handleGlobalKeydown);
    document.addEventListener("click", handleGlobalClick);
  }

  function openFilePicker() {
    if (state.isLoading) {
      return;
    }
    elements.photoInput.click();
  }

  function handleUploadZoneKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  }

  function handleUploadZoneDragOver(event) {
    event.preventDefault();
    elements.uploadZone.classList.add("is-dragover");
  }

  function handleUploadZoneDragLeave() {
    elements.uploadZone.classList.remove("is-dragover");
  }

  async function handleUploadZoneDrop(event) {
    event.preventDefault();
    elements.uploadZone.classList.remove("is-dragover");

    const droppedFile = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
    await processSelectedFile(droppedFile);
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
        maxAgeMinutes: requirePositiveNumber(gameConfig.maxAgeMinutes, "game.maxAgeMinutes"),
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

  async function handlePhotoSelection() {
    const selectedFile = elements.photoInput.files && elements.photoInput.files[0] ? elements.photoInput.files[0] : null;
    await processSelectedFile(selectedFile);
  }

  async function processSelectedFile(file) {
    clearAnalysis();
    state.currentFile = file;

    if (!file) {
      elements.photoMeta.hidden = true;
      clearStatus();
      return;
    }

    if (file.size > LARGE_FILE_WARNING_BYTES) {
      setStatus(
        "Photo lourde detectee. Le traitement reste local mais peut etre plus lent sur certains mobiles."
        ,
        "warning"
      );
    }

    setStatus("Lecture des metadonnees de la photo...", "warning");

    try {
      const analysis = await analyzePhoto(file);
      state.lastAnalysis = analysis;
      renderPhotoMeta(analysis);

      if (!analysis.position) {
        elements.geolocationButton.hidden = false;
        setStatus(
          "GPS EXIF absent sur cette photo. Vous pouvez utiliser votre position actuelle comme fallback.",
          "warning"
        );
      } else {
        elements.geolocationButton.hidden = true;
        await runAutomaticValidation(file);
      }
    } catch (error) {
      elements.geolocationButton.hidden = true;
      setStatus("Impossible de lire les metadonnees EXIF de cette photo.", "error");
      renderPhotoMeta(null);
    }
  }

  async function analyzePhoto(file) {
    if (!window.exifr || typeof window.exifr.parse !== "function") {
      throw new Error("La librairie EXIF n'est pas disponible.");
    }

    const exifData = await window.exifr.parse(file, {
      gps: true,
      tiff: true,
      ifd0: true,
      exif: true
    });

    const position = resolveExifPosition(exifData);
    const photoDateResult = resolvePhotoDate(exifData, file);

    return {
      fileName: file.name,
      fileSize: file.size,
      fileLastModified: file.lastModified,
      exifData,
      position,
      photoDate: photoDateResult.date,
      photoDateSource: photoDateResult.source,
      warnings: photoDateResult.warning ? [photoDateResult.warning] : []
    };
  }

  function resolveExifPosition(exifData) {
    if (!exifData) {
      return null;
    }

    const latitude = numberOrNull(exifData.latitude);
    const longitude = numberOrNull(exifData.longitude);

    if (latitude === null || longitude === null) {
      return null;
    }

    return { lat: latitude, lng: longitude };
  }

  function resolvePhotoDate(exifData, file) {
    const candidates = [
      exifData && exifData.DateTimeOriginal,
      exifData && exifData.CreateDate,
      exifData && exifData.ModifyDate,
      exifData && exifData.DateTimeDigitized
    ];

    const exifDate = candidates.find(isValidDate);

    if (exifDate) {
      return {
        date: exifDate,
        source: "EXIF"
      };
    }

    if (file && Number.isFinite(file.lastModified) && file.lastModified > 0) {
      return {
        date: new Date(file.lastModified),
        source: "Fichier",
        warning: "Date EXIF absente : verification d'anciennete basee sur la date du fichier, moins fiable."
      };
    }

    return {
      date: null,
      source: "Inconnue",
      warning: "Date de prise de vue introuvable."
    };
  }

  async function runAutomaticValidation(forcedFile) {
    if (state.isLoading) {
      return;
    }

    if (!state.config) {
      setStatus("La configuration du jeu n'est pas disponible.", "error");
      return;
    }

    const file = forcedFile || getSelectedFile();
    if (!file) {
      setStatus("Veuillez choisir une photo a analyser.", "error");
      return;
    }

    setStatus("Evaluation automatique en cours...", "warning");
    setBusy(true);

    try {
      const analysis = state.lastAnalysis || (await analyzePhoto(file));
      state.lastAnalysis = analysis;
      const validation = await validateAttempt(analysis, state.geolocationPosition);
      renderValidationResult(validation);
      renderValidationSummary();
    } catch (error) {
      renderFailure(error.message || "Validation impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGeolocationFallback() {
    if (!navigator.geolocation) {
      setStatus("La geolocalisation navigateur n'est pas disponible sur cet appareil.", "error");
      return;
    }

    setStatus("Recuperation de votre position actuelle...", "warning");

    try {
      const position = await getCurrentPosition();
      state.geolocationPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      await runAutomaticValidation(state.currentFile);
    } catch (error) {
      setStatus(error.message || "Permission de geolocalisation refusee.", "error");
    }
  }

  function getCurrentPosition() {
    return new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(
        resolve,
        function (error) {
          if (error && error.code === error.PERMISSION_DENIED) {
            reject(new Error("Permission de geolocalisation refusee."));
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

  async function validateAttempt(analysis, fallbackPosition) {
    const effectivePosition = analysis.position || fallbackPosition;

    if (!effectivePosition) {
      throw new Error(
        "GPS EXIF absent. Utilisez le bouton de geolocalisation actuelle ou reprenez une photo avec localisation activee."
      );
    }

    if (!analysis.photoDate) {
      throw new Error("Date de prise de vue introuvable. Impossible de verifier l'anciennete de la photo.");
    }

    const ageMinutes = computeAgeMinutes(analysis.photoDate);
    if (ageMinutes > state.config.game.maxAgeMinutes) {
      throw new Error(
        "Photo trop ancienne : " +
          Math.round(ageMinutes) +
          " minutes. Limite actuelle : " +
          state.config.game.maxAgeMinutes +
          " minutes."
      );
    }

    const match = findMatchingZone(effectivePosition, state.config.zones, state.config.game.defaultRadiusMeter);

    if (!match) {
      throw new Error("Aucune zone reconnue autour de votre position actuelle.");
    }

    if (hasExistingValidation(match.zone.id)) {
      throw new Error("Cette zone a déjà été validée sur cet appareil.");
    }

    const record = {
      zoneId: match.zone.id,
      zoneLabel: match.zone.label,
      zoneName: match.zone.name || "",
      reward: match.zone.reward,
      distanceMeters: match.distanceMeters,
      validatedAt: new Date().toISOString(),
      source: analysis.position ? "GPS EXIF" : "Geolocalisation navigateur",
      photoTakenAt: analysis.photoDate.toISOString(),
      ageMinutes: ageMinutes,
      warnings: analysis.warnings || []
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
        return { zone, distanceMeters, zoneRadius };
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

  function renderPhotoMeta(analysis) {
    if (!analysis) {
      elements.photoMeta.hidden = true;
      elements.photoMeta.innerHTML = "";
      return;
    }

    const hasDateInfo = !!analysis.photoDate;
    const hasPositionInfo = !!analysis.position;

    if (!hasDateInfo && !hasPositionInfo) {
      elements.photoMeta.hidden = true;
      elements.photoMeta.innerHTML = "";
      return;
    }

    const items = [createMetaItem("Nom", analysis.fileName)];

    if (hasDateInfo) {
      items.push(createMetaItem("Date photo", formatDateTime(analysis.photoDate) + " (" + analysis.photoDateSource + ")"));
    }

    if (hasPositionInfo) {
      items.push(createMetaItem("Coordonnees", formatCoordinates(analysis.position)));
    }

    elements.photoMeta.innerHTML = items.join("");
    elements.photoMeta.hidden = false;

    if (analysis.warnings && analysis.warnings.length > 0) {
      setStatus(analysis.warnings.join(" "), "warning");
    }
  }

  function createMetaItem(label, value) {
    return '<div class="meta-item"><span>' + escapeHtml(label) + "</span><span>" + escapeHtml(value) + "</span></div>";
  }

  function renderValidationResult(validation) {
    if (validation.record.warnings && validation.record.warnings.length > 0) {
      setStatus(validation.record.warnings.join(" "), "warning");
      return;
    }

    const visibleName = validation.zone.name ? " (" + escapeHtml(validation.zone.name) + ")" : "";

    setStatus(
      "Zone " +
        escapeHtml(validation.zone.label) +
        visibleName +
        " validée (distance " +
        escapeHtml(formatDistance(validation.record.distanceMeters)) +
        "). Votre récompense : <strong>" +
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

  function clearAnalysis() {
    state.lastAnalysis = null;
    state.geolocationPosition = null;
    elements.geolocationButton.hidden = true;
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

      // Compatibilite avec l'ancien format: { equipe: [records] }
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

  function clearStatus() {
    elements.statusBox.hidden = true;
    elements.statusBox.textContent = "";
    elements.statusBox.className = "notice";
  }

  function resolveStatusVariant(message) {
    const normalized = String(message || "").toLowerCase();

    if (normalized.includes("date exif absente")) {
      return "warning";
    }

    if (normalized.includes("photo trop ancienne")) {
      return "warning";
    }

    if (normalized.includes("deja ete validee") || normalized.includes("déjà été validée")) {
      return "warning";
    }

    return "error";
  }

  function setBusy(isBusy) {
    state.isLoading = isBusy;
    elements.photoInput.disabled = isBusy;
    elements.uploadZone.setAttribute("aria-disabled", isBusy ? "true" : "false");
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
      " zone(s) · photo <= " +
      state.config.game.maxAgeMinutes +
      " min · rayon " +
      Math.round(state.config.game.defaultRadiusMeter) +
      " m";

    if (extraMessage) {
      message += " · " + extraMessage;
    }

    elements.gameInfo.textContent = message;
  }

  function getSelectedFile() {
    if (state.currentFile) {
      return state.currentFile;
    }

    return elements.photoInput.files && elements.photoInput.files[0] ? elements.photoInput.files[0] : null;
  }

  function computeAgeMinutes(date) {
    return (Date.now() - date.getTime()) / 60000;
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

  function formatCoordinates(position) {
    return position.lat.toFixed(5) + ", " + position.lng.toFixed(5);
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

  function isValidDate(value) {
    return value instanceof Date && !Number.isNaN(value.getTime());
  }

  function numberOrNull(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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