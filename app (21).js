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
  estacion_servicio: {
    label: "Estación",
    icon: "⛽",
    badgeClass: "estacion_servicio",
    filters: [`node["amenity"="fuel"](around:RADIUS,LAT,LON);`],
  },
  kiosco: {
    label: "Kiosco",
    icon: "🏪",
    badgeClass: "kiosco",
    filters: [`node["shop"="kiosk"](around:RADIUS,LAT,LON);`, `node["shop"="convenience"]["name"](around:RADIUS,LAT,LON);`],
  },
};

// Nota: OSM no distingue "farmacia de turno" (guardia) — ese dato no está
// mapeado de forma estándar en ningún país, así que no se puede filtrar
// automáticamente. Mostramos todas las farmacias; el usuario puede fijarse
// el cartel de turno en el lugar.

const HISTORY_KEY = "cerca_history_v1";
const DARK_KEY = "cerca_dark_v1";
const FAVORITES_KEY = "cerca_favorites_v1";
const NOTES_KEY = "cerca_notes_v1";
const SAVED_SEARCHES_KEY = "cerca_saved_searches_v1";
const SETTINGS_KEY = "cerca_settings_v1";
const CAR_KEY = "cerca_car_v1";
const SUGGESTION_KEY = "cerca_suggestion_v1";
const ZONE_CACHE_KEY = "cerca_zone_cache_v1";
const LAST_RESULT_KEY = "cerca_last_result_v1";
const ONBOARDING_KEY = "cerca_onboarding_seen_v1";
const HISTORY_LIMIT = 30;
const ZONE_CACHE_TTL_MS = 8 * 60 * 1000; // 8 minutos: evita repegarle a Overpass en la misma zona
const ZONE_CACHE_MAX_ENTRIES = 15;
const LOW_RESULTS_THRESHOLD = 3;

const ACCENTS = {
  amber:  { accent: "#F5A623", glow: "rgba(245,166,35,0.35)", dim: "rgba(245,166,35,0.15)", border: "rgba(245,166,35,0.28)", glass: "rgba(245,166,35,0.6)" },
  blue:   { accent: "#0A84FF", glow: "rgba(10,132,255,0.35)",  dim: "rgba(10,132,255,0.15)",  border: "rgba(10,132,255,0.28)", glass: "rgba(10,132,255,0.6)" },
  pink:   { accent: "#FF4D7E", glow: "rgba(255,77,126,0.35)",  dim: "rgba(255,77,126,0.15)",  border: "rgba(255,77,126,0.28)", glass: "rgba(255,77,126,0.6)" },
  green:  { accent: "#3DD68C", glow: "rgba(61,214,140,0.35)",  dim: "rgba(61,214,140,0.15)",  border: "rgba(61,214,140,0.28)", glass: "rgba(61,214,140,0.6)" },
  purple: { accent: "#C778DD", glow: "rgba(199,120,221,0.35)", dim: "rgba(199,120,221,0.15)", border: "rgba(199,120,221,0.28)", glass: "rgba(199,120,221,0.6)" },
  teal:   { accent: "#38C4E0", glow: "rgba(56,196,224,0.35)",  dim: "rgba(56,196,224,0.15)",  border: "rgba(56,196,224,0.28)", glass: "rgba(56,196,224,0.6)" },
};

const state = {
  selected: new Set(),
  radius: 1000,
  userLat: null,
  userLon: null,
  results: [],
  filteredResults: [],
  view: "list",
  map: null,
  markersLayer: null,
  clusterLayer: null,
  activeTab: "inicio",
  history: [],
  favorites: [],
  notes: {},
  savedSearches: [],
  settings: { defaultRadius: null, defaultCats: null, accent: "amber", sortBy: "dist", openNowOnly: false },
  searchText: "",
  car: null,
  mapCatFilter: new Set(),
  lastQuery: null,
  lastSearchWasCache: false,
  lastSearchWasOffline: false,
  compareMode: false,
  compareSelection: [],
};

const els = {
  chips: document.getElementById("categoryChips"),
  radius: document.getElementById("radius"),
  radiusValue: document.getElementById("radiusValue"),
  searchBtn: document.getElementById("searchBtn"),
  searchBtnLabel: document.getElementById("searchBtnLabel"),
  statusBox: document.getElementById("statusBox"),
  viewToggle: document.getElementById("viewToggle"),
  viewToggleThumb: document.getElementById("viewToggleThumb"),
  resultsView: document.getElementById("resultsView"),
  mapView: document.getElementById("mapView"),

  dock: document.getElementById("dock"),
  dockThumb: document.getElementById("dockThumb"),
  historyBadge: document.getElementById("historyBadge"),
  favBadge: document.getElementById("favBadge"),
  viewInicio: document.getElementById("view-inicio"),
  viewBusquedas: document.getElementById("view-busquedas"),
  viewFavoritos: document.getElementById("view-favoritos"),
  viewMenu: document.getElementById("view-menu"),
  historyList: document.getElementById("historyList"),
  savedSearchesList: document.getElementById("savedSearchesList"),
  savedSearchesTitle: document.getElementById("savedSearchesTitle"),
  favoritesList: document.getElementById("favoritesList"),
  compareToggleBtn: document.getElementById("compareToggleBtn"),
  compareBarBtn: document.getElementById("compareBarBtn"),
  compareCount: document.getElementById("compareCount"),
  compareOverlay: document.getElementById("compareOverlay"),
  compareSheet: document.getElementById("compareSheet"),
  compareClose: document.getElementById("compareClose"),
  compareContent: document.getElementById("compareContent"),

  suggestionBtn: document.getElementById("suggestionBtn"),
  suggestionSub: document.getElementById("suggestionSub"),

  resultsToolbar: document.getElementById("resultsToolbar"),
  resultsStatus: document.getElementById("resultsStatus"),
  busquedasIntro: document.getElementById("busquedasIntro"),
  searchText: document.getElementById("searchText"),
  sortSelect: document.getElementById("sortSelect"),
  openNowToggle: document.getElementById("openNowToggle"),
  mapCatFilter: document.getElementById("mapCatFilter"),

  menuClearHistory: document.getElementById("menuClearHistory"),
  menuShareWhatsapp: document.getElementById("menuShareWhatsapp"),
  menuCopyLink: document.getElementById("menuCopyLink"),
  menuExportFavorites: document.getElementById("menuExportFavorites"),
  menuImportFavorites: document.getElementById("menuImportFavorites"),
  importFavoritesInput: document.getElementById("importFavoritesInput"),
  menuCar: document.getElementById("menuCar"),
  menuCarTitle: document.getElementById("menuCarTitle"),
  menuCarDesc: document.getElementById("menuCarDesc"),
  menuDarkMode: document.getElementById("menuDarkMode"),
  darkModeToggle: document.getElementById("darkModeToggle"),
  menuAbout: document.getElementById("menuAbout"),
  aboutOverlay: document.getElementById("aboutOverlay"),
  aboutClose: document.getElementById("aboutClose"),
  onboardingOverlay: document.getElementById("onboardingOverlay"),
  onboardingClose: document.getElementById("onboardingClose"),
  accentSwatches: document.getElementById("accentSwatches"),
  toast: document.getElementById("toast"),

  sheetOverlay: document.getElementById("placeSheetOverlay"),
  sheet: document.getElementById("placeSheet"),
  sheetClose: document.getElementById("sheetClose"),
  sheetContent: document.getElementById("sheetContent"),
};

// ---------- UI: thumb deslizante de vidrio (dock / view-toggle) ----------
function slideGlassThumb(container, thumb, activeBtn) {
  if (!container || !thumb || !activeBtn) return;
  const cRect = container.getBoundingClientRect();
  const bRect = activeBtn.getBoundingClientRect();
  const x = bRect.left - cRect.left;
  thumb.style.width = `${bRect.width}px`;
  thumb.style.transform = `translateX(${x}px)`;
}
window.addEventListener("resize", () => {
  const activeDock = els.dock.querySelector(".dock-item.active");
  if (activeDock) slideGlassThumb(els.dock, els.dockThumb, activeDock);
  const activeToggle = els.viewToggle.querySelector(".toggle-btn.active");
  if (activeToggle && !els.viewToggle.hidden) slideGlassThumb(els.viewToggle, els.viewToggleThumb, activeToggle);
});

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
  const activeDock = els.dock.querySelector(".dock-item.active");
  slideGlassThumb(els.dock, els.dockThumb, activeDock);
  els.viewInicio.hidden = tab !== "inicio";
  els.viewBusquedas.hidden = tab !== "busquedas";
  els.viewFavoritos.hidden = tab !== "favoritos";
  els.viewMenu.hidden = tab !== "menu";

  if (tab === "busquedas") { renderHistory(); renderSavedSearches(); }
  if (tab === "favoritos") renderFavorites();
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
  const activeToggle = els.viewToggle.querySelector(".toggle-btn.active");
  slideGlassThumb(els.viewToggle, els.viewToggleThumb, activeToggle);
  els.resultsView.hidden = view !== "list";
  els.mapView.hidden = view !== "map";
  const shown = view === "list" ? els.resultsView : els.mapView;
  shown.classList.remove("view-fade-in");
  void shown.offsetWidth;
  shown.classList.add("view-fade-in");
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

    const cats = state.selected.size > 0 ? [...state.selected] : Object.keys(CATEGORY_DEFS);
    state.lastQuery = { cats, radius: state.radius };
    state.lastSearchWasCache = false;
    state.lastSearchWasOffline = false;

    const cacheKey = zoneCacheKey(state.userLat, state.userLon, state.radius, cats);
    const cached = getZoneCacheEntry(cacheKey);

    let elements;
    if (cached) {
      elements = cached.elements;
      state.lastSearchWasCache = true;
    } else {
      showResultsSkeleton();
      setStatus("Consultando OpenStreetMap…");
      try {
        elements = await queryOverpass(cats, state.userLat, state.userLon, state.radius);
        setZoneCacheEntry(cacheKey, elements);
        saveLastResult({ cats, radius: state.radius, lat: state.userLat, lon: state.userLon, elements });
      } catch (err) {
        const fallback = loadLastResult();
        if (fallback && (!navigator.onLine || err.message === "overpass-failed")) {
          elements = fallback.elements;
          state.lastSearchWasOffline = true;
        } else {
          throw err;
        }
      }
    }

    state.results = buildResults(elements, cats);
    state.mapCatFilter = new Set(cats);
    if (els.searchText) els.searchText.value = "";
    state.searchText = "";
    renderResults();

    if (state.lastSearchWasCache) {
      setStatus("Resultados desde caché (misma zona hace poco, no volvimos a consultar OSM)", "cached");
    } else if (state.lastSearchWasOffline) {
      setStatus("Sin conexión: te mostramos tu última búsqueda guardada", "offline");
    } else {
      setStatus("");
    }

    state.settings.defaultRadius = state.radius;
    state.settings.defaultCats = cats;
    saveSettings();

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
    setStatus(errorMessage(err), "error");
    showToast(errorMessage(err));
    if (!els.resultsView.hidden && els.resultsView.querySelector(".skeleton-card")) {
      els.resultsView.innerHTML = `<div class="empty-state">${escapeHtml(errorMessage(err))}</div>`;
    }
  } finally {
    els.searchBtn.disabled = false;
    els.searchBtn.classList.remove("loading");
    els.searchBtnLabel.textContent = "Buscar cerca mío";
  }
}

// ---------- Skeleton loader mientras esperamos Overpass ----------
function showResultsSkeleton(count = 6) {
  els.viewToggle.hidden = true;
  els.resultsToolbar.hidden = true;
  els.resultsStatus.hidden = true;
  if (els.busquedasIntro) els.busquedasIntro.hidden = true;
  els.mapView.hidden = true;
  els.resultsView.hidden = false;
  els.resultsView.innerHTML = Array.from({ length: count })
    .map(
      () => `
        <div class="place-card skeleton-card" aria-hidden="true">
          <div class="place-thumb skeleton-block"></div>
          <div class="place-info">
            <div class="skeleton-line skeleton-line-title"></div>
            <div class="skeleton-line skeleton-line-sub"></div>
          </div>
        </div>
      `
    )
    .join("");
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
    <div class="locate-anim" aria-hidden="true">
      <div class="locate-ring"></div>
      <div class="locate-ring"></div>
      <div class="locate-ring"></div>
      <div class="locate-orbit"></div>
      <div class="locate-satellite"></div>
      <div class="locate-core"></div>
    </div>
    <div class="locate-label">Buscando tu ubicación…</div>
  `;
}

function setStatus(msg, variant) {
  els.statusBox.classList.remove("error", "cached", "offline");
  if (variant) els.statusBox.classList.add(variant);
  if (variant === "cached") {
    els.statusBox.innerHTML = `<span aria-hidden="true">⚡</span><span>${escapeHtml(msg)}</span>`;
  } else if (variant === "offline") {
    els.statusBox.innerHTML = `<span aria-hidden="true">📴</span><span>${escapeHtml(msg)}</span>`;
  } else {
    els.statusBox.textContent = msg;
  }
}

// ---------- Caché de resultados por zona ----------
// Evita repegarle a Overpass si el usuario busca dos veces en la misma zona
// (mismo radio/categorías) en poco tiempo. También guardamos el último
// resultado exitoso "a secas" para poder mostrar algo si no hay conexión.
function roundCoord(v) {
  // ~110m de grilla: suficiente para considerar "la misma zona"
  return Math.round(v * 1000) / 1000;
}

function zoneCacheKey(lat, lon, radius, cats) {
  return `${roundCoord(lat)},${roundCoord(lon)}|${radius}|${[...cats].sort().join(",")}`;
}

function loadZoneCache() {
  try {
    const raw = localStorage.getItem(ZONE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function saveZoneCacheMap(cache) {
  try { localStorage.setItem(ZONE_CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
}

function getZoneCacheEntry(key) {
  const cache = loadZoneCache();
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > ZONE_CACHE_TTL_MS) return null;
  return entry;
}

function setZoneCacheEntry(key, elements) {
  const cache = loadZoneCache();
  cache[key] = { ts: Date.now(), elements };
  const keys = Object.keys(cache);
  if (keys.length > ZONE_CACHE_MAX_ENTRIES) {
    keys.sort((a, b) => cache[a].ts - cache[b].ts);
    delete cache[keys[0]];
  }
  saveZoneCacheMap(cache);
}

function saveLastResult(payload) {
  try {
    localStorage.setItem(LAST_RESULT_KEY, JSON.stringify({ ...payload, ts: Date.now() }));
  } catch (e) {}
}

function loadLastResult() {
  try {
    const raw = localStorage.getItem(LAST_RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
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

  // Consultamos todos los espejos de Overpass en paralelo y nos quedamos con
  // el primero que responda bien (Promise.any), en vez de ir secuencial:
  // así no dependemos de que el primer endpoint de la lista esté saturado.
  const attempts = OVERPASS_ENDPOINTS.map((endpoint) =>
    fetch(endpoint, {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
      .then((res) => {
        if (!res.ok) throw new Error("bad-status");
        return res.json();
      })
      .then((json) => json.elements || [])
  );

  try {
    return await Promise.any(attempts);
  } catch (e) {
    throw new Error("overpass-failed");
  }
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
      rating: buildRating(tags),
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
  if (amenity === "fuel") return "estacion_servicio";
  if (shop === "kiosk") return "kiosco";
  if (shop === "convenience") return "kiosco";
  if (amenity === "restaurant") return "restaurante";
  return "restaurante";
}

// Rating/reseña si está mapeado en OSM (poco frecuente, pero existe)
function buildRating(tags) {
  const raw = tags.stars || tags.rating || tags["review:stars"];
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(",", "."));
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(5, n));
}

// ---------- Horarios: parser simple de opening_hours (OSM) ----------
const DOW_MAP = { mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, su: 0 };
function isOpenNow(openingHours, now = new Date()) {
  if (!openingHours) return null; // sin dato: no filtramos
  const raw = openingHours.trim();
  if (/24\/7/i.test(raw)) return true;
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();

  // Separa por ";" y evalúa cada regla; la última regla que matchea el día manda.
  const rules = raw.split(";").map((r) => r.trim()).filter(Boolean);
  let result = null;
  for (const rule of rules) {
    const m = rule.match(/^([a-zA-Z,\-]+)?\s*(.*)$/);
    if (!m) continue;
    const dowPart = m[1];
    const rest = m[2] || "";
    if (/off|closed/i.test(rest) && !/\d/.test(rest)) {
      if (!dowPart || matchesDow(dowPart, day)) result = false;
      continue;
    }
    if (!dowPart || matchesDow(dowPart, day)) {
      const ranges = rest.match(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/g);
      if (!ranges) continue;
      const open = ranges.some((r) => {
        const [start, end] = r.split("-").map((t) => t.trim());
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        const startMin = sh * 60 + sm;
        let endMin = eh * 60 + em;
        if (endMin <= startMin) endMin += 24 * 60; // cruza medianoche
        return minutes >= startMin && minutes <= endMin;
      });
      result = open;
    }
  }
  return result; // null = no se pudo determinar (no filtra)
}

function matchesDow(dowPart, day) {
  if (!dowPart) return true;
  const parts = dowPart.toLowerCase().split(",");
  return parts.some((p) => {
    if (p.includes("-")) {
      const [a, b] = p.split("-");
      const da = DOW_MAP[a], db = DOW_MAP[b];
      if (da == null || db == null) return false;
      if (da <= db) return day >= da && day <= db;
      return day >= da || day <= db; // rango que cruza la semana (ej. Fr-Su... raro)
    }
    return DOW_MAP[p] === day;
  });
}

function buildAddress(tags) {
  const parts = [];
  if (tags["addr:street"]) {
    parts.push(tags["addr:street"] + (tags["addr:housenumber"] ? " " + tags["addr:housenumber"] : ""));
  }
  return parts.join(", ");
}

// ---------- Nominatim: dirección completa on-demand ----------
// Solo se llama al abrir la ficha de un lugar (no en la búsqueda general) para
// respetar el límite de uso de Nominatim (~1 req/seg) y no gastar de más.
const geocodeCache = new Map();
async function reverseGeocode(lat, lon) {
  const key = `${roundCoord(lat)},${roundCoord(lon)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { "Accept-Language": "es" } });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    const street = a.road || a.pedestrian || a.footway || a.path || "";
    const number = a.house_number || "";
    const area = a.suburb || a.neighbourhood || a.city_district || "";
    const parts = [street ? street + (number ? " " + number : "") : "", area].filter(Boolean);
    const result = parts.join(", ") || null;
    geocodeCache.set(key, result);
    return result;
  } catch (e) {
    return null;
  }
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
function applyFiltersAndSort() {
  let list = state.results.slice();

  if (state.searchText) {
    const q = state.searchText.toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(q));
  }

  if (state.settings.openNowOnly) {
    list = list.filter((p) => isOpenNow(p.contact && p.contact.opening) !== false);
  }

  const sortBy = state.settings.sortBy || "dist";
  if (sortBy === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name, "es"));
  } else if (sortBy === "category") {
    list.sort((a, b) => {
      const la = (CATEGORY_DEFS[a.category] || {}).label || a.category;
      const lb = (CATEGORY_DEFS[b.category] || {}).label || b.category;
      return la.localeCompare(lb, "es") || a.dist - b.dist;
    });
  } else {
    list.sort((a, b) => a.dist - b.dist);
  }

  state.filteredResults = list;
  return list;
}

function renderResults() {
  els.viewToggle.hidden = false;
  els.resultsToolbar.hidden = false;
  els.resultsStatus.hidden = false;
  if (els.busquedasIntro) els.busquedasIntro.hidden = true;
  setView(state.view);
  renderMapCatFilter();

  const expandBanner = radiusSuggestionBanner();

  if (state.results.length === 0) {
    els.resultsView.innerHTML = `<div class="empty-state">No encontramos lugares en ese radio. Probá ampliar la distancia o cambiar las categorías.${expandBanner ? `<br><br>${expandBanner}` : ""}</div>`;
    els.resultsStatus.textContent = "";
    updateMapMarkers();
    return;
  }

  const list = applyFiltersAndSort();

  if (list.length === 0) {
    els.resultsView.innerHTML = `<div class="empty-state">Ningún resultado coincide con el filtro actual.</div>`;
    els.resultsStatus.textContent = `${state.results.length} lugares encontrados · 0 visibles`;
    updateMapMarkers();
    return;
  }

  els.resultsStatus.textContent = list.length === state.results.length
    ? `${state.results.length} lugares encontrados`
    : `${list.length} de ${state.results.length} lugares`;

  els.resultsView.innerHTML = (expandBanner || "") + list
    .map((p, i) => {
      const def = CATEGORY_DEFS[p.category] || CATEGORY_DEFS.restaurante;
      const c = p.contact || {};
      const isFav = isFavorite(p.id);
      const iconRow = [
        c.phone ? "📞" : "",
        c.website ? "🌐" : "",
        c.instagram ? "📷" : "",
        c.facebook ? "👍" : "",
      ].filter(Boolean).join(" ");
      const delay = Math.min(i, 10) * 0.035;
      return `
        <button class="place-card card-enter" type="button" data-id="${p.id}" style="animation-delay:${delay}s">
          ${c.photo ? `<div class="place-thumb"><img src="${c.photo}" alt="" loading="lazy" decoding="async" /></div>` : `<div class="place-badge ${def.badgeClass}">${def.icon}</div>`}
          <div class="place-info">
            <p class="place-name">${escapeHtml(p.name)}</p>
            <div class="place-meta">
              <span>${def.label}</span>
              ${p.rating != null ? `<span class="place-rating">⭐ ${p.rating.toFixed(1)}</span>` : ""}
              ${p.address ? `<span>${escapeHtml(p.address)}</span>` : ""}
              ${iconRow ? `<span class="place-icons">${iconRow}</span>` : ""}
            </div>
          </div>
          <div class="place-dist">${formatDistance(p.dist)}</div>
          <button class="fav-star ${isFav ? "on" : ""}" type="button" data-fav-id="${p.id}" aria-label="Favorito">${isFav ? "★" : "☆"}</button>
        </button>
      `;
    })
    .join("");

  updateMapMarkers();
}

// ---------- Sugerencia de ampliar radio cuando hay pocos resultados ----------
function radiusSuggestionBanner() {
  if (state.radius >= 5000) return "";
  if (state.results.length === 0 || state.results.length < LOW_RESULTS_THRESHOLD) {
    const next = Math.min(5000, state.radius * 2);
    return `
      <div class="results-banner">
        <span>${state.results.length === 0 ? "Casi no hay resultados por acá." : "Encontramos pocos lugares."} Probá con más radio.</span>
        <button type="button" data-action="expand-radius" data-radius="${next}">Ampliar a ${formatDistance(next, true)}</button>
      </div>
    `;
  }
  return "";
}

function expandRadiusAndSearch(newRadius) {
  state.radius = newRadius;
  els.radius.value = newRadius;
  els.radiusValue.textContent = formatDistance(newRadius, true);
  runSearch();
}

function findPlaceById(id) {
  return state.results.find((p) => String(p.id) === String(id))
    || state.filteredResults.find((p) => String(p.id) === String(id));
}

// ---------- Ficha de detalle (bottom sheet) ----------
els.resultsView.addEventListener("click", (e) => {
  const expandBtn = e.target.closest("[data-action='expand-radius']");
  if (expandBtn) {
    e.stopPropagation();
    expandRadiusAndSearch(Number(expandBtn.dataset.radius));
    return;
  }
  const star = e.target.closest(".fav-star");
  if (star) {
    e.stopPropagation();
    const p = findPlaceById(star.dataset.favId);
    if (p) toggleFavorite(p, star);
    return;
  }
  const card = e.target.closest(".place-card");
  if (!card) return;
  const p = findPlaceById(card.dataset.id);
  if (p) openPlaceSheet(p);
});

// ---------- Toolbar: texto, orden, abierto ahora ----------
let searchTextTimer = null;
els.searchText.addEventListener("input", () => {
  clearTimeout(searchTextTimer);
  searchTextTimer = setTimeout(() => {
    state.searchText = els.searchText.value.trim();
    renderResults();
  }, 180);
});

els.sortSelect.addEventListener("change", () => {
  state.settings.sortBy = els.sortSelect.value;
  saveSettings();
  renderResults();
});

els.openNowToggle.addEventListener("click", () => {
  state.settings.openNowOnly = !state.settings.openNowOnly;
  els.openNowToggle.classList.toggle("on", state.settings.openNowOnly);
  saveSettings();
  renderResults();
});

// ---------- Foco accesible del bottom sheet ----------
let sheetTriggerEl = null;
function openSheetOverlay() {
  sheetTriggerEl = document.activeElement;
  els.sheetOverlay.hidden = false;
  requestAnimationFrame(() => {
    els.sheetOverlay.classList.add("open");
    els.sheetClose.focus();
  });
}

function openPlaceSheet(p) {
  const def = CATEGORY_DEFS[p.category] || CATEGORY_DEFS.restaurante;
  const c = p.contact || {};
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
  const openState = isOpenNow(c.opening);
  const isFav = isFavorite(p.id);

  const actions = [];
  actions.push(`<a class="sheet-action primary" href="${mapsUrl}" target="_blank" rel="noopener"><span>🧭</span>Cómo llegar</a>`);
  if (c.phone) actions.push(`<a class="sheet-action" href="tel:${escapeHtml(c.phone.replace(/\s+/g, ""))}"><span>📞</span>Llamar</a>`);
  if (c.website) actions.push(`<a class="sheet-action" href="${escapeHtml(c.website)}" target="_blank" rel="noopener"><span>🌐</span>Web</a>`);
  if (c.instagram) actions.push(`<a class="sheet-action" href="${escapeHtml(c.instagram)}" target="_blank" rel="noopener"><span>📷</span>Instagram</a>`);
  if (c.facebook) actions.push(`<a class="sheet-action" href="${escapeHtml(c.facebook)}" target="_blank" rel="noopener"><span>👍</span>Facebook</a>`);
  actions.push(`<button class="sheet-action" id="sheetShareBtn" type="button"><span>📲</span>Compartir</button>`);
  actions.push(`<button class="sheet-action" id="sheetShareCardBtn" type="button"><span>🖼️</span>Tarjeta</button>`);

  els.sheetContent.innerHTML = `
    ${c.photo
      ? `<div class="sheet-photo" style="background-image:url('${c.photo}')"></div>`
      : `<div class="sheet-photo sheet-photo-placeholder ${def.badgeClass}"><span>${def.icon}</span></div>`}
    <div class="sheet-header">
      <div class="place-badge ${def.badgeClass}">${def.icon}</div>
      <div class="sheet-title-wrap">
        <h3 class="sheet-title">${escapeHtml(p.name)}</h3>
        <p class="sheet-subtitle">${def.label} · ${formatDistance(p.dist)}<span id="sheetAddressPart">${p.address ? " · " + escapeHtml(p.address) : ""}</span>${p.rating != null ? ` · <span class="sheet-rating">⭐ ${p.rating.toFixed(1)}</span>` : ""}</p>
      </div>
      <button class="sheet-fav-star ${isFav ? "on" : ""}" id="sheetFavBtn" type="button" aria-label="Favorito">${isFav ? "★" : "☆"}</button>
    </div>
    ${c.opening ? `<p class="sheet-hours">🕒 ${escapeHtml(c.opening)}${openState === true ? ' <span style="color:var(--c-farmacia)">· Abierto ahora</span>' : openState === false ? ' <span style="color:var(--c-parrilla)">· Cerrado ahora</span>' : ""}</p>` : ""}
    <div class="sheet-actions">${actions.join("")}</div>
    ${(!c.phone && !c.website && !c.instagram && !c.facebook) ? `<p class="sheet-empty-note">Este lugar todavía no tiene datos de contacto cargados en OpenStreetMap.</p>` : ""}
    <div class="sheet-note-wrap">
      <span class="sheet-note-label">Tu nota</span>
      <textarea class="sheet-note-input" id="sheetNoteInput" placeholder="Ej: pedir la de fernet, cerrado los lunes…">${escapeHtml(getNote(p.id))}</textarea>
    </div>
  `;

  openSheetOverlay();
  els.sheet.dataset.placeId = p.id;

  if (!p.address) {
    reverseGeocode(p.lat, p.lon).then((addr) => {
      if (!addr) return;
      if (els.sheet.dataset.placeId !== String(p.id)) return; // el usuario ya abrió otra ficha
      const el = document.getElementById("sheetAddressPart");
      if (el) el.textContent = " · " + addr;
    });
  }

  const shareBtn = document.getElementById("sheetShareBtn");
  if (shareBtn) shareBtn.addEventListener("click", () => sharePlace(p));

  const shareCardBtn = document.getElementById("sheetShareCardBtn");
  if (shareCardBtn) shareCardBtn.addEventListener("click", () => sharePlaceCard(p));

  const favBtn = document.getElementById("sheetFavBtn");
  if (favBtn) favBtn.addEventListener("click", () => toggleFavorite(p, favBtn));

  const noteInput = document.getElementById("sheetNoteInput");
  if (noteInput) {
    let noteTimer = null;
    noteInput.addEventListener("input", () => {
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => setNote(p.id, noteInput.value), 300);
    });
  }
}

function closePlaceSheet() {
  els.sheetOverlay.classList.remove("open");
  setTimeout(() => { els.sheetOverlay.hidden = true; }, 220);
  if (sheetTriggerEl && typeof sheetTriggerEl.focus === "function") {
    sheetTriggerEl.focus();
  }
  sheetTriggerEl = null;
}

els.sheetClose.addEventListener("click", closePlaceSheet);
els.sheetOverlay.addEventListener("click", (e) => {
  if (e.target === els.sheetOverlay) closePlaceSheet();
});

// Lector de pantalla: Escape cierra, Tab queda atrapado dentro del sheet
els.sheetOverlay.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.stopPropagation();
    closePlaceSheet();
    return;
  }
  if (e.key !== "Tab") return;
  const focusables = Array.prototype.slice.call(
    els.sheet.querySelectorAll('a[href], button:not([disabled]), textarea, input, [tabindex]:not([tabindex="-1"])')
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
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
  state.map.on("zoomend", () => updateMapMarkers(false));
}

function updateMapMarkers(fitBounds = true) {
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

  if (state.car) {
    const carIcon = L.divIcon({
      className: "",
      html: `<div style="font-size:18px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6));">🚗</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    L.marker([state.car.lat, state.car.lon], { icon: carIcon })
      .addTo(state.markersLayer)
      .bindPopup("<strong>Tu auto</strong>");
  }

  const visible = state.results.filter((p) => state.mapCatFilter.size === 0 || state.mapCatFilter.has(p.category));
  const bounds = [[state.userLat, state.userLon]];
  visible.forEach((p) => bounds.push([p.lat, p.lon]));

  renderClusteredMarkers(visible);

  if (fitBounds) {
    if (bounds.length > 1) {
      state.map.flyToBounds(bounds, { padding: [30, 30], maxZoom: 16, duration: 0.7 });
    } else {
      state.map.flyTo([state.userLat, state.userLon], 15, { duration: 0.7 });
    }
  }
}

// Clustering simple basado en distancia en píxeles de pantalla al zoom actual.
function renderClusteredMarkers(points) {
  if (!state.map || points.length === 0) return;
  const zoom = state.map.getZoom();
  const projected = points.map((p) => ({ p, pt: state.map.project([p.lat, p.lon], zoom) }));
  const threshold = points.length > 8 ? 42 : 0; // solo agrupamos si hay bastantes resultados
  const used = new Array(projected.length).fill(false);
  const groups = [];

  for (let i = 0; i < projected.length; i++) {
    if (used[i]) continue;
    const group = [projected[i]];
    used[i] = true;
    if (threshold > 0) {
      for (let j = i + 1; j < projected.length; j++) {
        if (used[j]) continue;
        const dx = projected[i].pt.x - projected[j].pt.x;
        const dy = projected[i].pt.y - projected[j].pt.y;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) {
          group.push(projected[j]);
          used[j] = true;
        }
      }
    }
    groups.push(group);
  }

  groups.forEach((group, gi) => {
    const delay = Math.min(gi, 12) * 0.03;
    if (group.length === 1) {
      const p = group[0].p;
      const def = CATEGORY_DEFS[p.category] || CATEGORY_DEFS.restaurante;
      const icon = L.divIcon({
        className: "",
        html: `<div class="marker-enter" style="font-size:18px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6));animation-delay:${delay}s">${def.icon}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker([p.lat, p.lon], { icon })
        .addTo(state.markersLayer)
        .bindPopup(`<strong>${escapeHtml(p.name)}</strong><br>${def.label} · ${formatDistance(p.dist)}`);
    } else {
      const latSum = group.reduce((s, g) => s + g.p.lat, 0);
      const lonSum = group.reduce((s, g) => s + g.p.lon, 0);
      const center = [latSum / group.length, lonSum / group.length];
      const icon = L.divIcon({
        className: "",
        html: `<div class="map-cluster marker-enter" style="animation-delay:${delay}s">${group.length}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      const marker = L.marker(center, { icon }).addTo(state.markersLayer);
      marker.on("click", () => {
        state.map.flyTo(center, Math.min(19, state.map.getZoom() + 2), { duration: 0.6 });
      });
    }
  });
}

function renderMapCatFilter() {
  if (!els.mapCatFilter) return;
  const cats = [...new Set(state.results.map((p) => p.category))];
  if (cats.length <= 1) {
    els.mapCatFilter.innerHTML = "";
    return;
  }
  els.mapCatFilter.innerHTML = cats
    .map((cat) => {
      const def = CATEGORY_DEFS[cat] || {};
      const on = state.mapCatFilter.has(cat);
      return `<button class="map-cat-chip ${on ? "on" : ""}" data-cat="${cat}" type="button">${def.icon || ""} ${def.label || cat}</button>`;
    })
    .join("");
}

if (els.mapCatFilter) {
  els.mapCatFilter.addEventListener("click", (e) => {
    const btn = e.target.closest(".map-cat-chip");
    if (!btn) return;
    const cat = btn.dataset.cat;
    if (state.mapCatFilter.has(cat)) state.mapCatFilter.delete(cat);
    else state.mapCatFilter.add(cat);
    renderMapCatFilter();
    updateMapMarkers(false);
  });
}

// ---------- Favoritos ----------
function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveFavoritesList() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
  } catch (e) {
    showToast("No pudimos guardar: sin espacio en el dispositivo");
  }
}
function isFavorite(id) {
  return state.favorites.some((f) => String(f.id) === String(id));
}
function toggleFavorite(p, btnEl) {
  const idx = state.favorites.findIndex((f) => String(f.id) === String(p.id));
  if (idx >= 0) {
    state.favorites.splice(idx, 1);
    showToast("Sacado de favoritos");
  } else {
    state.favorites.unshift({
      id: p.id, name: p.name, lat: p.lat, lon: p.lon,
      category: p.category, address: p.address, contact: p.contact, rating: p.rating,
      savedAt: Date.now(),
    });
    showToast("Agregado a favoritos ⭐");
  }
  saveFavoritesList();
  updateFavBadge();
  const nowFav = isFavorite(p.id);
  document.querySelectorAll(`[data-fav-id="${p.id}"]`).forEach((el) => {
    el.classList.toggle("on", nowFav);
    el.textContent = nowFav ? "★" : "☆";
    if (nowFav) {
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
      el.addEventListener("animationend", () => el.classList.remove("pop"), { once: true });
    }
  });
  const sheetFav = document.getElementById("sheetFavBtn");
  if (sheetFav) {
    sheetFav.classList.toggle("on", nowFav);
    sheetFav.textContent = nowFav ? "★" : "☆";
    if (nowFav) {
      sheetFav.classList.remove("pop");
      void sheetFav.offsetWidth;
      sheetFav.classList.add("pop");
      sheetFav.addEventListener("animationend", () => sheetFav.classList.remove("pop"), { once: true });
    }
  }
  if (state.activeTab === "favoritos") renderFavorites();
}
function updateFavBadge() {
  const n = state.favorites.length;
  els.favBadge.hidden = n === 0;
  els.favBadge.textContent = n > 99 ? "99+" : String(n);
}
function renderFavorites() {
  els.compareToggleBtn.hidden = state.favorites.length < 2;
  if (state.favorites.length < 2 && state.compareMode) {
    state.compareMode = false;
    state.compareSelection = [];
  }
  if (state.favorites.length === 0) {
    els.favoritesList.innerHTML = `<div class="empty-favorites">Todavía no tenés lugares favoritos.<br>Tocá la ⭐ en cualquier lugar para guardarlo acá.</div>`;
    updateCompareBar();
    return;
  }
  els.favoritesList.innerHTML = state.favorites
    .map((p) => {
      const def = CATEGORY_DEFS[p.category] || CATEGORY_DEFS.restaurante;
      const c = p.contact || {};
      const selected = state.compareSelection.includes(String(p.id));
      return `
        <button class="place-card ${selected ? "comparing" : ""}" type="button" data-fav-open="${p.id}">
          ${c.photo ? `<div class="place-thumb" style="background-image:url('${c.photo}')"></div>` : `<div class="place-badge ${def.badgeClass}">${def.icon}</div>`}
          <div class="place-info">
            <p class="place-name">${escapeHtml(p.name)}</p>
            <div class="place-meta">
              <span>${def.label}</span>
              ${p.rating != null ? `<span class="place-rating">⭐ ${p.rating.toFixed(1)}</span>` : ""}
              ${p.address ? `<span>${escapeHtml(p.address)}</span>` : ""}
              ${getNote(p.id) ? `<span>📝 ${escapeHtml(getNote(p.id))}</span>` : ""}
            </div>
          </div>
          ${state.compareMode
            ? `<span class="fav-star ${selected ? "on" : ""}" aria-hidden="true">${selected ? "✅" : "⬜"}</span>`
            : `<button class="fav-star on" type="button" data-fav-id="${p.id}" aria-label="Quitar favorito">★</button>`}
        </button>
      `;
    })
    .join("");
  updateCompareBar();
}

// ---------- Comparar favoritos lado a lado ----------
els.compareToggleBtn.addEventListener("click", () => {
  state.compareMode = !state.compareMode;
  state.compareSelection = [];
  els.compareToggleBtn.classList.toggle("on", state.compareMode);
  els.compareToggleBtn.textContent = state.compareMode ? "Cancelar" : "Comparar";
  renderFavorites();
});

function updateCompareBar() {
  const n = state.compareSelection.length;
  els.compareBarBtn.hidden = !state.compareMode || n < 2;
  els.compareBarBtn.disabled = n < 2;
  els.compareCount.textContent = String(n);
}

els.compareBarBtn.addEventListener("click", () => {
  const places = state.compareSelection
    .map((id) => state.favorites.find((f) => String(f.id) === id))
    .filter(Boolean);
  if (places.length < 2) return;
  openCompareOverlay(places);
});

function openCompareOverlay(places) {
  els.compareContent.innerHTML = `
    <h3 class="sheet-title" style="margin-bottom:10px;">Comparar lugares</h3>
    <div class="compare-table">
      ${places
        .map((p) => {
          const def = CATEGORY_DEFS[p.category] || CATEGORY_DEFS.restaurante;
          const dist = state.userLat ? haversine(state.userLat, state.userLon, p.lat, p.lon) : null;
          const openState = isOpenNow((p.contact || {}).opening);
          const openLabel = openState === true ? "Abierto ahora" : openState === false ? "Cerrado ahora" : "Sin datos de horario";
          return `
            <div class="compare-col">
              <h4>${def.icon} ${escapeHtml(p.name)}</h4>
              <div class="compare-row"><span>Categoría</span><strong>${def.label}</strong></div>
              <div class="compare-row"><span>Distancia</span><strong>${dist != null ? formatDistance(dist) : "—"}</strong></div>
              <div class="compare-row"><span>Estado</span><strong>${openLabel}</strong></div>
              <div class="compare-row"><span>Rating</span><strong>${p.rating != null ? "⭐ " + p.rating.toFixed(1) : "—"}</strong></div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
  els.compareOverlay.hidden = false;
  requestAnimationFrame(() => {
    els.compareOverlay.classList.add("open");
    els.compareClose.focus();
  });
}

function closeCompareOverlay() {
  els.compareOverlay.classList.remove("open");
  setTimeout(() => { els.compareOverlay.hidden = true; }, 220);
}

els.compareClose.addEventListener("click", closeCompareOverlay);
els.compareOverlay.addEventListener("click", (e) => {
  if (e.target === els.compareOverlay) closeCompareOverlay();
});
els.compareOverlay.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCompareOverlay();
});
els.favoritesList.addEventListener("click", (e) => {
  const star = e.target.closest(".fav-star");
  if (star && star.dataset.favId) {
    e.stopPropagation();
    const p = state.favorites.find((f) => String(f.id) === String(star.dataset.favId));
    if (p) toggleFavorite(p);
    return;
  }
  const card = e.target.closest("[data-fav-open]");
  if (!card) return;
  const id = String(card.dataset.favOpen);

  if (state.compareMode) {
    const idx = state.compareSelection.indexOf(id);
    if (idx >= 0) {
      state.compareSelection.splice(idx, 1);
    } else if (state.compareSelection.length < 3) {
      state.compareSelection.push(id);
    } else {
      showToast("Podés comparar hasta 3 lugares");
    }
    renderFavorites();
    return;
  }

  const p = state.favorites.find((f) => String(f.id) === id);
  if (p) {
    p.dist = state.userLat ? haversine(state.userLat, state.userLon, p.lat, p.lon) : 0;
    openPlaceSheet(p);
  }
});

// ---------- Notas por lugar ----------
function loadNotes() {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function saveNotesMap() {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(state.notes));
  } catch (e) {
    showToast("No pudimos guardar la nota: sin espacio en el dispositivo");
  }
}
function getNote(id) { return state.notes[id] || ""; }
function setNote(id, text) {
  if (text && text.trim()) state.notes[id] = text.trim();
  else delete state.notes[id];
  saveNotesMap();
}

// ---------- Búsquedas favoritas (guardadas con nombre) ----------
function loadSavedSearches() {
  try {
    const raw = localStorage.getItem(SAVED_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveSavedSearchesList() {
  try {
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(state.savedSearches));
  } catch (e) {
    showToast("No pudimos guardar: sin espacio en el dispositivo");
  }
}
function renderSavedSearches() {
  if (state.savedSearches.length === 0) {
    els.savedSearchesTitle.hidden = true;
    els.savedSearchesList.innerHTML = "";
    return;
  }
  els.savedSearchesTitle.hidden = false;
  els.savedSearchesList.innerHTML = state.savedSearches
    .map((s, idx) => {
      const icons = (s.cats && s.cats.length ? s.cats : Object.keys(CATEGORY_DEFS))
        .slice(0, 4).map((c) => (CATEGORY_DEFS[c] ? CATEGORY_DEFS[c].icon : "")).join(" ");
      return `
        <button class="history-card saved-search-card" data-saved-idx="${idx}">
          <span class="history-icons">${icons || "🔎"}</span>
          <span class="history-info">
            <p class="history-title">${escapeHtml(s.name)}</p>
            <span class="history-meta"><span>${formatDistance(s.radius, true)}</span></span>
          </span>
          <span class="history-replay" aria-hidden="true">↻</span>
          <button class="saved-search-delete" type="button" data-saved-delete="${idx}" aria-label="Borrar">✕</button>
        </button>
      `;
    })
    .join("");
}
els.savedSearchesList.addEventListener("click", (e) => {
  const del = e.target.closest("[data-saved-delete]");
  if (del) {
    e.stopPropagation();
    state.savedSearches.splice(Number(del.dataset.savedDelete), 1);
    saveSavedSearchesList();
    renderSavedSearches();
    showToast("Búsqueda guardada eliminada");
    return;
  }
  const card = e.target.closest("[data-saved-idx]");
  if (!card) return;
  const s = state.savedSearches[Number(card.dataset.savedIdx)];
  if (!s) return;
  runSearch({ cats: s.cats, radius: s.radius });
});
// ---------- Configuración (radio/categorías default, orden, accento) ----------
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...state.settings, ...JSON.parse(raw) } : state.settings;
  } catch (e) { return state.settings; }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (e) {}
}
function applyAccent(name) {
  const a = ACCENTS[name] || ACCENTS.amber;
  const root = document.documentElement.style;
  root.setProperty("--accent", a.accent);
  root.setProperty("--accent-glow", a.glow);
  root.setProperty("--accent-dim", a.dim);
  root.setProperty("--accent-glass", a.glass);
  root.setProperty("--border-hi", a.border);
  document.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("on", s.dataset.accent === name));
}
if (els.accentSwatches) {
  els.accentSwatches.addEventListener("click", (e) => {
    const btn = e.target.closest(".swatch");
    if (!btn) return;
    state.settings.accent = btn.dataset.accent;
    applyAccent(state.settings.accent);
    saveSettings();
  });
}

// ---------- Dónde estacioné el auto ----------
function loadCar() {
  try {
    const raw = localStorage.getItem(CAR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveCar() {
  try { localStorage.setItem(CAR_KEY, state.car ? JSON.stringify(state.car) : ""); } catch (e) {}
}
function updateCarMenuItem() {
  if (!els.menuCarTitle) return;
  if (state.car) {
    els.menuCarTitle.textContent = "Ver dónde estacioné";
    els.menuCarDesc.textContent = `Guardado ${formatRelativeTime(state.car.ts)}`;
  } else {
    els.menuCarTitle.textContent = "Guardar dónde estacioné";
    els.menuCarDesc.textContent = "Marcá la ubicación de tu auto";
  }
}
if (els.menuCar) {
  els.menuCar.addEventListener("click", async () => {
    if (!state.car) {
      try {
        const pos = await getPosition();
        state.car = { lat: pos.coords.latitude, lon: pos.coords.longitude, ts: Date.now() };
        saveCar();
        updateCarMenuItem();
        showToast("Guardamos dónde estacionaste 🚗");
      } catch (err) {
        showToast("No pudimos obtener tu ubicación");
      }
      return;
    }
    const dist = state.userLat ? haversine(state.userLat, state.userLon, state.car.lat, state.car.lon) : null;
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${state.car.lat},${state.car.lon}`;
    els.sheetContent.innerHTML = `
      <div class="sheet-header">
        <div class="place-badge">🚗</div>
        <div class="sheet-title-wrap">
          <h3 class="sheet-title">Tu auto</h3>
          <p class="sheet-subtitle">Guardado ${formatRelativeTime(state.car.ts)}${dist != null ? " · " + formatDistance(dist) : ""}</p>
        </div>
      </div>
      <div class="sheet-actions">
        <a class="sheet-action primary" href="${mapsUrl}" target="_blank" rel="noopener"><span>🧭</span>Cómo llegar</a>
        <button class="sheet-action" id="carUpdateBtn" type="button"><span>📍</span>Actualizar</button>
        <button class="sheet-action" id="carClearBtn" type="button"><span>🗑️</span>Borrar</button>
      </div>
    `;
    openSheetOverlay();
    document.getElementById("carUpdateBtn").addEventListener("click", async () => {
      try {
        const pos = await getPosition();
        state.car = { lat: pos.coords.latitude, lon: pos.coords.longitude, ts: Date.now() };
        saveCar();
        updateCarMenuItem();
        showToast("Ubicación del auto actualizada");
        closePlaceSheet();
      } catch (err) { showToast("No pudimos obtener tu ubicación"); }
    });
    document.getElementById("carClearBtn").addEventListener("click", () => {
      state.car = null;
      saveCar();
      updateCarMenuItem();
      showToast("Borramos la ubicación del auto");
      closePlaceSheet();
    });
  });
}

// ---------- Sugerencia del día ----------
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function loadCachedSuggestion() {
  try {
    const raw = localStorage.getItem(SUGGESTION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.date === todayKey() ? parsed.place : null;
  } catch (e) { return null; }
}
function saveCachedSuggestion(place) {
  try { localStorage.setItem(SUGGESTION_KEY, JSON.stringify({ date: todayKey(), place })); } catch (e) {}
}
if (els.suggestionBtn) {
  els.suggestionBtn.addEventListener("click", async () => {
    const cached = loadCachedSuggestion();
    if (cached) {
      showSuggestionResult(cached);
      return;
    }
    els.suggestionSub.textContent = "Buscando algo lindo cerca tuyo…";
    try {
      const pos = await getPosition();
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      const cats = Object.keys(CATEGORY_DEFS);
      const cat = cats[Math.floor(Math.random() * cats.length)];
      const elements = await queryOverpass([cat], lat, lon, 1500);
      const tmpUserLat = state.userLat, tmpUserLon = state.userLon;
      state.userLat = lat; state.userLon = lon;
      const results = buildResults(elements, [cat]);
      state.userLat = tmpUserLat; state.userLon = tmpUserLon;
      if (results.length === 0) {
        els.suggestionSub.textContent = "No encontramos nada cerca hoy. Probá de nuevo más tarde.";
        return;
      }
      const pick = results[Math.floor(Math.random() * Math.min(results.length, 10))];
      saveCachedSuggestion(pick);
      showSuggestionResult(pick);
    } catch (err) {
      els.suggestionSub.textContent = "No pudimos obtener tu ubicación.";
    }
  });
}
function showSuggestionResult(p) {
  const def = CATEGORY_DEFS[p.category] || CATEGORY_DEFS.restaurante;
  els.suggestionSub.textContent = `${def.icon} ${p.name} — ${def.label}, a ${formatDistance(p.dist)}. Tocá para ver más.`;
  els.suggestionBtn.onclick = () => {
    if (state.userLat) p.dist = haversine(state.userLat, state.userLon, p.lat, p.lon);
    openPlaceSheet(p);
  };
}

// ---------- Compartir tarjeta de lugar como imagen ----------
async function sharePlaceCard(p) {
  try {
    const def = CATEGORY_DEFS[p.category] || CATEGORY_DEFS.restaurante;
    const canvas = document.createElement("canvas");
    const W = 800, H = 450;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#1A1916");
    grad.addColorStop(1, "#0E0D0B");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#F5A623";
    ctx.font = "70px sans-serif";
    ctx.fillText(def.icon || "📍", 48, 130);

    ctx.fillStyle = "#EDE8DC";
    ctx.font = "bold 42px sans-serif";
    wrapText(ctx, p.name, 48, 210, W - 96, 50);

    ctx.fillStyle = "#928D83";
    ctx.font = "28px sans-serif";
    ctx.fillText(`${def.label} · ${formatDistance(p.dist)}${p.address ? " · " + p.address : ""}`, 48, 320);

    ctx.fillStyle = "#F5A623";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("📍 Encontrado con Cerca", 48, H - 36);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("no-blob");
    const file = new File([blob], "lugar.png", { type: "image/png" });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ title: p.name, files: [file] });
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.name.replace(/[^a-z0-9]+/gi, "_")}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    showToast("Tarjeta descargada 🖼️");
  } catch (err) {
    console.error(err);
    showToast("No pudimos generar la tarjeta");
  }
}
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (const word of words) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = word + " ";
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, curY);
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

if (els.menuCopyLink) {
  els.menuCopyLink.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copiado 🔗");
    } catch (err) {
      showToast("No pudimos copiar el link");
    }
  });
}

// ---------- Exportar / importar favoritos y notas ----------
if (els.menuExportFavorites) {
  els.menuExportFavorites.addEventListener("click", () => {
    if (state.favorites.length === 0) {
      showToast("Todavía no tenés favoritos para exportar");
      return;
    }
    const payload = {
      app: "cerca",
      version: 1,
      exportedAt: new Date().toISOString(),
      favorites: state.favorites,
      notes: state.notes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cerca-favoritos-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast("Favoritos exportados ⬇️");
  });
}

if (els.menuImportFavorites && els.importFavoritesInput) {
  els.menuImportFavorites.addEventListener("click", () => els.importFavoritesInput.click());

  els.importFavoritesInput.addEventListener("change", async () => {
    const file = els.importFavoritesInput.files && els.importFavoritesInput.files[0];
    els.importFavoritesInput.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const incomingFavs = Array.isArray(data.favorites) ? data.favorites : [];
      const incomingNotes = data.notes && typeof data.notes === "object" ? data.notes : {};
      if (incomingFavs.length === 0) {
        showToast("El archivo no tiene favoritos válidos");
        return;
      }
      let added = 0;
      incomingFavs.forEach((f) => {
        if (!f || f.id == null) return;
        if (state.favorites.some((existing) => String(existing.id) === String(f.id))) return;
        state.favorites.push(f);
        added++;
      });
      Object.keys(incomingNotes).forEach((id) => {
        if (!state.notes[id]) state.notes[id] = incomingNotes[id];
      });
      saveFavoritesList();
      saveNotesMap();
      updateFavBadge();
      if (state.activeTab === "favoritos") renderFavorites();
      showToast(`Importados ${added} favoritos nuevos 📥`);
    } catch (err) {
      showToast("No pudimos leer ese archivo. ¿Es un JSON exportado desde Cerca?");
    }
  });
}

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

state.favorites = loadFavorites();
updateFavBadge();

state.notes = loadNotes();

state.savedSearches = loadSavedSearches();

state.settings = loadSettings();
applyAccent(state.settings.accent);
if (els.sortSelect) els.sortSelect.value = state.settings.sortBy || "dist";
if (els.openNowToggle) els.openNowToggle.classList.toggle("on", !!state.settings.openNowOnly);

if (state.settings.defaultRadius) {
  state.radius = state.settings.defaultRadius;
  els.radius.value = state.radius;
  els.radiusValue.textContent = formatDistance(state.radius, true);
}
if (state.settings.defaultCats && state.settings.defaultCats.length) {
  state.selected = new Set(state.settings.defaultCats);
  document.querySelectorAll(".cat-card").forEach((card) => {
    card.classList.toggle("selected", state.selected.has(card.dataset.cat));
  });
}

state.car = loadCar();
updateCarMenuItem();

requestAnimationFrame(() => {
  const activeDock = els.dock.querySelector(".dock-item.active");
  slideGlassThumb(els.dock, els.dockThumb, activeDock);
});

const cachedSuggestion = loadCachedSuggestion();
if (cachedSuggestion) showSuggestionResult(cachedSuggestion);

// ---------- Onboarding (primera vez) ----------
try {
  if (!localStorage.getItem(ONBOARDING_KEY)) {
    els.onboardingOverlay.hidden = false;
  }
} catch (e) {}

els.onboardingClose.addEventListener("click", () => {
  els.onboardingOverlay.hidden = true;
  try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch (e) {}
});

// ---------- Service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed", e));
  });
}

// ---------- Warm-up silencioso de GPS ----------
// Si el usuario ya nos dio permiso de ubicación antes, pedimos la posición
// apenas abre la app (sin mostrar ningún prompt) para que "Buscar cerca mío"
// responda más rápido cuando la toque.
if ("permissions" in navigator && "geolocation" in navigator) {
  navigator.permissions
    .query({ name: "geolocation" })
    .then((status) => {
      if (status.state === "granted") {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            state.userLat = pos.coords.latitude;
            state.userLon = pos.coords.longitude;
          },
          () => {},
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
      }
    })
    .catch(() => {});
}
