// ---------------------------------------------------------
// Cerca — Chat 100% local (sin IA, sin servidor, sin red)
// ---------------------------------------------------------
// Este archivo se carga DESPUÉS de app.js y reutiliza sus funciones
// globales (state, CATEGORY_DEFS, formatDistance, isOpenNow, runSearch,
// switchTab) tanto para dar contexto como, en pedidos del tipo "qué
// tengo cerca" / "buscá bares", para ejecutar la búsqueda real de la
// app (la misma que dispara el botón "Buscar cerca mío"). No hace
// ningún fetch propio: todo el texto se arma con reglas en JS, en el
// propio dispositivo.

const chat = {
  open: false,
};

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

function placeLine(p) {
  const def = CATEGORY_DEFS[p.category] || {};
  const bits = [`${def.icon || "📍"} ${p.name} — ${def.label || p.category}, ${formatDistance(p.dist)}`];
  if (p.rating != null) bits.push(`⭐ ${p.rating.toFixed(1)}`);
  const openState = isOpenNow((p.contact || {}).opening);
  if (openState === true) bits.push("abierto ahora");
  if (openState === false) bits.push("cerrado ahora");
  return bits.join(" · ");
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
    parrilla: ["asado", "carne"],
    restaurante: ["comer", "restaurant"],
    pizza: ["pizzeria"],
    heladeria: ["helado"],
    panaderia: ["pan", "facturas"],
    farmacia: ["remedio", "medicamento"],
    supermercado: ["super", "almacen"],
    comida_rapida: ["hamburguesa", "burger", "fast food"],
    estacion_servicio: ["nafta", "combustible", "gasolina"],
    kiosco: ["kiosko", "quiosco"],
  };
  for (const [key, words] of Object.entries(synonyms)) {
    if (hasAny(text, words) && CATEGORY_DEFS[key]) return key;
  }
  return null;
}

// Detecta si el mensaje pide EJECUTAR una búsqueda ahora (no solo hablar
// de los resultados que ya están en pantalla).
function isNearbyActionRequest(text) {
  const actionVerbs = ["busca", "buscar", "buscame", "encontrame", "encontrar algo", "mostrame que hay", "dame lugares"];
  const nearbyPhrases = ["tengo cerca", "hay cerca", "cerca mio", "cerca mia", "que hay para mi zona", "algo cerca", "que puedo encontrar"];
  return hasAny(text, actionVerbs) || hasAny(text, nearbyPhrases);
}

// Ejecuta la búsqueda real de la app (misma función que usa el botón
// "Buscar cerca mío") y arma la respuesta con los resultados frescos.
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
    return "No encontré resultados. Puede ser que hayas rechazado el permiso de ubicación, o que no haya lugares en el radio actual — probá ampliar el radio desde Inicio.";
  }
  const top = pool.slice(0, 6).map(placeLine).join("\n");
  const catSuffix = cat ? ` de ${CATEGORY_DEFS[cat].label}` : "";
  return `Encontré ${pool.length} lugar(es) cerca tuyo${catSuffix}:\n${top}`;
}

// ---------- Motor de respuestas ----------
function buildReply(rawText) {
  const text = normalizeText(rawText);
  const pool = getPool();

  // Saludo
  if (hasAny(text, ["hola", "buenas", "buen dia", "buenas tardes", "buenas noches", "que tal", "ey", "hey"])) {
    return "¡Hola! 👋 Preguntame por los lugares que ves en pantalla, pedime una recomendación, o consultame por favoritos o cómo usar la app.";
  }

  // Agradecimiento / despedida
  if (hasAny(text, ["gracias"])) {
    return "¡De nada! Si querés otra idea, avisame. 😊";
  }
  if (hasAny(text, ["chau", "adios", "nos vemos"])) {
    return "¡Dale, que la pases bien! Tocá el botón de cerrar cuando quieras. 👋";
  }

  // Ayuda / cómo usar la app
  if (hasAny(text, ["como busco", "como uso", "como funciona", "ayuda", "como se usa"])) {
    return "Elegí una o más categorías, ajustá el radio con el control deslizante y tocá \"Buscar cerca mío\". Te va a pedir permiso de ubicación y te muestra los lugares ordenados por distancia, en lista o en mapa.";
  }

  // Sin resultados todavía + intención de recomendación
  if (!pool.length && hasAny(text, ["recomend", "sugerime", "sugerencia", "idea", "donde voy", "que hay", "resultado", "cerca", "opcion", "plan"])) {
    return "Todavía no hiciste una búsqueda. Elegí categoría y radio, y tocá \"Buscar cerca mío\" — ahí te puedo recomendar algo de la lista. 🔍";
  }

  // Categoría específica mencionada
  const cat = matchCategory(text);
  if (cat) {
    const def = CATEGORY_DEFS[cat];
    if (!pool.length) {
      return `Todavía no buscaste nada. Elegí "${def.label}" en las categorías y tocá "Buscar cerca mío" para ver opciones.`;
    }
    const matches = pool.filter((p) => p.category === cat);
    if (!matches.length) {
      return `No veo ningún lugar de "${def.label}" entre los resultados actuales. Podés sumar esa categoría y volver a buscar.`;
    }
    const top = matches.slice(0, 5).map(placeLine).join("\n");
    return `${def.icon} Encontré esto de ${def.label} cerca:\n${top}`;
  }

  // Favoritos
  if (hasAny(text, ["favorito", "guardado", "guarde"])) {
    if (!state.favorites.length) {
      return "Todavía no tenés favoritos guardados. Tocá la estrellita en un lugar para agregarlo. ⭐";
    }
    const top = state.favorites.slice(0, 8).map((f) => {
      const def = CATEGORY_DEFS[f.category] || {};
      return `${def.icon || "📍"} ${f.name} — ${def.label || f.category}`;
    }).join("\n");
    return `Tus favoritos:\n${top}`;
  }

  // Más cercano
  if (hasAny(text, ["mas cerca", "mas cercano"])) {
    if (!pool.length) return "Todavía no hay resultados en pantalla. Hacé una búsqueda primero.";
    const closest = [...pool].sort((a, b) => a.dist - b.dist)[0];
    return `Lo más cerca es ${placeLine(closest)}.`;
  }

  // Mejor calificado
  if (hasAny(text, ["mejor calificado", "mejor puntuado", "mas estrellas", "mejor rating", "el mejor"])) {
    if (!pool.length) return "Todavía no hay resultados en pantalla. Hacé una búsqueda primero.";
    const rated = pool.filter((p) => p.rating != null).sort((a, b) => b.rating - a.rating);
    if (!rated.length) return "Ninguno de los resultados actuales tiene rating cargado en OpenStreetMap.";
    return `El mejor calificado ahora es ${placeLine(rated[0])}.`;
  }

  // Abierto ahora
  if (hasAny(text, ["abierto ahora", "que este abierto", "esta abierto"])) {
    if (!pool.length) return "Todavía no hay resultados en pantalla. Hacé una búsqueda primero.";
    const open = pool.filter((p) => isOpenNow((p.contact || {}).opening) === true);
    if (!open.length) return "No tengo datos de horario que confirmen cuáles están abiertos ahora mismo entre los resultados actuales.";
    const top = open.slice(0, 5).map(placeLine).join("\n");
    return `Estos figuran abiertos ahora:\n${top}`;
  }

  // Recomendación / idea genérica (con resultados)
  if (hasAny(text, ["recomend", "sugerime", "sugerencia", "idea", "donde voy", "plan", "opcion"])) {
    const pick = pool[Math.floor(Math.random() * Math.min(pool.length, 8))];
    return `Te tiro una idea: ${placeLine(pick)}. ¿Querés que te muestre más opciones de esa categoría?`;
  }

  // Resumen de resultados actuales
  if (hasAny(text, ["estos resultados", "que hay", "resultados actuales", "cuantos resultados"])) {
    if (!pool.length) {
      return "Todavía no hay resultados en pantalla. Hacé una búsqueda para que te pueda contar qué hay cerca.";
    }
    const top = pool.slice(0, 6).map(placeLine).join("\n");
    return `Hay ${pool.length} resultado(s) ahora. Los más cercanos:\n${top}`;
  }

  // Radio de búsqueda
  if (hasAny(text, ["radio", "distancia de busqueda", "cuanto radio"])) {
    return `El radio de búsqueda actual es ${formatDistance(state.radius, true)}. Lo podés cambiar con el control deslizante en Inicio.`;
  }

  // Fallback
  return "No estoy seguro de eso 😅 Puedo contarte sobre los resultados en pantalla, recomendarte algo, mostrarte tus favoritos o explicarte cómo usar la app.";
}

async function sendChatMessage(userText) {
  if (!userText) return;
  appendChatBubble("user", userText);
  showChatTyping(true);
  els.chatSend && (els.chatSend.disabled = true);

  const normalized = normalizeText(userText);
  let reply;
  if (isNearbyActionRequest(normalized)) {
    reply = await runNearbySearchAction(userText);
  } else {
    // Sin red, sin espera real — un breve delay solo para que se sienta natural
    await new Promise((resolve) => setTimeout(resolve, 220));
    reply = buildReply(userText);
  }
  appendChatBubble("model", reply);

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
    appendChatBubble("model", "¡Hola! 👋 Preguntame \"¿qué tengo cerca?\" y hago la búsqueda por vos, o consultame por los resultados en pantalla, tus favoritos, o cómo usar la app. Todo esto lo resuelvo acá en el celular, sin conexión. 📴");
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
  els.chatSuggestions = document.getElementById("chatSuggestions");

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

  if (els.chatSuggestions) {
    els.chatSuggestions.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-chat-suggestion]");
      if (!btn) return;
      sendChatMessage(btn.dataset.chatSuggestion);
    });
  }
}

document.addEventListener("DOMContentLoaded", initChatUI);
// Por si chat.js se carga después de que el DOM ya está listo
if (document.readyState !== "loading") initChatUI();
