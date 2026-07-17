// ---------------------------------------------
// Cerca — buscador de lugares por GPS (OSM/Overpass)
// ---------------------------------------------

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Cada categoría define uno o más filtros Overpass (clave/valor exactos
// o expresiones regulares sobre "cuisine") y metadata visual.
const CATEGORY_DEFS = {
  bar: {
    label: "Bar",
    icon: "🍸",
    badgeClass: "bar",
    filters: [`node["amenity"="bar"](around:RADIUS,LAT,LON);`, `node["amenity"="pub"](around:RADIUS,LAT,LON);`],
  },
  cafe: {
    label: "Café",
    icon: "☕",
    badgeClass: "cafe",
    filters: [`node["amenity"="cafe"](around:RADIUS,LAT,LON);`],
  },
  parrilla: {
    label: "Parrilla",
    icon: "🔥",
    badgeClass: "parrilla",
    filters: [
      `node["amenity"="restaurant"]["cuisine"~"steak_house|barbecue|grill|argentin", i](around:RADIUS,LAT,LON);`,
    ],
  },
  restaurante: {
    label: "Restaurante",
    icon: "🍽",
    badgeClass: "resto",
    filters: [`node["amenity"="restaurant"](around:RADIUS,LAT,LON);`],
  },
  pizza: {
    label: "Pizza",
    icon: "🍕",
    badgeClass: "resto",
    filters: [
      `node["amenity"~"restaurant|fast_food"]["cuisine"~"pizza", i](around:RADIUS,LAT,LON);`,
    ],
  },
  heladeria: {
    label: "Heladería",
    icon: "🍦",
    badgeClass: "cafe",
    filters: [`node["amenity"="ice_cream"](around:RADIUS,LAT,LON);`],
  },
};

const state = {
  selected: new Set(),
  radius: 1000,
  userLat: null,
  userLon: null,
  results: [],
  view: "list",
  map: null,
  markersLayer: null,
};

const els = {
  chips: document.getElementById("categoryChips"),
  radius: document.getElementById("radius"),
  radiusValue: document.getElementById("radiusValue"),
  searchBtn: document.getElementById("searchBtn"),
  searchBtnLabel: document.getElementById("searchBtnLabel"),
  statusBox: document.getElementById("statusBox"),
  viewToggle: document.getElementById("viewToggle"),
  resultsView: document.getElementById("resultsView"),
  mapView: document.getElementById("mapView"),
};

// ---------- UI: chips de categoría ----------
els.chips.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const cat = chip.dataset.cat;
  if (state.selected.has(cat)) {
    state.selected.delete(cat);
    chip.classList.remove("selected");
  } else {
    state.selected.add(cat);
    chip.classList.add("selected");
  }
});

// ---------- UI: radio de búsqueda ----------
els.radius.addEventListener("input", () => {
  state.radius = parseInt(els.radius.value, 10);
  els.radiusValue.textContent = formatDistance(state.radius, true);
});
els.radiusValue.textContent = formatDistance(state.radius, true);

// ---------- UI: toggle lista/mapa ----------
els.viewToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".toggle-btn");
  if (!btn) return;
  setView(btn.dataset.view);
});

function setView(view) {
  state.view = view;
  document.querySelectorAll(".toggle-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
  });
  els.resultsView.hidden = view !== "list";
  els.mapView.hidden = view !== "map";
  if (view === "map") {
    initMapIfNeeded();
    setTimeout(() => state.map && state.map.invalidateSize(), 50);
  }
}

// ---------- Buscar ----------
els.searchBtn.addEventListener("click", runSearch);

async function runSearch() {
  setStatus("");
  els.searchBtn.disabled = true;
  els.searchBtn.classList.add("loading");
  els.searchBtnLabel.textContent = "Ubicándote…";
  showRadarStatus();

  try {
    const pos = await getPosition();
    state.userLat = pos.coords.latitude;
    state.userLon = pos.coords.longitude;

    els.searchBtnLabel.textContent = "Buscando lugares…";
    setStatus("Consultando OpenStreetMap…");

    const cats = state.selected.size > 0 ? [...state.selected] : Object.keys(CATEGORY_DEFS);
    const elements = await queryOverpass(cats, state.userLat, state.userLon, state.radius);

    state.results = buildResults(elements, cats);
    renderResults();
  } catch (err) {
    console.error(err);
    setStatus(errorMessage(err), true);
  } finally {
    els.searchBtn.disabled = false;
    els.searchBtn.classList.remove("loading");
    els.searchBtnLabel.textContent = "Buscar cerca mío";
  }
}

function errorMessage(err) {
  if (err && err.code === 1) return "Necesitamos permiso de ubicación para buscar cerca tuyo.";
  if (err && err.code === 2) return "No pudimos obtener tu ubicación. Probá de nuevo.";
  if (err && err.code === 3) return "Se agotó el tiempo esperando el GPS. Probá de nuevo.";
  if (err && err.message === "overpass-failed") return "No pudimos consultar OpenStreetMap. Probá de nuevo en un momento.";
  return "Algo falló buscando lugares cerca tuyo. Probá de nuevo.";
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("no-geolocation"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
    });
  });
}

function showRadarStatus() {
  els.statusBox.innerHTML = `
    <div class="radar-locate" aria-hidden="true">
      <div class="radar-sweep"></div>
      <div class="radar-dot"></div>
    </div>
    <div>Buscando tu ubicación…</div>
  `;
}

function setStatus(msg, isError = false) {
  els.statusBox.classList.toggle("error", isError);
  els.statusBox.textContent = msg;
}

// ---------- Overpass query ----------
async function queryOverpass(cats, lat, lon, radius) {
  const filterLines = [];
  cats.forEach((cat) => {
    const def = CATEGORY_DEFS[cat];
    if (!def) return;
    def.filters.forEach((f) => {
      filterLines.push(
        f.replace("RADIUS", radius).replace("LAT", lat).replace("LON", lon)
      );
    });
  });

  const query = `[out:json][timeout:25];(${filterLines.join("")});out center tags;`;

  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!res.ok) throw new Error("bad-status");
      const json = await res.json();
      return json.elements || [];
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("overpass-failed");
}

// ---------- Procesar resultados ----------
function buildResults(elements, cats) {
  const items = [];
  const seen = new Set();

  elements.forEach((el) => {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) return;

    const key = `${el.id}`;
    if (seen.has(key)) return;
    seen.add(key);

    const tags = el.tags || {};
    const name = tags.name || "Sin nombre";
    const category = classify(tags, cats);
    const dist = haversine(state.userLat, state.userLon, lat, lon);

    items.push({
      id: el.id,
      name,
      lat,
      lon,
      dist,
      category,
      address: buildAddress(tags),
    });
  });

  items.sort((a, b) => a.dist - b.dist);
  return items;
}

function classify(tags, cats) {
  const cuisine = (tags.cuisine || "").toLowerCase();
  const amenity = tags.amenity;

  if (cats.includes("parrilla") && amenity === "restaurant" && /steak_house|barbecue|grill|argentin/.test(cuisine)) {
    return "parrilla";
  }
  if (cats.includes("pizza") && /pizza/.test(cuisine)) return "pizza";
  if (amenity === "bar" || amenity === "pub") return "bar";
  if (amenity === "cafe") return "cafe";
  if (amenity === "ice_cream") return "heladeria";
  if (amenity === "restaurant") return "restaurante";
  return "restaurante";
}

function buildAddress(tags) {
  const parts = [];
  if (tags["addr:street"]) {
    parts.push(tags["addr:street"] + (tags["addr:housenumber"] ? " " + tags["addr:housenumber"] : ""));
  }
  return parts.join(", ");
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(m, isSlider = false) {
  if (isSlider) {
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
  }
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

// ---------- Render ----------
function renderResults() {
  els.viewToggle.hidden = false;
  setView(state.view);

  if (state.results.length === 0) {
    els.resultsView.innerHTML = `<div class="empty-state">No encontramos lugares en ese radio. Probá ampliar la distancia o cambiar las categorías.</div>`;
    setStatus("");
    updateMapMarkers();
    return;
  }

  setStatus(`${state.results.length} lugares encontrados`);

  els.resultsView.innerHTML = state.results
    .map((p) => {
      const def = CATEGORY_DEFS[p.category] || CATEGORY_DEFS.restaurante;
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
      return `
        <a class="place-card" href="${mapsUrl}" target="_blank" rel="noopener">
          <div class="place-badge ${def.badgeClass}">${def.icon}</div>
          <div class="place-info">
            <p class="place-name">${escapeHtml(p.name)}</p>
            <div class="place-meta">
              <span>${def.label}</span>
              ${p.address ? `<span>${escapeHtml(p.address)}</span>` : ""}
            </div>
          </div>
          <div class="place-dist">${formatDistance(p.dist)}</div>
        </a>
      `;
    })
    .join("");

  updateMapMarkers();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Mapa (Leaflet) ----------
function initMapIfNeeded() {
  if (state.map) return;
  state.map = L.map("map", { zoomControl: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(state.map);
  state.markersLayer = L.layerGroup().addTo(state.map);
  state.map.setView([state.userLat || 0, state.userLon || 0], 15);
}

function updateMapMarkers() {
  if (!state.userLat) return;
  initMapIfNeeded();
  state.markersLayer.clearLayers();

  const userIcon = L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#e8a33d;border:2px solid #141310;box-shadow:0 0 0 4px rgba(232,163,61,0.3);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
  L.marker([state.userLat, state.userLon], { icon: userIcon })
    .addTo(state.markersLayer)
    .bindPopup("<strong>Estás acá</strong>");

  const bounds = [[state.userLat, state.userLon]];

  state.results.forEach((p) => {
    const def = CATEGORY_DEFS[p.category] || CATEGORY_DEFS.restaurante;
    const icon = L.divIcon({
      className: "",
      html: `<div style="font-size:18px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6));">${def.icon}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    L.marker([p.lat, p.lon], { icon })
      .addTo(state.markersLayer)
      .bindPopup(`<strong>${escapeHtml(p.name)}</strong><br>${def.label} · ${formatDistance(p.dist)}`);
    bounds.push([p.lat, p.lon]);
  });

  if (bounds.length > 1) {
    state.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  } else {
    state.map.setView([state.userLat, state.userLon], 15);
  }
}

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed", e));
  });
}
