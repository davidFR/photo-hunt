(function () {
  function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
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

  function toGridBucket(center, gridMeters) {
    const metersPerDegreeLng = Math.max(111320 * Math.cos((center.lat * Math.PI) / 180), 1);
    const latMeters = center.lat * 111320;
    const lngMeters = center.lng * metersPerDegreeLng;

    return {
      latBucket: Math.round(latMeters / gridMeters),
      lngBucket: Math.round(lngMeters / gridMeters)
    };
  }

  function buildBounds(zones) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    zones.forEach(function (zone) {
      minLat = Math.min(minLat, zone.center.lat);
      maxLat = Math.max(maxLat, zone.center.lat);
      minLng = Math.min(minLng, zone.center.lng);
      maxLng = Math.max(maxLng, zone.center.lng);
    });

    return {
      southWest: [minLat, minLng],
      northEast: [maxLat, maxLng]
    };
  }

  function computeOverview(zones, options) {
    const safeOptions = options || {};
    const gridMetersValue = Number(safeOptions.gridMeters);
    const gridSizeDegLegacy = Number(safeOptions.gridSizeDeg);
    const gridMeters = Number.isFinite(gridMetersValue) && gridMetersValue > 0
      ? gridMetersValue
      : Number.isFinite(gridSizeDegLegacy) && gridSizeDegLegacy > 0
        ? gridSizeDegLegacy * 111320
        : 2200;
    const defaultRadiusMeterValue = Number(safeOptions.defaultRadiusMeter);
    const defaultRadiusMeter = Number.isFinite(defaultRadiusMeterValue) && defaultRadiusMeterValue > 0 ? defaultRadiusMeterValue : 20;

    const groups = new Map();

    zones.forEach(function (zone) {
      const bucket = toGridBucket(zone.center, gridMeters);
      const latBucket = bucket.latBucket;
      const lngBucket = bucket.lngBucket;
      const key = latBucket + ":" + lngBucket;

      if (!groups.has(key)) {
        groups.set(key, {
          key: key,
          latSum: 0,
          lngSum: 0,
          count: 0,
          labels: [],
          points: []
        });
      }

      const group = groups.get(key);
      group.latSum += zone.center.lat;
      group.lngSum += zone.center.lng;
      group.count += 1;
      const zoneRadius = Number.isFinite(Number(zone.radiusMeters)) && Number(zone.radiusMeters) > 0
        ? Number(zone.radiusMeters)
        : defaultRadiusMeter;
      group.points.push({
        center: zone.center,
        radiusMeters: zoneRadius
      });
      if (group.labels.length < 3) {
        group.labels.push(zone.label);
      }
    });

    const clusters = Array.from(groups.values()).map(function (group, index) {
      const centerLat = group.latSum / group.count;
      const centerLng = group.lngSum / group.count;
      const clusterCenter = { lat: centerLat, lng: centerLng };
      const enclosingRadius = group.points.reduce(function (maxRadius, point) {
        const required = haversineDistance(clusterCenter, point.center) + point.radiusMeters;
        return Math.max(maxRadius, required);
      }, 0);

      return {
        id: "sector-" + (index + 1),
        count: group.count,
        labels: group.labels,
        lat: centerLat,
        lng: centerLng,
        radiusMeters: Math.max(1, Math.ceil(enclosingRadius))
      };
    });

    return {
      totalCount: zones.length,
      clusters: clusters,
      bounds: buildBounds(zones)
    };
  }

  function renderMap(options) {
    if (!window.L) {
      return null;
    }

    const zoomStepValue = Number(options && options.zoomStep);
    const zoomStep = Number.isFinite(zoomStepValue) && zoomStepValue > 0 ? zoomStepValue : 0.25;
    const maxZoomValue = Number(options && options.maxZoom);
    const maxZoom = Number.isFinite(maxZoomValue) && maxZoomValue > 0 ? maxZoomValue : 19;

    const map = window.L.map(options.container, {
      zoomControl: false,
      attributionControl: true,
      zoomSnap: zoomStep,
      zoomDelta: zoomStep,
      maxZoom: maxZoom,
      wheelPxPerZoomLevel: 120
    });

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    options.clusters.forEach(function (cluster) {
      window.L.circle([cluster.lat, cluster.lng], {
        radius: cluster.radiusMeters,
        color: "#e0001c",
        fillColor: "#e0001c",
        fillOpacity: 0.14,
        weight: 2
      }).addTo(map);

      const marker = window.L.marker([cluster.lat, cluster.lng], {
        icon: window.L.divIcon({
          className: "poi-cluster-icon",
          html: "<span>" + cluster.count + "</span>",
          iconSize: [42, 42],
          iconAnchor: [21, 21]
        })
      }).addTo(map);

      marker.bindTooltip("Secteur approximatif - " + cluster.count + " POI", {
        direction: "top",
        sticky: true
      });
    });

    const southWest = options.bounds.southWest;
    const northEast = options.bounds.northEast;

    if (southWest[0] === northEast[0] && southWest[1] === northEast[1]) {
      map.setView(southWest, 14);
    } else {
      map.fitBounds([southWest, northEast], { padding: [34, 34] });
    }

    setTimeout(function () {
      map.invalidateSize();
    }, 0);

    return map;
  }

  window.GeoHuntPoiOverview = {
    computeOverview: computeOverview,
    renderMap: renderMap
  };
})();
