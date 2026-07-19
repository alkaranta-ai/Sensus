// ---------------------------------------------------------
// Cerca — Chat con IA (Gemini) que puede operar toda la app
// ---------------------------------------------------------
// Este archivo se carga DESPUÉS de app.js y reutiliza sus variables
// globales (state, els, CATEGORY_DEFS, runSearch, toggleFavorite, etc.)
// No modifica app.js: solo lo "maneja" desde afuera, como lo haría
// un usuario tocando botones.

const CHAT_CONFIG = {
  // 👉 Pegá acá la URL que te da `wrangler deploy` (ver worker/README).
  WORKER_URL: "https://cerca-chat.TU-CUENTA.workers.dev",
  MODEL: "gemini-2.5-flash",
};

const CHAT_HISTORY_KEY = "cerca_chat_history_v1";
const chat = {
  open: false,
  busy: false,
  history: [], // [{role:"user"|"model", parts:[{text}]}]
};

// ---------- Definición de herramientas (lo que el chat puede "hacer") ----------
const CHAT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "buscar_lugares",
        description: "Busca lugares cerca de la ubicación del usuario por categoría y radio. Úsalo siempre que el usuario quiera encontrar algo para ir (bar, café, parrilla, farmacia, etc).",
        parameters: {
          type: "object",
          properties: {
            categorias: {
              type: "array",
              items: { type: "string", enum: Object.keys(CATEGORY_DEFS) },
              description: "Categorías a buscar. Si el usuario no especifica, dejar vacío para buscar todas.",
            },
            radio_metros: { type: "number", description: "Radio de búsqueda en metros, entre 300 y 3000. Default 1000." },
          },
        },
      },
      {
        name: "filtrar_texto",
        description: "Filtra los resultados actuales por texto (nombre del lugar).",
        parameters: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
      },
      {
        name: "limpiar_filtro_texto",
        description: "Quita el filtro de texto sobre los resultados actuales.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "ordenar_resultados",
        description: "Cambia el orden de los resultados actuales.",
        parameters: {
          type: "object",
          properties: { criterio: { type: "string", enum: ["distancia", "nombre", "categoria"] } },
          required: ["criterio"],
        },
      },
      {
        name: "filtro_abierto_ahora",
        description: "Activa o desactiva el filtro de 'abierto ahora' sobre los resultados.",
        parameters: { type: "object", properties: { activar: { type: "boolean" } }, required: ["activar"] },
      },
      {
        name: "cambiar_vista",
        description: "Cambia entre ver los resultados en lista o en mapa.",
        parameters: { type: "object", properties: { vista: { type: "string", enum: ["lista", "mapa"] } }, required: ["vista"] },
      },
      {
        name: "ir_a_pestana",
        description: "Navega a una sección/pestaña de la app.",
        parameters: {
          type: "object",
          properties: { pestana: { type: "string", enum: ["inicio", "busquedas", "mapa", "favoritos", "menu"] } },
          required: ["pestana"],
        },
      },
      {
        name: "ver_lugar",
        description: "Abre la ficha con el detalle de un lugar de los resultados actuales o de favoritos.",
        parameters: { type: "object", properties: { lugar: { type: "string", description: "Nombre (o parte del nombre) del lugar." } }, required: ["lugar"] },
      },
      {
        name: "agregar_favorito",
        description: "Marca un lugar de los resultados actuales como favorito.",
        parameters: { type: "object", properties: { lugar: { type: "string" } }, required: ["lugar"] },
      },
      {
        name: "quitar_favorito",
        description: "Saca un lugar de favoritos.",
        parameters: { type: "object", properties: { lugar: { type: "string" } }, required: ["lugar"] },
      },
      {
        name: "agregar_nota",
        description: "Agrega o reemplaza una nota personal sobre un lugar (ej: 'pedir la de fernet').",
        parameters: {
          type: "object",
          properties: { lugar: { type: "string" }, nota: { type: "string" } },
          required: ["lugar", "nota"],
        },
      },
      {
        name: "compartir_lugar",
        description: "Comparte un lugar (abre el selector nativo de compartir o WhatsApp).",
        parameters: { type: "object", properties: { lugar: { type: "string" } }, required: ["lugar"] },
      },
      {
        name: "guardar_auto",
        description: "Guarda la ubicación actual del usuario como 'dónde estacionó el auto'.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "ver_auto",
        description: "Muestra dónde quedó guardado el auto y la distancia hasta ahí.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "borrar_auto",
        description: "Borra la ubicación guardada del auto.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "cambiar_color_acento",
        description: "Cambia el color de acento de la app.",
        parameters: {
          type: "object",
          properties: { color: { type: "string", enum: ["amber", "blue", "pink", "green", "purple", "teal"] } },
          required: ["color"],
        },
      },
      {
        name: "modo_oscuro",
        description: "Activa o desactiva el modo oscuro.",
        parameters: { type: "object", properties: { activar: { type: "boolean" } }, required: ["activar"] },
      },
      {
        name: "aplicar_combo",
        description: "Aplica un combo de categorías guardado por su nombre (ej: 'Previa').",
        parameters: { type: "object", properties: { nombre: { type: "string" } }, required: ["nombre"] },
      },
      {
        name: "sugerencia_del_dia",
        description: "Muestra la sugerencia aleatoria del día.",
        parameters: { type: "object", properties: {} },
      },
    ],
  },
];

// ---------- Estado de la app en texto, para darle contexto al modelo ----------
function buildStateContext() {
  const cats = Object.entries(CATEGORY_DEFS).map(([k, v]) => `${k} (${v.label})`).join(", ");
  const selected = state.selected.size ? [...state.selected].join(", ") : "todas";
  const resultsCount = (state.filteredResults && state.filteredResults.length) || state.results.length || 0;
  const topResults = (state.filteredResults && state.filteredResults.length ? state.filteredResults : state.results)
    .slice(0, 12)
    .map((p) => `${p.name} [${p.category}, ${formatDistance(p.dist)}]`)
    .join(" · ");
  const favs = state.favorites.slice(0, 15).map((f) => f.name).join(", ") || "ninguno";
  const combos = (state.combos || []).map((c) => c.name).join(", ") || "ninguno";

  return [
    `Categorías disponibles: ${cats}.`,
    `Categorías seleccionadas ahora: ${selected}. Radio actual: ${state.radius} m.`,
    `Pestaña activa: ${state.activeTab}. Vista: ${state.view}.`,
    `Resultados visibles ahora (${resultsCount}): ${topResults || "sin resultados todavía"}.`,
    `Favoritos guardados: ${favs}.`,
    `Combos guardados: ${combos}.`,
    `Auto guardado: ${state.car ? "sí" : "no"}.`,
    `Ubicación del usuario conocida: ${state.userLat != null ? "sí" : "no (todavía no buscó nada)"}.`,
  ].join("\n");
}

function systemInstructionText() {
  return {
    role: "system",
    parts: [{
      text:
`Sos el asistente de Cerca, una PWA para encontrar bares, cafés, parrillas, farmacias, kioscos y otros lugares cercanos usando el GPS y OpenStreetMap. Hablás en español rioplatense, corto y directo, con onda pero sin exagerar.

Tu trabajo es ayudar a la persona Y TAMBIÉN operar la app por ella usando las herramientas (functions) disponibles: buscar lugares, filtrar, ordenar, cambiar de vista, ir a pestañas, agregar favoritos y notas, guardar el auto, cambiar colores, etc. Cuando el pedido implique una acción concreta, SIEMPRE llamá a la función correspondiente en lugar de solo explicar cómo hacerlo a mano.

Si el usuario pide algo ambiguo (ej. "un lugar para tomar algo"), interpretá la categoría más razonable (bar, cafe) y buscá directamente, no preguntes de más.

Después de ejecutar una acción, respondé breve confirmando qué hiciste, en base al resultado que te llega de la función. Si una función devuelve un error (por ejemplo, no encontró el lugar por nombre), decíselo a la persona y pedile que aclare o que mire los resultados en pantalla.

No inventes lugares que no estén en los resultados o favoritos que te paso como contexto.

Estado actual de la app:
${buildStateContext()}`
    }],
  };
}

// ---------- Helpers ----------
function normalizeStr(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function fuzzyFindPlace(query) {
  if (!query) return null;
  const q = normalizeStr(query);
  const pools = [
    state.filteredResults && state.filteredResults.length ? state.filteredResults : [],
    state.results || [],
    state.favorites || [],
  ];
  for (const pool of pools) {
    const exact = pool.find((p) => normalizeStr(p.name) === q);
    if (exact) return exact;
  }
  for (const pool of pools) {
    const partial = pool.find((p) => normalizeStr(p.name).includes(q) || q.includes(normalizeStr(p.name)));
    if (partial) return partial;
  }
  return null;
}

function catKeyFromLabel(input) {
  const q = normalizeStr(input);
  if (CATEGORY_DEFS[q]) return q;
  const found = Object.entries(CATEGORY_DEFS).find(([k, v]) => normalizeStr(v.label) === q || normalizeStr(k) === q);
  return found ? found[0] : null;
}

// ---------- Ejecutor de acciones: acá el chat "toca los botones" de la app ----------
async function executeChatAction(name, args) {
  args = args || {};
  try {
    switch (name) {
      case "buscar_lugares": {
        let cats = (args.categorias || []).map(catKeyFromLabel).filter(Boolean);
        const radius = args.radio_metros ? Math.min(3000, Math.max(300, Math.round(args.radio_metros))) : state.radius;
        switchTab("inicio");
        await runSearch({ cats, radius });
        const n = state.results.length;
        return { ok: true, message: n > 0
          ? `Encontré ${n} lugar(es). Los más cercanos: ${state.filteredResults.slice(0, 5).map((p) => `${p.name} (${formatDistance(p.dist)})`).join(", ")}.`
          : "No encontré lugares en ese radio con esas categorías." };
      }
      case "filtrar_texto": {
        state.searchText = args.texto || "";
        if (els.searchText) els.searchText.value = state.searchText;
        renderResults();
        return { ok: true, message: `Filtrado por "${args.texto}": ${state.filteredResults.length} resultado(s).` };
      }
      case "limpiar_filtro_texto": {
        state.searchText = "";
        if (els.searchText) els.searchText.value = "";
        renderResults();
        return { ok: true, message: "Saqué el filtro de texto." };
      }
      case "ordenar_resultados": {
        const map = { distancia: "dist", nombre: "name", categoria: "category" };
        state.settings.sortBy = map[args.criterio] || "dist";
        if (els.sortSelect) els.sortSelect.value = state.settings.sortBy;
        saveSettings();
        renderResults();
        return { ok: true, message: `Ordenado por ${args.criterio}.` };
      }
      case "filtro_abierto_ahora": {
        state.settings.openNowOnly = !!args.activar;
        if (els.openNowToggle) els.openNowToggle.checked = state.settings.openNowOnly;
        saveSettings();
        renderResults();
        return { ok: true, message: state.settings.openNowOnly ? "Filtrando solo lugares abiertos ahora." : "Saqué el filtro de 'abierto ahora'." };
      }
      case "cambiar_vista": {
        setView(args.vista === "mapa" ? "map" : "list");
        return { ok: true, message: `Vista cambiada a ${args.vista}.` };
      }
      case "ir_a_pestana": {
        switchTab(args.pestana);
        return { ok: true, message: `Te llevé a ${args.pestana}.` };
      }
      case "ver_lugar": {
        const p = fuzzyFindPlace(args.lugar);
        if (!p) return { ok: false, message: `No encontré "${args.lugar}" entre los resultados o favoritos actuales.` };
        openPlaceSheet(p);
        return { ok: true, message: `Abrí la ficha de ${p.name}.` };
      }
      case "agregar_favorito": {
        const p = fuzzyFindPlace(args.lugar);
        if (!p) return { ok: false, message: `No encontré "${args.lugar}" entre los resultados actuales.` };
        if (!isFavorite(p.id)) toggleFavorite(p);
        return { ok: true, message: `${p.name} agregado a favoritos ⭐.` };
      }
      case "quitar_favorito": {
        const p = fuzzyFindPlace(args.lugar);
        if (!p) return { ok: false, message: `No encontré "${args.lugar}" en favoritos.` };
        if (isFavorite(p.id)) toggleFavorite(p);
        return { ok: true, message: `Saqué ${p.name} de favoritos.` };
      }
      case "agregar_nota": {
        const p = fuzzyFindPlace(args.lugar);
        if (!p) return { ok: false, message: `No encontré "${args.lugar}".` };
        setNote(p.id, args.nota);
        return { ok: true, message: `Nota guardada en ${p.name}: "${args.nota}".` };
      }
      case "compartir_lugar": {
        const p = fuzzyFindPlace(args.lugar);
        if (!p) return { ok: false, message: `No encontré "${args.lugar}".` };
        await sharePlace(p);
        return { ok: true, message: `Abrí para compartir ${p.name}.` };
      }
      case "guardar_auto": {
        try {
          const pos = await getPosition();
          state.car = { lat: pos.coords.latitude, lon: pos.coords.longitude, ts: Date.now() };
          saveCar();
          updateCarMenuItem();
          return { ok: true, message: "Guardado: acá quedó el auto 🚗." };
        } catch (e) {
          return { ok: false, message: "No pude obtener la ubicación para guardar el auto." };
        }
      }
      case "ver_auto": {
        if (!state.car) return { ok: false, message: "Todavía no guardaste dónde estacionaste." };
        const dist = state.userLat != null ? haversine(state.userLat, state.userLon, state.car.lat, state.car.lon) : null;
        if (els.menuCar) { switchTab("menu"); els.menuCar.click(); }
        return { ok: true, message: `Tu auto está guardado${dist != null ? ` a ${formatDistance(dist)}` : ""}.` };
      }
      case "borrar_auto": {
        state.car = null;
        saveCar();
        updateCarMenuItem();
        return { ok: true, message: "Borré la ubicación del auto." };
      }
      case "cambiar_color_acento": {
        state.settings.accent = args.color;
        applyAccent(args.color);
        saveSettings();
        return { ok: true, message: `Cambié el color de acento a ${args.color}.` };
      }
      case "modo_oscuro": {
        setDarkMode(!!args.activar);
        return { ok: true, message: args.activar ? "Activé el modo oscuro." : "Desactivé el modo oscuro." };
      }
      case "aplicar_combo": {
        const combo = (state.combos || []).find((c) => normalizeStr(c.name) === normalizeStr(args.nombre) || normalizeStr(c.name).includes(normalizeStr(args.nombre)));
        if (!combo) return { ok: false, message: `No encontré el combo "${args.nombre}".` };
        applyCombo(combo);
        return { ok: true, message: `Apliqué el combo "${combo.name}".` };
      }
      case "sugerencia_del_dia": {
        if (els.suggestionBtn) { switchTab("inicio"); els.suggestionBtn.click(); }
        return { ok: true, message: "Ahí tenés la sugerencia del día." };
      }
      default:
        return { ok: false, message: `Acción desconocida: ${name}.` };
    }
  } catch (err) {
    console.error("Error ejecutando acción de chat:", name, err);
    return { ok: false, message: "Se rompió algo tratando de hacer eso. Probá de nuevo." };
  }
}

// ---------- Llamada a Gemini (vía Worker) ----------
async function callGemini() {
  const res = await fetch(CHAT_CONFIG.WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_CONFIG.MODEL,
      contents: chat.history,
      tools: CHAT_TOOLS,
      systemInstruction: systemInstructionText(),
      generationConfig: { temperature: 0.4 },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Worker/Gemini respondió ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function sendChatMessage(userText) {
  if (!userText || chat.busy) return;
  chat.busy = true;
  appendChatBubble("user", userText);
  chat.history.push({ role: "user", parts: [{ text: userText }] });
  showChatTyping(true);
  els.chatSend && (els.chatSend.disabled = true);

  try {
    if (!CHAT_CONFIG.WORKER_URL || CHAT_CONFIG.WORKER_URL.includes("TU-CUENTA")) {
      throw new Error("CONFIG_MISSING");
    }

    let guard = 0;
    let finalText = "";
    while (guard < 5) {
      guard++;
      const data = await callGemini();
      const candidate = data.candidates && data.candidates[0];
      const parts = (candidate && candidate.content && candidate.content.parts) || [];
      const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
      const textParts = parts.filter((p) => p.text).map((p) => p.text).join("\n").trim();

      if (functionCalls.length === 0) {
        finalText = textParts || "Listo.";
        chat.history.push({ role: "model", parts: [{ text: finalText }] });
        break;
      }

      // Guardamos el turno del modelo (con los function calls) tal cual vino
      chat.history.push({ role: "model", parts });

      // Ejecutamos cada acción pedida y devolvemos el resultado
      const responseParts = [];
      for (const fc of functionCalls) {
        const result = await executeChatAction(fc.name, fc.args);
        responseParts.push({
          functionResponse: { name: fc.name, response: result },
        });
      }
      chat.history.push({ role: "user", parts: responseParts });
    }

    if (finalText) appendChatBubble("model", finalText);
  } catch (err) {
    console.error(err);
    if (err.message === "CONFIG_MISSING") {
      appendChatBubble("model", "El chat todavía no está configurado: falta la URL del Worker en chat.js (CHAT_CONFIG.WORKER_URL). Mirá worker/README dentro del proyecto.");
    } else {
      appendChatBubble("model", "No pude conectarme con el asistente. Revisá tu conexión e intentá de nuevo.");
    }
  } finally {
    chat.busy = false;
    showChatTyping(false);
    els.chatSend && (els.chatSend.disabled = false);
  }
}

// ---------- UI del chat ----------
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
  if (els.chatInput) els.chatInput.focus();
  if (els.chatMessages && !els.chatMessages.childElementCount) {
    appendChatBubble("model", "¡Hola! Soy el asistente de Cerca. Pedime cosas como \"buscame una parrilla cerca\", \"marcá el auto acá\" o \"mostrame mis favoritos\" y lo hago por vos.");
  }
}

function closeChat() {
  chat.open = false;
  if (els.chatOverlay) els.chatOverlay.classList.remove("open");
  setTimeout(() => { if (els.chatOverlay && !chat.open) els.chatOverlay.hidden = true; }, 220);
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
