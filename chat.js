// ---------------------------------------------------------
// Cerca — Chat con IA (Gemini), conversacional
// ---------------------------------------------------------
// Este archivo se carga DESPUÉS de app.js y lee sus variables
// globales (state, CATEGORY_DEFS, formatDistance) solo para darle
// contexto al chat. No toca ni ejecuta nada de la app — es un
// asistente conversacional que conoce lo que está en pantalla.

const CHAT_CONFIG = {
  // 👉 Pegá acá la URL que te da `wrangler deploy` (ver worker/README.md).
  WORKER_URL: "https://cerca-chat.TU-CUENTA.workers.dev",
  MODEL: "gemini-2.5-flash",
};

const chat = {
  busy: false,
  history: [], // [{role:"user"|"model", parts:[{text}]}]
};

// ---------- Contexto de la app para que el chat responda con onda y precisión ----------
function buildStateContext() {
  const cats = Object.entries(CATEGORY_DEFS).map(([k, v]) => v.label).join(", ");
  const selected = state.selected.size
    ? [...state.selected].map((k) => (CATEGORY_DEFS[k] || {}).label || k).join(", ")
    : "todas";
  const pool = (state.filteredResults && state.filteredResults.length) ? state.filteredResults : state.results;
  const resultsCount = (pool && pool.length) || 0;
  const topResults = (pool || [])
    .slice(0, 12)
    .map((p) => `${p.name} (${(CATEGORY_DEFS[p.category] || {}).label || p.category}, ${formatDistance(p.dist)})`)
    .join(" · ");
  const favs = state.favorites.slice(0, 15).map((f) => f.name).join(", ") || "ninguno";

  return [
    `Categorías que existen en la app: ${cats}.`,
    `Categorías elegidas ahora mismo: ${selected}. Radio de búsqueda: ${state.radius} m.`,
    `Resultados visibles ahora (${resultsCount}): ${topResults || "todavía no buscó nada"}.`,
    `Favoritos guardados: ${favs}.`,
  ].join("\n");
}

function systemInstructionText() {
  return {
    role: "system",
    parts: [{
      text:
`Sos el asistente conversacional de Cerca, una PWA para encontrar bares, cafés, parrillas, farmacias, kioscos y otros lugares cercanos con GPS y OpenStreetMap. Hablás en español rioplatense, corto, cálido y directo, sin exagerar la onda.

Tu rol es SOLO conversar y ayudar a decidir: recomendar, comparar, opinar sobre los lugares que ya aparecen en los resultados o favoritos, explicar cómo usar la app, o simplemente charlar sobre planes cerca. No podés tocar botones ni ejecutar acciones dentro de la app — si el usuario te pide algo que requiere una acción (buscar, guardar, filtrar), explicale en una frase corta cómo hacerlo desde la app (por ejemplo "tocá 'Buscar cerca mío' con la categoría bar elegida").

Basate únicamente en los lugares que te paso como contexto (resultados actuales y favoritos); no inventes lugares que no estén ahí. Si no hay resultados todavía, sugerí que haga una búsqueda primero.

Contexto actual de la app:
${buildStateContext()}`
    }],
  };
}

// ---------- Llamada a Gemini (vía Worker) ----------
async function callGemini() {
  const res = await fetch(CHAT_CONFIG.WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_CONFIG.MODEL,
      contents: chat.history,
      systemInstruction: systemInstructionText(),
      generationConfig: { temperature: 0.6 },
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
  expandChat();
  appendChatBubble("user", userText);
  chat.history.push({ role: "user", parts: [{ text: userText }] });
  showChatTyping(true);
  els.chatSend && (els.chatSend.disabled = true);

  try {
    if (!CHAT_CONFIG.WORKER_URL || CHAT_CONFIG.WORKER_URL.includes("TU-CUENTA")) {
      throw new Error("CONFIG_MISSING");
    }
    const data = await callGemini();
    const candidate = data.candidates && data.candidates[0];
    const parts = (candidate && candidate.content && candidate.content.parts) || [];
    const text = parts.filter((p) => p.text).map((p) => p.text).join("\n").trim() || "No sé bien qué decirte con eso 😅 ¿me lo repetís de otra forma?";
    chat.history.push({ role: "model", parts: [{ text }] });
    appendChatBubble("model", text);
  } catch (err) {
    console.error(err);
    if (err.message === "CONFIG_MISSING") {
      appendChatBubble("model", "El chat todavía no está configurado: falta la URL del Worker en chat.js (CHAT_CONFIG.WORKER_URL). Mirá worker/README.md dentro del proyecto.");
    } else {
      appendChatBubble("model", "No pude conectarme con el asistente. Revisá tu conexión e intentá de nuevo.");
    }
  } finally {
    chat.busy = false;
    showChatTyping(false);
    els.chatSend && (els.chatSend.disabled = false);
  }
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

function expandChat() {
  if (!els.chatDock) return;
  els.chatDock.classList.add("expanded");
  els.chatDockHandle && els.chatDockHandle.setAttribute("aria-expanded", "true");
  if (!els.chatMessages.childElementCount) {
    appendChatBubble("model", "¡Hola! Preguntame lo que quieras sobre los lugares que ves en pantalla, pedime una recomendación o charlemos del plan de hoy.");
  }
}

function toggleChat() {
  if (!els.chatDock) return;
  const willExpand = !els.chatDock.classList.contains("expanded");
  els.chatDock.classList.toggle("expanded", willExpand);
  els.chatDockHandle && els.chatDockHandle.setAttribute("aria-expanded", String(willExpand));
  if (willExpand && !els.chatMessages.childElementCount) {
    appendChatBubble("model", "¡Hola! Preguntame lo que quieras sobre los lugares que ves en pantalla, pedime una recomendación o charlemos del plan de hoy.");
  }
}

function initChatUI() {
  els.chatDock = document.getElementById("chatDock");
  els.chatDockHandle = document.getElementById("chatDockHandle");
  els.chatMessages = document.getElementById("chatMessages");
  els.chatForm = document.getElementById("chatForm");
  els.chatInput = document.getElementById("chatInput");
  els.chatSend = document.getElementById("chatSend");
  els.chatTyping = document.getElementById("chatTyping");
  els.chatSuggestions = document.getElementById("chatSuggestions");

  if (!els.chatDock) return; // markup no presente, no rompemos nada

  els.chatDockHandle.addEventListener("click", toggleChat);
  els.chatInput.addEventListener("focus", expandChat);

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
