// ---------------------------------------------------------
// Cerca — Chat 100% local (sin IA, sin servidor, sin red)
// ---------------------------------------------------------
// Este archivo se carga DESPUÉS de app.js y reutiliza sus funciones
// globales (state, CATEGORY_DEFS, formatDistance, isOpenNow, haversine,
// escapeHtml, runSearch, switchTab) tanto para dar contexto como para,
// en pedidos del tipo "qué tengo cerca" / "un café cerca", ejecutar la
// búsqueda real de la app (la misma que dispara el botón "Buscar cerca
// mío") y mostrar las 3 ubicaciones más cercanas como tarjetas tocables
// que abren directo Google Maps. No hace ningún fetch propio: todo el
// texto y los datos se arman con reglas en JS, en el propio dispositivo.

const chat = {
  open: false,
};

const CHAT_MAX_PLACES = 3;

// ---------- Utilidades de texto ----------
function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca acentos
    .trim();
}

function hasAny(text, words) {
  return words.some((w) => text.includes(w));
}

// ---------- Acceso a datos de la app ----------
function getPool() {
  const pool = (state.filteredResults && state.filteredResults.length) ? state.filteredResults : state.results;
  return pool || [];
}

// Si el lugar no tiene distancia calculada (p.ej. viene de favoritos),
// la calculamos con la posición actual del usuario si la tenemos.
function withDistance(p) {
  if (p.dist != null) return p;
  if (state.userLat != null && state.userLon != null && p.lat != null && p.lon != null) {
    return { ...p, dist: haversine(state.userLat, state.userLon, p.lat, p.lon) };
  }
  return p;
}

function mapsUrlFor(p) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
}

// Detecta si el usuario mencionó una categoría conocida
function matchCategory(text) {
  for (const [key, def] of Object.entries(CATEGORY_DEFS)) {
    const label = normalizeText(def.label);
    if (text.includes(key.replace(/_/g, " ")) || text.includes(label)) return key;
  }
  // sinónimos comunes
  const synonyms = {
    bar: ["birra", "cerveza", "tragos", "pub"],
    cafe: ["cafe", "cafeteria"],
    parrilla: ["asado"],
    pizza: ["pizzeria"],
    heladeria: ["helado"],
    panaderia: ["pan", "facturas"],
    farmacia: ["remedio", "medicamento"],
    supermercado: ["super", "almacen"],
    comida_rapida: ["hamburguesa", "burger", "fast food"],
    estacion_servicio: ["nafta", "combustible", "gasolina"],
    carniceria: ["carnicero", "milanesa", "vacio", "bife"],
    verduleria: ["verduras", "fruta", "frutas", "verdura"],
  };
  for (const [key, words] of Object.entries(synonyms)) {
    if (hasAny(text, words) && CATEGORY_DEFS[key]) return key;
  }
  return null;
}

// Arma un texto con todas las categorías disponibles (ej. "🍸 Bar, ☕ Café,
// …") para preguntarle al usuario cuál le interesa cuando no dijo una en
// particular.
function listCategoriesText() {
  return Object.values(CATEGORY_DEFS).map((def) => `${def.icon} ${def.label}`).join(" · ");
}

// Detecta si el mensaje pide EJECUTAR una búsqueda ahora (no solo hablar
// de los resultados que ya están en pantalla).
function isNearbyActionRequest(text) {
  const actionVerbs = ["busca", "buscar", "buscame", "encontrame", "encontrar algo", "mostrame que hay", "dame lugares"];
  const nearbyPhrases = ["tengo cerca", "hay cerca", "cerca mio", "cerca mia", "que hay para mi zona", "algo cerca", "que puedo encontrar"];
  return hasAny(text, actionVerbs) || hasAny(text, nearbyPhrases);
}

// ---------- Tarjetas de lugares (tocables → abren Maps) ----------
function placeCardHTML(rawPlace) {
  const p = withDistance(rawPlace);
  const def = CATEGORY_DEFS[p.category] || {};
  const bits = [def.label || p.category];
  if (p.dist != null) bits.push(formatDistance(p.dist));
  const openState = isOpenNow((p.contact || {}).opening);
  if (openState === true) bits.push("abierto ahora");
  if (openState === false) bits.push("cerrado ahora");
  if (p.rating != null) bits.push(`⭐ ${p.rating.toFixed(1)}`);

  return `
    <a class="chat-place-item" href="${mapsUrlFor(p)}" target="_blank" rel="noopener">
      <span class="chat-place-icon" aria-hidden="true">${def.icon || "📍"}</span>
      <span class="chat-place-info">
        <span class="chat-place-name">${escapeHtml(p.name)}</span>
        <span class="chat-place-meta">${escapeHtml(bits.join(" · "))}</span>
      </span>
      <span class="chat-place-go" aria-hidden="true">↗</span>
    </a>`;
}

function appendChatPlaces(places) {
  if (!els.chatMessages || !places.length) return;
  const div = document.createElement("div");
  div.className = "chat-bubble chat-bubble-model chat-places";
  div.innerHTML = places.map(placeCardHTML).join("");
  els.chatMessages.appendChild(div);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function closestPlaces(pool, n = CHAT_MAX_PLACES) {
  return [...pool].sort((a, b) => a.dist - b.dist).slice(0, n);
}

// Ejecuta la búsqueda real de la app (misma función que usa el botón
// "Buscar cerca mío") y muestra las 3 ubicaciones más cercanas como
// tarjetas tocables.
async function runNearbySearchAction(rawText) {
  const text = normalizeText(rawText);
  const cat = matchCategory(text);

  if (typeof switchTab === "function") switchTab("inicio");
  appendChatBubble("model", cat
    ? `Buscando ${CATEGORY_DEFS[cat].label.toLowerCase()} cerca tuyo… 🔎`
    : "Buscando cerca tuyo… 🔎");

  try {
    await runSearch(cat ? { cats: [cat] } : undefined);
  } catch (e) {
    // runSearch ya maneja y muestra sus propios errores (permiso de
    // ubicación, sin conexión, etc.) — esto es solo una red de seguridad.
    console.error(e);
  }

  const pool = getPool();
  if (!pool.length) {
    appendChatBubble("model", "No encontré resultados. Puede ser que hayas rechazado el permiso de ubicación, o que no haya lugares en el radio actual — probá ampliar el radio desde Inicio.");
    return;
  }
  const closest = closestPlaces(pool);
  const catSuffix = cat ? ` de ${CATEGORY_DEFS[cat].label}` : "";
  appendChatBubble("model", `Esto es lo más cerca${catSuffix}. Tocá una para abrir en Maps 👇`);
  appendChatPlaces(closest);
}

// ---------- Motor de respuestas (sin acción, sobre lo que ya hay en pantalla) ----------
function respondFromPool(rawText) {
  const text = normalizeText(rawText);
  const pool = getPool();

  // Saludo
  if (hasAny(text, ["hola", "buenas", "buen dia", "buenas tardes", "buenas noches", "que tal", "ey", "hey"])) {
    appendChatBubble("model", "¡Hola! 👋 Pedime algo como \"un café cerca\" y te muestro las 3 opciones más cercanas para ir directo a Maps. También puedo contarte de tus favoritos o cómo usar la app.");
    return;
  }

  // Agradecimiento / despedida
  if (hasAny(text, ["gracias"])) {
    appendChatBubble("model", "¡De nada! Si querés otra idea, avisame. 😊");
    return;
  }
  if (hasAny(text, ["chau", "adios", "nos vemos"])) {
    appendChatBubble("model", "¡Dale, que la pases bien! Tocá el botón de cerrar cuando quieras. 👋");
    return;
  }

  // Ayuda / cómo usar la app
  if (hasAny(text, ["como busco", "como uso", "como funciona", "ayuda", "como se usa"])) {
    appendChatBubble("model", `Pedime algo como "un café cerca" y yo hago la búsqueda y te muestro las 3 opciones más cercanas para ir directo a Maps. Si no sé qué categoría buscás, te pregunto entre estas:\n${listCategoriesText()}\nTambién podés elegir categoría y radio a mano y tocar "Buscar cerca mío".`);
    return;
  }

  // Categoría específica mencionada
  const cat = matchCategory(text);
  if (cat) {
    const def = CATEGORY_DEFS[cat];
    if (!pool.length) {
      appendChatBubble("model", `Todavía no buscaste nada. Pedime "${def.label.toLowerCase()} cerca" y lo busco por vos, o elegí "${def.label}" en las categorías y tocá "Buscar cerca mío".`);
      return;
    }
    const matches = closestPlaces(pool.filter((p) => p.category === cat));
    if (!matches.length) {
      appendChatBubble("model", `No veo ningún lugar de "${def.label}" entre los resultados actuales. Pedime "${def.label.toLowerCase()} cerca" para que lo busque de nuevo.`);
      return;
    }
    appendChatBubble("model", `${def.icon} Lo más cerca de ${def.label}. Tocá una para abrir en Maps 👇`);
    appendChatPlaces(matches);
    return;
  }

  // Favoritos
  if (hasAny(text, ["favorito", "guardado", "guarde"])) {
    if (!state.favorites.length) {
      appendChatBubble("model", "Todavía no tenés favoritos guardados. Tocá la estrellita en un lugar para agregarlo. ⭐");
      return;
    }
    appendChatBubble("model", "Tus favoritos. Tocá uno para abrir en Maps 👇");
    appendChatPlaces(state.favorites.slice(0, CHAT_MAX_PLACES));
    return;
  }

  // Más cercano
  if (hasAny(text, ["mas cerca", "mas cercano"])) {
    if (!pool.length) { appendChatBubble("model", "Todavía no hay resultados en pantalla. Pedime \"algo cerca\" y lo busco."); return; }
    appendChatBubble("model", "Lo más cerca. Tocá para abrir en Maps 👇");
    appendChatPlaces(closestPlaces(pool, 1));
    return;
  }

  // Mejor calificado
  if (hasAny(text, ["mejor calificado", "mejor puntuado", "mas estrellas", "mejor rating", "el mejor"])) {
    if (!pool.length) { appendChatBubble("model", "Todavía no hay resultados en pantalla. Pedime \"algo cerca\" y lo busco."); return; }
    const rated = pool.filter((p) => p.rating != null).sort((a, b) => b.rating - a.rating);
    if (!rated.length) { appendChatBubble("model", "Ninguno de los resultados actuales tiene rating cargado en OpenStreetMap."); return; }
    appendChatBubble("model", "El mejor calificado ahora. Tocá para abrir en Maps 👇");
    appendChatPlaces(rated.slice(0, 1));
    return;
  }

  // Abierto ahora
  if (hasAny(text, ["abierto ahora", "que este abierto", "esta abierto"])) {
    if (!pool.length) { appendChatBubble("model", "Todavía no hay resultados en pantalla. Pedime \"algo cerca\" y lo busco."); return; }
    const open = closestPlaces(pool.filter((p) => isOpenNow((p.contact || {}).opening) === true));
    if (!open.length) { appendChatBubble("model", "No tengo datos de horario que confirmen cuáles están abiertos ahora mismo entre los resultados actuales."); return; }
    appendChatBubble("model", "Estos figuran abiertos ahora. Tocá uno para abrir en Maps 👇");
    appendChatPlaces(open);
    return;
  }

  // Recomendación / idea genérica
  if (hasAny(text, ["recomend", "sugerime", "sugerencia", "idea", "donde voy", "plan", "opcion"])) {
    if (!pool.length) { appendChatBubble("model", `Todavía no hiciste una búsqueda. Elegí una categoría y te tiro una idea:\n${listCategoriesText()}`); return; }
    const pick = pool[Math.floor(Math.random() * Math.min(pool.length, 8))];
    appendChatBubble("model", "Te tiro una idea. Tocá para abrir en Maps 👇");
    appendChatPlaces([pick]);
    return;
  }

  // Resumen de resultados actuales
  if (hasAny(text, ["estos resultados", "que hay", "resultados actuales", "cuantos resultados"])) {
    if (!pool.length) { appendChatBubble("model", "Todavía no hay resultados en pantalla. Pedime \"algo cerca\" y hago la búsqueda."); return; }
    appendChatBubble("model", `Hay ${pool.length} resultado(s) ahora. Los más cercanos 👇`);
    appendChatPlaces(closestPlaces(pool));
    return;
  }

  // Radio de búsqueda
  if (hasAny(text, ["radio", "distancia de busqueda", "cuanto radio"])) {
    appendChatBubble("model", `El radio de búsqueda actual es ${formatDistance(state.radius, true)}. Lo podés cambiar con el control deslizante en Inicio.`);
    return;
  }

  // Fallback
  appendChatBubble("model", `No estoy seguro de eso 😅 Estas son las categorías que puedo buscar:\n${listCategoriesText()}\nDecime cuál te interesa y te doy las 3 opciones más cerca.`);
}

async function sendChatMessage(userText) {
  if (!userText) return;
  appendChatBubble("user", userText);
  showChatTyping(true);
  els.chatSend && (els.chatSend.disabled = true);

  const normalized = normalizeText(userText);
  if (isNearbyActionRequest(normalized)) {
    if (matchCategory(normalized)) {
      await runNearbySearchAction(userText);
    } else {
      // Pedido de búsqueda sin categoría clara: le preguntamos cuál le
      // interesa mostrándole todas las categorías disponibles, en vez de
      // buscar a ciegas en todas.
      await new Promise((resolve) => setTimeout(resolve, 220));
      appendChatBubble("model", `¿Qué tipo de lugar buscás? Estas son las categorías disponibles:\n${listCategoriesText()}\nDecime una y te doy las 3 opciones más cerca.`);
    }
  } else {
    // Sin red, sin espera real — un breve delay solo para que se sienta natural
    await new Promise((resolve) => setTimeout(resolve, 220));
    respondFromPool(userText);
  }

  showChatTyping(false);
  els.chatSend && (els.chatSend.disabled = false);
}

// ---------- UI del cajón (siempre visible) ----------
function appendChatBubble(role, text) {
  if (!els.chatMessages) return;
  const div = document.createElement("div");
  div.className = `chat-bubble ${role === "user" ? "chat-bubble-user" : "chat-bubble-model"}`;
  div.textContent = text;
  els.chatMessages.appendChild(div);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function showChatTyping(on) {
  if (!els.chatTyping) return;
  els.chatTyping.hidden = !on;
  if (on && els.chatMessages) els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function openChat() {
  chat.open = true;
  if (els.chatOverlay) els.chatOverlay.hidden = false;
  requestAnimationFrame(() => els.chatOverlay && els.chatOverlay.classList.add("open"));
  syncChatViewport();
  if (els.chatInput) els.chatInput.focus();
  if (els.chatMessages && !els.chatMessages.childElementCount) {
    appendChatBubble("model", "¡Hola! 👋 Pedime algo como \"un café cerca\" y hago la búsqueda por vos, mostrándote las 3 opciones más cercanas para ir directo a Maps. Todo esto lo resuelvo acá en el celular, sin conexión. 📴");
  }
}

// Ajusta el alto/posición del overlay al viewport visible real. En mobile,
// cuando aparece el teclado, la ventana visual se achica pero `100dvh` no
// siempre lo refleja a tiempo — esto asegura que header + mensajes + input
// queden siempre dentro del área visible, sin que el teclado tape el input.
function syncChatViewport() {
  if (!chat.open || !els.chatOverlay || !window.visualViewport) return;
  const vv = window.visualViewport;
  els.chatOverlay.style.height = `${vv.height}px`;
  els.chatOverlay.style.top = `${vv.offsetTop}px`;
  if (els.chatMessages) els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncChatViewport);
  window.visualViewport.addEventListener("scroll", syncChatViewport);
}

function closeChat() {
  chat.open = false;
  if (els.chatOverlay) els.chatOverlay.classList.remove("open");
  setTimeout(() => {
    if (els.chatOverlay && !chat.open) {
      els.chatOverlay.hidden = true;
      els.chatOverlay.style.height = "";
      els.chatOverlay.style.top = "";
    }
  }, 220);
}

function initChatUI() {
  els.chatFab = document.getElementById("chatFab");
  els.chatOverlay = document.getElementById("chatOverlay");
  els.chatPanel = document.getElementById("chatPanel");
  els.chatClose = document.getElementById("chatClose");
  els.chatMessages = document.getElementById("chatMessages");
  els.chatForm = document.getElementById("chatForm");
  els.chatInput = document.getElementById("chatInput");
  els.chatSend = document.getElementById("chatSend");
  els.chatTyping = document.getElementById("chatTyping");

  if (!els.chatFab) return; // markup no presente, no rompemos nada

  els.chatFab.addEventListener("click", () => (chat.open ? closeChat() : openChat()));
  els.chatClose.addEventListener("click", closeChat);
  els.chatOverlay.addEventListener("click", (e) => { if (e.target === els.chatOverlay) closeChat(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && chat.open) closeChat(); });

  els.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = els.chatInput.value.trim();
    if (!text) return;
    els.chatInput.value = "";
    sendChatMessage(text);
  });
}

document.addEventListener("DOMContentLoaded", initChatUI);
// Por si chat.js se carga después de que el DOM ya está listo
if (document.readyState !== "loading") initChatUI();
