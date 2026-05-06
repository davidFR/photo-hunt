(function () {
  const STORAGE_KEY_PREFIX = "jeu_coop_";
  const OVERVIEW_MAP_MAX_ZOOM = 16;
  const OVERVIEW_MAP_ZOOM_STEP = 0.25;
  const OVERVIEW_POI_HIDE_ZOOM = 14;
  const FAR_HINT_THRESHOLD_METERS = 200;

  const elements = {
    gameName: document.getElementById("gameName"),
    gameDescription: document.getElementById("gameDescription"),
    gameInfo: document.getElementById("gameInfo"),
    helpToggle: document.getElementById("helpToggle"),
    helpPanel: document.getElementById("helpPanel"),
    helpClose: document.getElementById("helpClose"),
    overviewMap: document.getElementById("overviewMap"),
    tabMap: document.getElementById("tabMap"),
    tabPlaces: document.getElementById("tabPlaces"),
    mapPanel: document.getElementById("mapPanel"),
    placesPanel: document.getElementById("placesPanel"),
    progressPill: document.getElementById("progressPill"),
    placesList: document.getElementById("placesList"),
    overviewStatusBox: document.getElementById("overviewStatusBox"),
    locateOnOverviewButton: document.getElementById("locateOnOverviewButton"),
    missionModal: document.getElementById("missionModal"),
    missionBackdrop: document.getElementById("missionBackdrop"),
    missionClose: document.getElementById("missionClose"),
    missionMeta: document.getElementById("missionMeta"),
    missionTitle: document.getElementById("missionTitle"),
    missionHint: document.getElementById("missionHint"),
    missionStatusBox: document.getElementById("missionStatusBox"),
    geolocationButton: document.getElementById("geolocationButton")
  };

  const state = {
    config: null,
    isHelpOpen: false,
    isMissionOpen: false,
    isLoadingValidation: false,
    isLocatingOnOverview: false,
    selectedZoneId: null,
    overviewMapInstance: null,
    overviewMarkersLayer: null,
    overviewUserLayer: null,
    overviewCycleLayer: null,
    overviewMarkersHidden: false
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    await loadConfig();
    renderMainView();
  }

  function bindEvents() {
    if (elements.geolocationButton) {
      elements.geolocationButton.addEventListener("click", handleMissionValidation);
    }

    if (elements.locateOnOverviewButton) {
      elements.locateOnOverviewButton.addEventListener("click", handleLocateOnOverviewMap);
    }

    if (elements.placesList) {
      elements.placesList.addEventListener("click", handlePlacesListClick);
    }

    if (elements.tabMap) {
      elements.tabMap.addEventListener("click", function () {
        switchOverviewTab("map");
      });
    }

    if (elements.tabPlaces) {
      elements.tabPlaces.addEventListener("click", function () {
        switchOverviewTab("places");
      });
    }

    if (elements.missionClose) {
      elements.missionClose.addEventListener("click", closeMissionModal);
    }

    if (elements.missionBackdrop) {
      elements.missionBackdrop.addEventListener("click", closeMissionModal);
    }

    if (elements.helpToggle) {
      elements.helpToggle.addEventListener("click", toggleHelpPanel);
    }

    if (elements.helpClose) {
      elements.helpClose.addEventListener("click", closeHelpPanel);
    }

    document.addEventListener("keydown", handleGlobalKeydown);
    document.addEventListener("click", handleGlobalClick);

    window.addEventListener("resize", updateProgressPill);
    window.addEventListener("orientationchange", updateProgressPill);
  }

  function handleGlobalKeydown(event) {
    if (event.key !== "Escape") {
      return;
    }

    if (state.isMissionOpen) {
      closeMissionModal();
      return;
    }

    closeHelpPanel();
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
    if (elements.helpPanel) {
      elements.helpPanel.hidden = false;
    }
    if (elements.helpToggle) {
      elements.helpToggle.setAttribute("aria-expanded", "true");
    }
  }

  function closeHelpPanel() {
    state.isHelpOpen = false;
    if (elements.helpPanel) {
      elements.helpPanel.hidden = true;
    }
    if (elements.helpToggle) {
      elements.helpToggle.setAttribute("aria-expanded", "false");
    }
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
      state.config = null;
      updateGameInfo("Configuration non chargee.");
      setOverviewStatus("Impossible de charger un gameConfig.json valide.", "error");
    }
  }

  function renderMainView() {
    renderPlacesList();
    updateProgressPill();
    renderOverviewMap();
    switchOverviewTab("map");
  }

  function switchOverviewTab(tabName) {
    const showMap = tabName !== "places";

    if (elements.mapPanel) {
      elements.mapPanel.hidden = !showMap;
    }

    if (elements.placesPanel) {
      elements.placesPanel.hidden = showMap;
    }

    if (elements.tabMap) {
      elements.tabMap.classList.toggle("overview-tab--active", showMap);
      elements.tabMap.setAttribute("aria-selected", showMap ? "true" : "false");
    }

    if (elements.tabPlaces) {
      elements.tabPlaces.classList.toggle("overview-tab--active", !showMap);
      elements.tabPlaces.setAttribute("aria-selected", showMap ? "false" : "true");
    }

    if (showMap && state.overviewMapInstance) {
      setTimeout(function () {
        if (state.overviewMapInstance) {
          state.overviewMapInstance.invalidateSize();
        }
      }, 0);
    }
  }

  function renderOverviewMap() {
    if (!elements.overviewMap) {
      return;
    }

    if (!state.config || !Array.isArray(state.config.zones) || state.config.zones.length === 0) {
      setOverviewStatus("Carte indisponible: configuration invalide.", "error");
      return;
    }

    if (!window.L) {
      setOverviewStatus("Impossible d'afficher la carte dans ce navigateur.", "error");
      return;
    }

    if (!state.overviewMapInstance) {
      state.overviewMapInstance = window.L.map(elements.overviewMap, {
        zoomControl: true,
        attributionControl: true,
        zoomSnap: OVERVIEW_MAP_ZOOM_STEP,
        zoomDelta: OVERVIEW_MAP_ZOOM_STEP,
        maxZoom: OVERVIEW_MAP_MAX_ZOOM,
        wheelPxPerZoomLevel: 120
      });

      const baseMapLayer = window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
      }).addTo(state.overviewMapInstance);

      state.overviewCycleLayer = window.L.layerGroup().addTo(state.overviewMapInstance);
      loadCycleTracksLayer(state.overviewCycleLayer);

      window.L.control.layers(
        {
          "Fond OSM": baseMapLayer
        },
        {
          "Pistes cyclables": state.overviewCycleLayer
        },
        {
          collapsed: true,
          position: "topright"
        }
      ).addTo(state.overviewMapInstance);

      state.overviewMarkersLayer = window.L.layerGroup().addTo(state.overviewMapInstance);
      state.overviewUserLayer = window.L.layerGroup().addTo(state.overviewMapInstance);

      state.overviewMapInstance.on("zoomend", applyOverviewPoiVisibility);
      fitOverviewMapToZones();

      setTimeout(function () {
        if (state.overviewMapInstance) {
          state.overviewMapInstance.invalidateSize();
        }
      }, 0);
    }

    rebuildOverviewMarkers();
    applyOverviewPoiVisibility();
  }

  function fitOverviewMapToZones() {
    if (!state.overviewMapInstance || !state.config || !Array.isArray(state.config.zones)) {
      return;
    }

    const bounds = state.config.zones.map(function (zone) {
      return [zone.center.lat, zone.center.lng];
    });

    if (bounds.length === 1) {
      state.overviewMapInstance.setView(bounds[0], 14);
      return;
    }

    state.overviewMapInstance.fitBounds(bounds, { padding: [26, 26] });
  }

  async function loadCycleTracksLayer(targetLayer) {
    if (!targetLayer || !state.config || !Array.isArray(state.config.zones) || state.config.zones.length === 0) {
      return;
    }

    targetLayer.clearLayers();

    try {
      const response = await fetch("./data/cycle-routes.osm.json", {
        cache: "force-cache"
      });

      if (!response.ok) {
        throw new Error("Erreur HTTP " + response.status);
      }

      const result = await response.json();
      const elements = Array.isArray(result && result.elements) ? result.elements : [];
      renderCycleTracks(targetLayer, elements);
    } catch (error) {
      console.warn("Impossible de charger les pistes cyclables locales:", error);
      setOverviewStatus("Pistes cyclables indisponibles: donnees locales manquantes.", "warning");
    }
  }

  function renderCycleTracks(targetLayer, elements) {
    if (!targetLayer || !Array.isArray(elements)) {
      return;
    }

    const seenWayIds = new Set();

    elements.forEach(function (element) {
      if (element.type !== "way" || !Array.isArray(element.geometry) || element.geometry.length < 2) {
        return;
      }

      if (seenWayIds.has(element.id)) {
        return;
      }
      seenWayIds.add(element.id);

      const latLngs = element.geometry
        .map(function (point) {
          if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
            return null;
          }

          return [point.lat, point.lon];
        })
        .filter(function (point) {
          return Array.isArray(point);
        });

      if (latLngs.length < 2) {
        return;
      }

      window.L.polyline(latLngs, {
        color: "#16a34a",
        weight: 3,
        opacity: 0.92,
        lineCap: "round",
        lineJoin: "round",
        dashArray: null
      }).addTo(targetLayer);
    });
  }

  function rebuildOverviewMarkers() {
    if (!state.overviewMarkersLayer || !state.config || !Array.isArray(state.config.zones)) {
      return;
    }

    state.overviewMarkersLayer.clearLayers();

    state.config.zones.forEach(function (zone) {
      const marker = window.L.marker([zone.center.lat, zone.center.lng], {
        icon: createOverviewMarkerIcon(isZoneFound(zone.id))
      });

      marker.on("click", function () {
        openMissionModal(zone.id);
      });

      marker.bindTooltip(resolveZoneDisplayTitle(zone), {
        direction: "top",
        sticky: true
      });

      marker.addTo(state.overviewMarkersLayer);
    });
  }

  function createOverviewMarkerIcon(found) {
    const variant = found ? "place-pin--found" : "place-pin--pending";

    return window.L.divIcon({
      className: "place-pin-icon",
      html: '<span class="place-pin-hit"><span class="place-pin ' + variant + '"></span></span>',
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
  }

  function applyOverviewPoiVisibility() {
    if (!state.overviewMapInstance || !state.overviewMarkersLayer) {
      return;
    }

    const shouldHideMarkers = state.overviewMapInstance.getZoom() > OVERVIEW_POI_HIDE_ZOOM;

    if (shouldHideMarkers && !state.overviewMarkersHidden) {
      state.overviewMapInstance.removeLayer(state.overviewMarkersLayer);
      state.overviewMarkersHidden = true;
    } else if (!shouldHideMarkers && state.overviewMarkersHidden) {
      state.overviewMarkersLayer.addTo(state.overviewMapInstance);
      state.overviewMarkersHidden = false;
    }

  }

  function renderPlacesList() {
    if (!elements.placesList) {
      return;
    }

    if (!state.config || !Array.isArray(state.config.zones) || state.config.zones.length === 0) {
      elements.placesList.innerHTML = '<li class="empty-state">Aucun lieu configure.</li>';
      return;
    }

    elements.placesList.innerHTML = state.config.zones
      .map(function (zone) {
        const found = isZoneFound(zone.id);
        const statusLabel = found ? "Trouve" : "A decouvrir";
        const zoneTitle = resolveZoneDisplayTitle(zone);
        const zoneSubtitle = found && zone.name ? zone.hint : "";

        return (
          '<li class="place-item ' +
          (found ? "place-item--found" : "place-item--pending") +
          '">' +
          '<button class="place-link" type="button" data-zone-id="' +
          escapeHtml(zone.id) +
          '">' +
          '<span class="place-link__title">' +
          escapeHtml(zoneTitle) +
          "</span>" +
          (zoneSubtitle
            ? '<span class="place-link__subtitle">' + escapeHtml(zoneSubtitle) + "</span>"
            : "") +
          '<span class="place-link__status">' +
          escapeHtml(statusLabel) +
          "</span>" +
          "</button>" +
          "</li>"
        );
      })
      .join("");
  }

  function handlePlacesListClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const trigger = target.closest("[data-zone-id]");
    if (!trigger) {
      return;
    }

    const zoneId = trigger.getAttribute("data-zone-id");
    if (!zoneId) {
      return;
    }

    openMissionModal(zoneId);
  }

  function openMissionModal(zoneId) {
    const zone = findZoneById(zoneId);
    if (!zone || !elements.missionModal) {
      return;
    }

    state.selectedZoneId = zone.id;
    state.isMissionOpen = true;

    elements.missionModal.hidden = false;
    document.body.classList.add("modal-open");

    renderMissionContent(zone, false);
    closeHelpPanel();
  }

  function closeMissionModal() {
    state.isMissionOpen = false;
    state.selectedZoneId = null;

    if (elements.missionModal) {
      elements.missionModal.hidden = true;
    }

    document.body.classList.remove("modal-open");
    setMissionStatus("", "warning", false);
  }

  function renderMissionContent(zone, preserveStatus) {
    if (!zone) {
      return;
    }

    const found = isZoneFound(zone.id);
    const displayTitle = resolveZoneDisplayTitle(zone);

    if (elements.missionMeta) {
      elements.missionMeta.textContent = found ? "Lieu deja trouve" : "Lieu a decouvrir";
    }

    if (elements.missionTitle) {
      elements.missionTitle.textContent = displayTitle;
    }

    if (elements.missionHint) {
      elements.missionHint.textContent = zone.hint;
    }

    if (elements.geolocationButton) {
      elements.geolocationButton.disabled = found || state.isLoadingValidation;
      elements.geolocationButton.textContent = found ? "Lieu deja valide" : "Valider ce lieu";
    }

    if (!preserveStatus) {
      setMissionStatus("", "warning", false);
    }
  }

  async function handleLocateOnOverviewMap() {
    if (state.isLocatingOnOverview) {
      return;
    }

    if (!state.config) {
      setOverviewStatus("La configuration du jeu n'est pas disponible.", "error");
      return;
    }

    if (!navigator.geolocation) {
      setOverviewStatus("La geolocalisation navigateur n'est pas disponible sur cet appareil.", "error");
      return;
    }

    if (!window.isSecureContext) {
      setOverviewStatus("La geolocalisation navigateur exige une page HTTPS.", "error");
      return;
    }

    setOverviewLocateBusy(true);
    setOverviewStatus("Recuperation de votre position actuelle...", "warning");

    try {
      const position = await getCurrentPosition();
      renderOverviewUserPosition(position);

      if (state.overviewMapInstance) {
        const currentZoom = state.overviewMapInstance.getZoom();
        const nextZoom = Math.min(Math.max(currentZoom, 13), OVERVIEW_MAP_MAX_ZOOM);

        state.overviewMapInstance.setView(
          [position.coords.latitude, position.coords.longitude],
          nextZoom
        );
      }

      setOverviewStatus("Votre position est affichee en bleu sur la carte.", "success");
    } catch (error) {
      setOverviewStatus(error.message || "Impossible de recuperer votre position.", resolveStatusVariant(error.message));
    } finally {
      setOverviewLocateBusy(false);
    }
  }

  function renderOverviewUserPosition(position) {
    if (!state.overviewUserLayer || !window.L) {
      return;
    }

    state.overviewUserLayer.clearLayers();

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = Number(position.coords.accuracy);

    window.L.circleMarker([lat, lng], {
      radius: 7,
      color: "#2563eb",
      fillColor: "#3b82f6",
      fillOpacity: 0.95,
      weight: 2
    }).addTo(state.overviewUserLayer);

    if (Number.isFinite(accuracy) && accuracy > 0) {
      window.L.circle([lat, lng], {
        radius: accuracy,
        color: "#60a5fa",
        fillColor: "#93c5fd",
        fillOpacity: 0.22,
        weight: 1
      }).addTo(state.overviewUserLayer);
    }
  }

  async function handleMissionValidation() {
    if (state.isLoadingValidation) {
      return;
    }

    if (!state.config) {
      setMissionStatus("La configuration du jeu n'est pas disponible.", "error", false);
      return;
    }

    const selectedZone = getSelectedZone();
    if (!selectedZone) {
      setMissionStatus("Choisissez un lieu avant de lancer la geolocalisation.", "warning", false);
      return;
    }

    if (!navigator.geolocation) {
      setMissionStatus("La geolocalisation navigateur n'est pas disponible sur cet appareil.", "error", false);
      return;
    }

    if (!window.isSecureContext) {
      setMissionStatus("La geolocalisation navigateur exige une page HTTPS.", "error", false);
      return;
    }

    if (hasExistingValidation(selectedZone.id)) {
      renderMissionContent(selectedZone, false);
      setMissionStatus("Ce lieu est deja valide sur cet appareil.", "warning", false);
      return;
    }

    setValidationBusy(true);
    setMissionStatus("Recuperation de votre position actuelle...", "warning", false);

    try {
      const position = await getCurrentPosition();
      const validation = validateAttemptForZone(
        {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        },
        selectedZone,
        state.config.game.defaultRadiusMeter
      );

      renderMissionValidationResult(validation);
      renderPlacesList();
      updateProgressPill();
      rebuildOverviewMarkers();

      renderMissionContent(validation.zone, true);
    } catch (error) {
      setMissionStatus(error.message || "Validation impossible.", resolveStatusVariant(error.message), false);
    } finally {
      setValidationBusy(false);
    }
  }

  function validateAttemptForZone(position, zone, defaultRadiusMeter) {
    const zoneRadius = resolveZoneRadius(zone, defaultRadiusMeter);
    const distanceMeters = haversineDistance(position, zone.center);

    if (distanceMeters > zoneRadius) {
      if (distanceMeters > FAR_HINT_THRESHOLD_METERS) {
        throw new Error("Vous etes encore loin de ce lieu.");
      }

      throw new Error("Vous vous rapprochez.");
    }

    const record = {
      zoneId: zone.id,
      zoneHint: zone.hint,
      zoneName: zone.name || "",
      reward: zone.reward,
      distanceMeters: distanceMeters,
      accuracyMeters: Number.isFinite(position.accuracy) ? position.accuracy : null,
      validatedAt: new Date().toISOString(),
      source: "Geolocalisation navigateur"
    };

    saveValidation(record);

    return {
      zone: zone,
      record: record
    };
  }

  function renderMissionValidationResult(validation) {
    const namePart = validation.zone.name
      ? "Lieu trouve: <strong>" + escapeHtml(validation.zone.name) + "</strong>. "
      : "Lieu trouve. ";

    setMissionStatus(
      namePart +
        "Votre recompense : <strong>" +
        escapeHtml(formatReward(validation.zone.reward)) +
        "</strong>",
      "success",
      true
    );
  }

  function handleGeolocationError(error) {
    if (error && error.code === error.PERMISSION_DENIED) {
      return new Error(buildPermissionDeniedMessage());
    }

    if (error && error.code === error.POSITION_UNAVAILABLE) {
      return new Error("Position actuelle indisponible.");
    }

    if (error && error.code === error.TIMEOUT) {
      return new Error("Le delai de geolocalisation a expire.");
    }

    return new Error("Impossible de recuperer la position actuelle.");
  }

  function getCurrentPosition() {
    return new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(
        resolve,
        function (error) {
          reject(handleGeolocationError(error));
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0
        }
      );
    });
  }

  function resolveZoneDisplayTitle(zone) {
    if (isZoneFound(zone.id) && typeof zone.name === "string" && zone.name.trim()) {
      return zone.name.trim();
    }

    return zone.hint;
  }

  function findZoneById(zoneId) {
    if (!state.config || !Array.isArray(state.config.zones)) {
      return null;
    }

    return (
      state.config.zones.find(function (zone) {
        return zone.id === zoneId;
      }) || null
    );
  }

  function getSelectedZone() {
    if (!state.selectedZoneId) {
      return null;
    }

    return findZoneById(state.selectedZoneId);
  }

  function updateProgressPill() {
    if (!elements.progressPill || !state.config || !Array.isArray(state.config.zones)) {
      return;
    }

    const validatedCount = getValidatedZoneIds().size;
    const totalCount = state.config.zones.length;
    const baseProgress = validatedCount + " / " + totalCount;
    const isLandscape = window.matchMedia && window.matchMedia("(orientation: landscape)").matches;
    elements.progressPill.textContent = isLandscape ? baseProgress : baseProgress + " trouvés";
  }

  function resolveZoneRadius(zone, defaultRadiusMeter) {
    const candidate = Number(zone && zone.radiusMeters);
    if (Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }

    return Number(defaultRadiusMeter);
  }

  function hasExistingValidation(zoneId) {
    return getValidations().some(function (record) {
      return record.zoneId === zoneId;
    });
  }

  function isZoneFound(zoneId) {
    return getValidatedZoneIds().has(zoneId);
  }

  function getValidatedZoneIds() {
    const zoneIds = new Set();

    getValidations().forEach(function (record) {
      if (record && record.zoneId) {
        zoneIds.add(record.zoneId);
      }
    });

    return zoneIds;
  }

  function saveValidation(record) {
    const storageKey = requireStorageKey();
    const store = readStore();
    store.push(record);
    localStorage.setItem(storageKey, JSON.stringify(store));
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

  function setValidationBusy(isBusy) {
    state.isLoadingValidation = isBusy;

    if (elements.geolocationButton) {
      const selectedZone = getSelectedZone();
      const alreadyFound = selectedZone ? isZoneFound(selectedZone.id) : false;
      elements.geolocationButton.disabled = isBusy || alreadyFound;
    }
  }

  function setOverviewLocateBusy(isBusy) {
    state.isLocatingOnOverview = isBusy;

    if (elements.locateOnOverviewButton) {
      elements.locateOnOverviewButton.disabled = isBusy;
    }
  }

  function setOverviewStatus(message, variant, allowHtml) {
    setNotice(elements.overviewStatusBox, message, variant, allowHtml);
  }

  function setMissionStatus(message, variant, allowHtml) {
    setNotice(elements.missionStatusBox, message, variant, allowHtml);
  }

  function setNotice(targetElement, message, variant, allowHtml) {
    if (!targetElement) {
      return;
    }

    if (!message) {
      targetElement.hidden = true;
      targetElement.textContent = "";
      targetElement.className = "notice";
      return;
    }

    if (allowHtml) {
      targetElement.innerHTML = message;
    } else {
      targetElement.textContent = message;
    }

    targetElement.hidden = false;
    targetElement.className = "notice";

    if (variant === "error") {
      targetElement.classList.add("notice--error");
    } else if (variant === "warning") {
      targetElement.classList.add("notice--warning");
    } else if (variant === "success") {
      targetElement.classList.add("notice--success");
    }
  }

  function resolveStatusVariant(message) {
    const normalized = String(message || "").toLowerCase();

    if (
      normalized.includes("refusee") ||
      normalized.includes("deja valide") ||
      normalized.includes("rapprochez") ||
      normalized.includes("loin")
    ) {
      return "warning";
    }

    return "error";
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

  function updateGameInfo(extraMessage) {
    if (!elements.gameInfo) {
      return;
    }

    if (!state.config) {
      elements.gameInfo.textContent = "Configuration du jeu indisponible.";
      return;
    }

    let message =
      state.config.game.name +
      " · " +
      state.config.zones.length +
      " lieu(x) · rayon " +
      Math.round(state.config.game.defaultRadiusMeter) +
      " m · mode geolocalisation";

    if (extraMessage) {
      message += " · " + extraMessage;
    }

    elements.gameInfo.textContent = message;
  }

  function normalizeConfig(rawConfig) {
    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
      throw new Error("Configuration invalide: objet racine attendu.");
    }

    const gameConfig = rawConfig.game;
    const mapConfig = rawConfig.map;
    const rawZones = rawConfig.zones;

    if (!gameConfig || typeof gameConfig !== "object" || Array.isArray(gameConfig)) {
      throw new Error("Configuration invalide: game doit etre un objet.");
    }

    if (!Array.isArray(rawZones) || rawZones.length === 0) {
      throw new Error("Configuration invalide: zones doit etre un tableau non vide.");
    }

    if (mapConfig !== undefined && (!mapConfig || typeof mapConfig !== "object" || Array.isArray(mapConfig))) {
      throw new Error("Configuration invalide: map doit etre un objet si present.");
    }

    const normalizedMap = mapConfig || {};
    const gridMeters = readOptionalPositiveNumber(normalizedMap.gridMeters, "map.gridMeters");
    const gridDegLegacy = readOptionalPositiveNumber(normalizedMap.gridDeg, "map.gridDeg");

    return {
      game: {
        id: requireNonEmptyString(gameConfig.id, "game.id"),
        name: requireNonEmptyString(gameConfig.name, "game.name"),
        description: requireNonEmptyString(gameConfig.description, "game.description"),
        defaultRadiusMeter: requirePositiveNumber(gameConfig.defaultRadiusMeter, "game.defaultRadiusMeter")
      },
      map: {
        gridMeters: gridMeters || (gridDegLegacy ? gridDegLegacy * 111320 : 2200)
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

        const rawHint = typeof zone.hint === "string" && zone.hint.trim() ? zone.hint : zone.label;

        return {
          id: requireNonEmptyString(zone.id, "zones[" + index + "].id"),
          hint: requireNonEmptyString(rawHint, "zones[" + index + "].hint"),
          name: readOptionalString(zone.name),
          center: { lat: lat, lng: lng },
          reward: zone.reward,
          radiusMeters: zoneRadius
        };
      })
    };
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

  function formatReward(reward) {
    if (typeof reward === "string") {
      return reward;
    }

    return JSON.stringify(reward);
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
