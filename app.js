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
    badgeClass: "restaurante",
    filters: [`node["amenity"="restaurant"](around:RADIUS,LAT,LON);`],
  },
  pizza: {
    label: "Pizza",
    icon: "🍕",
    badgeClass: "pizza",
    filters: [
      `node["amenity"~"restaurant|fast_food"]["cuisine"~"pizza", i](around:RADIUS,LAT,LON);`,
    ],
  },
  heladeria: {
    label: "Heladería",
    icon: "🍦",
    badgeClass: "heladeria",
    filters: [`node["amenity"="ice_cream"](around:RADIUS,LAT,LON);`],
  },
  panaderia: {
    label: "Panadería",
    icon: "🥐",
    badgeClass: "panaderia",
    filters: [`node["shop"="bakery"](around:RADIUS,LAT,LON);`],
  },
  farmacia: {
    label: "Farmacia",
    icon: "💊",
    badgeClass: "farmacia",
    filters: [`node["amenity"="pharmacy"](around:RADIUS,LAT,LON);`],
  },
  supermercado: {
    label: "Súper",
    icon: "🛒",
    badgeClass: "supermercado",
    filters: [
      `node["shop"="supermarket"](around:RADIUS,LAT,LON);`,
      `node["shop"="convenience"](around:RADIUS,LAT,LON);`,
    ],
  },
  comida_rapida: {
    label: "Rápida",
    icon: "🍔",
    badgeClass: "comida_rapida",
    filters: [`node["amenity"="fast_food"](around:RADIUS,LAT,LON);`],
  },
};

const HISTORY_KEY = "cerca_history_v1";
const DARK_KEY = "cerca_dark_v1";
const HISTORY_LIMIT = 30;

const state = {
  selected: new Set(),
  radius: 1000,
  userLat: null,
  userLon: null,
  results: [],
  view: "list",
  map: null,
  markersLayer: null,
  activeTab: "inicio",
  history: [],
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

  dock: document.getElementById("dock"),
  historyBadge: document.getElementById("historyBadge"),
  viewInicio: document.getElementById("view-inicio"),
  viewBusquedas: document.getElementById("view-busquedas"),
  viewMenu: document.getElementById("view-menu"),
  historyList: document.getElementById("historyList"),

  menuClearHistory: document.getElementById("menuClearHistory"),
  menuShareWhatsapp: document.getElementById("menuShareWhatsapp"),
  menuDarkMode: document.getElementById("menuDarkMode"),
  darkModeToggle: document.getElementById("darkModeToggle"),
  menuAbout: document.getElementById("menuAbout"),
  aboutOverlay: document.getElementById("aboutOverlay"),
  aboutClose: document.getElementById("aboutClose"),
  toast: document.getElementById("toast"),

  sheetOverlay: document.getElementById("placeSheetOverlay"),
  sheet: document.getElementById("placeSheet"),
  sheetClose: document.getElementById("sheetClose"),
  sheetContent: document.getElementById("sheetContent"),
};

// ---------- UI: tarjetas de categoría ----------
els.chips.addEventListener("click", (e) => {
  const card = e.target.closest(".cat-card");
  if (!card) return;
  const cat = card.dataset.cat;
  if (state.selected.has(cat)) {
    state.selected.delete(cat);
    card.classList.remove("selected");
  } else {
    state.selected.add(cat);
    card.classList.add("selected");
  }
});

// ---------- UI: dock inferior ----------
els.dock.addEventListener("click", (e) => {
  const btn = e.target.closest(".dock-item");
  if (!btn) return;
  switchTab(btn.dataset.view);
});

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".dock-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === tab);
  });
  els.viewInicio.hidden = tab !== "inicio";
  els.viewBusquedas.hidden = tab !== "busquedas";
  els.viewMenu.hidden = tab !== "menu";

  if (tab === "busquedas") renderHistory();
  if (tab === "inicio" && state.view === "map") {
    setTimeout(() => state.map && state.map.invalidateSize(), 50);
  }
}

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
els.searchBtn.addEventListener("click", () => runSearch());

async function runSearch(overrides) {
  if (overrides && Array.isArray(overrides.cats)) {
    state.selected = new Set(overrides.cats || []);
    state.radius = overrides.radius || state.radius;
    els.radius.value = state.radius;
    els.radiusValue.textContent = formatDistance(state.radius, true);
    document.querySelectorAll(".cat-card").forEach((card) => {
      card.classList.toggle("selected", state.selected.has(card.dataset.cat));
    });
  }
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

    addHistoryEntry({
      ts: Date.now(),
      cats,
      radius: state.radius,
      count: state.results.length,
      lat: state.userLat,
      lon: state.userLon,
    });
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
      contact: buildContact(tags),
    });
  });

  items.sort((a, b) => a.dist - b.dist);
  return items;
}

// Extrae teléfono, web, redes, horario y foto (si están mapeados en OSM)
function buildContact(tags) {
  const phone = tags.phone || tags["contact:phone"] || tags["contact:mobile"] || "";
  const website = tags.website || tags["contact:website"] || tags.url || "";
  const email = tags.email || tags["contact:email"] || "";
  const instagram = normalizeSocial(tags.instagram || tags["contact:instagram"], "instagram.com");
  const facebook = normalizeSocial(tags.facebook || tags["contact:facebook"], "facebook.com");
  const opening = tags.opening_hours || "";
  const photo = photoUrl(tags);
  return { phone, website, email, instagram, facebook, opening, photo };
}

// Acepta tanto usuarios sueltos ("@lugar") como URLs completas y devuelve
// siempre una URL absoluta a la red social.
function normalizeSocial(value, domain) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const handle = value.replace(/^@/, "").trim();
  if (!handle) return "";
  return `https://${domain}/${handle}`;
}

// Foto real del lugar vía Wikimedia Commons (licencia libre) si está
// mapeada en OSM (tag "image" o "wikimedia_commons"). Sin esto, no hay foto.
function photoUrl(tags) {
  if (tags.image && /^https?:\/\//i.test(tags.image)) return tags.image;
  if (tags.wikimedia_commons) {
    const name = tags.wikimedia_commons.replace(/^File:/i, "");
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=640`;
  }
  return "";
}

function classify(tags, cats) {
  const cuisine = (tags.cuisine || "").toLowerCase();
  const amenity = tags.amenity;
  const shop = tags.shop;

  if (cats.includes("parrilla") && amenity === "restaurant" && /steak_house|barbecue|grill|argentin/.test(cuisine)) {
    return "parrilla";
  }
  if (cats.includes("pizza") && /pizza/.test(cuisine)) return "pizza";
  if (amenity === "bar" || amenity === "pub") return "bar";
  if (amenity === "cafe") return "cafe";
  if (amenity === "ice_cream") return "heladeria";
  if (shop === "bakery") return "panaderia";
  if (amenity === "pharmacy") return "farmacia";
  if (shop === "supermarket" || shop === "convenience") return "supermercado";
  if (amenity === "fast_food") return "comida_rapida";
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
    .map((p, idx) => {
      const def = CATEGORY_DEFS[p.category] || CATEGORY_DEFS.restaurante;
      const c = p.contact || {};
      const iconRow = [
        c.phone ? "📞" : "",
        c.website ? "🌐" : "",
        c.instagram ? "📷" : "",
        c.facebook ? "👍" : "",
      ].filter(Boolean).join(" ");
      return `
        <button class="place-card" type="button" data-idx="${idx}">
          ${c.photo ? `<div class="place-thumb" style="background-image:url('${c.photo}')"></div>` : `<div class="place-badge ${def.badgeClass}">${def.icon}</div>`}
          <div class="place-info">
            <p class="place-name">${escapeHtml(p.name)}</p>
            <div class="place-meta">
              <span>${def.label}</span>
              ${p.address ? `<span>${escapeHtml(p.address)}</span>` : ""}
              ${iconRow ? `<span class="place-icons">${iconRow}</span>` : ""}
            </div>
          </div>
          <div class="place-dist">${formatDistance(p.dist)}</div>
        </button>
      `;
    })
    .join("");

  updateMapMarkers();
}

// ---------- Ficha de detalle (bottom sheet) ----------
els.resultsView.addEventListener("click", (e) => {
  const card = e.target.closest(".place-card");
  if (!card) return;
  const p = state.results[Number(card.dataset.idx)];
  if (p) openPlaceSheet(p);
});

function openPlaceSheet(p) {
  const def = CATEGORY_DEFS[p.category] || CATEGORY_DEFS.restaurante;
  const c = p.contact || {};
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;

  const actions = [];
  actions.push(`<a class="sheet-action primary" href="${mapsUrl}" target="_blank" rel="noopener"><span>🧭</span>Cómo llegar</a>`);
  if (c.phone) actions.push(`<a class="sheet-action" href="tel:${escapeHtml(c.phone.replace(/\s+/g, ""))}"><span>📞</span>Llamar</a>`);
  if (c.website) actions.push(`<a class="sheet-action" href="${escapeHtml(c.website)}" target="_blank" rel="noopener"><span>🌐</span>Web</a>`);
  if (c.instagram) actions.push(`<a class="sheet-action" href="${escapeHtml(c.instagram)}" target="_blank" rel="noopener"><span>📷</span>Instagram</a>`);
  if (c.facebook) actions.push(`<a class="sheet-action" href="${escapeHtml(c.facebook)}" target="_blank" rel="noopener"><span>👍</span>Facebook</a>`);
  actions.push(`<button class="sheet-action" id="sheetShareBtn" type="button"><span>📲</span>Compartir</button>`);

  els.sheetContent.innerHTML = `
    ${c.photo
      ? `<div class="sheet-photo" style="background-image:url('${c.photo}')"></div>`
      : `<div class="sheet-photo sheet-photo-placeholder ${def.badgeClass}"><span>${def.icon}</span></div>`}
    <div class="sheet-header">
      <div class="place-badge ${def.badgeClass}">${def.icon}</div>
      <div class="sheet-title-wrap">
        <h3 class="sheet-title">${escapeHtml(p.name)}</h3>
        <p class="sheet-subtitle">${def.label} · ${formatDistance(p.dist)}${p.address ? " · " + escapeHtml(p.address) : ""}</p>
      </div>
    </div>
    ${c.opening ? `<p class="sheet-hours">🕒 ${escapeHtml(c.opening)}</p>` : ""}
    <div class="sheet-actions">${actions.join("")}</div>
    ${(!c.phone && !c.website && !c.instagram && !c.facebook) ? `<p class="sheet-empty-note">Este lugar todavía no tiene datos de contacto cargados en OpenStreetMap.</p>` : ""}
  `;

  els.sheetOverlay.hidden = false;
  requestAnimationFrame(() => els.sheetOverlay.classList.add("open"));

  const shareBtn = document.getElementById("sheetShareBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => sharePlace(p));
  }
}

function closePlaceSheet() {
  els.sheetOverlay.classList.remove("open");
  setTimeout(() => { els.sheetOverlay.hidden = true; }, 220);
}

els.sheetClose.addEventListener("click", closePlaceSheet);
els.sheetOverlay.addEventListener("click", (e) => {
  if (e.target === els.sheetOverlay) closePlaceSheet();
});

async function sharePlace(p) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
  const text = `${p.name} — ${formatDistance(p.dist)}\n${mapsUrl}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: p.name, text });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
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
    html: `<div style="width:16px;height:16px;border-radius:50%;background:#0A84FF;border:2px solid #fff;box-shadow:0 0 0 4px rgba(10,132,255,0.25);"></div>`,
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

// ---------- Historial de búsquedas ----------
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveHistoryList(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("No se pudo guardar el historial", e);
  }
}

function addHistoryEntry(entry) {
  state.history.unshift(entry);
  if (state.history.length > HISTORY_LIMIT) {
    state.history = state.history.slice(0, HISTORY_LIMIT);
  }
  saveHistoryList(state.history);
  updateHistoryBadge();
  if (state.activeTab === "busquedas") renderHistory();
}

function clearHistory() {
  state.history = [];
  saveHistoryList(state.history);
  updateHistoryBadge();
  renderHistory();
}

function updateHistoryBadge() {
  const n = state.history.length;
  els.historyBadge.hidden = n === 0;
  els.historyBadge.textContent = n > 99 ? "99+" : String(n);
}

function renderHistory() {
  if (state.history.length === 0) {
    els.historyList.innerHTML = `<div class="empty-history">Todavía no hiciste ninguna búsqueda.<br>Buscá lugares desde Inicio y van a aparecer acá.</div>`;
    return;
  }

  els.historyList.innerHTML = state.history
    .map((entry, idx) => {
      const catList = entry.cats && entry.cats.length ? entry.cats : Object.keys(CATEGORY_DEFS);
      const icons = catList
        .slice(0, 4)
        .map((c) => (CATEGORY_DEFS[c] ? CATEGORY_DEFS[c].icon : ""))
        .join(" ");
      const labels = catList.map((c) => (CATEGORY_DEFS[c] ? CATEGORY_DEFS[c].label : c)).join(", ");
      return `
        <button class="history-card" data-idx="${idx}">
          <span class="history-icons">${icons || "🔎"}</span>
          <span class="history-info">
            <p class="history-title">${escapeHtml(labels || "Todas las categorías")}</p>
            <span class="history-meta">
              <span>${formatDistance(entry.radius, true)}</span>
              <span>${entry.count} resultado${entry.count === 1 ? "" : "s"}</span>
            </span>
          </span>
          <span class="history-time">${formatRelativeTime(entry.ts)}</span>
          <span class="history-replay" aria-hidden="true">↻</span>
        </button>
      `;
    })
    .join("");
}

els.historyList.addEventListener("click", (e) => {
  const card = e.target.closest(".history-card");
  if (!card) return;
  const entry = state.history[Number(card.dataset.idx)];
  if (!entry) return;
  switchTab("inicio");
  runSearch({ cats: entry.cats, radius: entry.radius });
});

function formatRelativeTime(ts) {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const hs = Math.floor(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  const days = Math.floor(hs / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(ts).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

// ---------- Menú ----------
els.menuClearHistory.addEventListener("click", () => {
  if (state.history.length === 0) {
    showToast("El historial ya está vacío");
    return;
  }
  if (confirm("¿Borrar todo tu historial de búsqueda? Esta acción no se puede deshacer.")) {
    clearHistory();
    showToast("Historial borrado");
  }
});

els.menuShareWhatsapp.addEventListener("click", shareWhatsApp);

function buildShareText() {
  const appUrl = window.location.href;
  if (state.results.length > 0) {
    const top = state.results.slice(0, 5);
    const lines = top.map((p) => {
      const def = CATEGORY_DEFS[p.category] || CATEGORY_DEFS.restaurante;
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
      return `${def.icon} ${p.name} — ${formatDistance(p.dist)}\n${mapsUrl}`;
    });
    return `Encontré estos lugares cerca con Cerca 📍:\n\n${lines.join("\n\n")}\n\nBuscá vos también 👉 ${appUrl}`;
  }
  return `Mirá esta app para encontrar bares, cafés, parrillas y más cerca tuyo 📍\n${appUrl}`;
}

async function shareWhatsApp() {
  const appUrl = window.location.href;
  const text = buildShareText();

  // 1) Intento con Web Share API nativo: permite adjuntar la imagen de la app
  //    junto con el texto y elegir WhatsApp desde el selector del sistema.
  if (navigator.share) {
    try {
      let file = null;
      try {
        const resp = await fetch("icons/icon-512.png");
        const blob = await resp.blob();
        const candidate = new File([blob], "cerca.png", { type: blob.type || "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [candidate] })) {
          file = candidate;
        }
      } catch (imgErr) {
        console.warn("No se pudo adjuntar la imagen", imgErr);
      }

      const shareData = file
        ? { title: "Cerca", text, files: [file] }
        : { title: "Cerca", text, url: appUrl };

      await navigator.share(shareData);
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return; // el usuario canceló, no hacer fallback
    }
  }

  // 2) Fallback: link directo a WhatsApp Web/app (solo texto, sin imagen —
  //    wa.me no admite adjuntar archivos, es una limitación de WhatsApp).
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener");
}

// ---------- Modo oscuro ----------
function loadDarkPreference() {
  return localStorage.getItem(DARK_KEY) === "1";
}

function setDarkMode(on) {
  document.body.classList.toggle("dark", on);
  els.darkModeToggle.classList.toggle("on", on);
  try {
    localStorage.setItem(DARK_KEY, on ? "1" : "0");
  } catch (e) {}
}

els.menuDarkMode.addEventListener("click", () => {
  const isOn = !document.body.classList.contains("dark");
  setDarkMode(isOn);
});

// ---------- Acerca de (modal) ----------
els.menuAbout.addEventListener("click", () => {
  els.aboutOverlay.hidden = false;
});
els.aboutClose.addEventListener("click", () => {
  els.aboutOverlay.hidden = true;
});
els.aboutOverlay.addEventListener("click", (e) => {
  if (e.target === els.aboutOverlay) els.aboutOverlay.hidden = true;
});

// ---------- Toast ----------
let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2200);
}

// ---------- Init ----------
state.history = loadHistory();
updateHistoryBadge();
setDarkMode(loadDarkPreference());

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed", e));
  });
}
