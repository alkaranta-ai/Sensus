# Cerca 📍

## Novedades de esta versión

- ⭐ **Favoritos** (pestaña propia) + 📝 **notas por lugar** ("pedir la de fernet", etc.)
- **Orden de resultados**: distancia, nombre o categoría
- 🕒 **Filtro "abierto ahora"** (parsea `opening_hours` de OSM)
- **Búsqueda por texto** dentro de los resultados
- 4 categorías nuevas: 🏧 Cajero, ⛽ Estación de servicio, 🏪 Kiosco, 🐾 Veterinaria
  *(nota: "farmacia de turno" no se puede filtrar automáticamente — ese dato no está mapeado de forma estándar en OSM)*
- 💾 **Búsquedas favoritas con nombre** (ej. "Salida con amigos"), separadas de "Recientes"
- Radio y categorías **quedan como default** la próxima vez que abrís la app
- 🎨 **Selector de color de acento** (6 opciones) en el Menú
- 🎲 **Sugerencia del día**: un lugar al azar cerca tuyo, una vez por día
- 🗺️ En el mapa: **clusters** de pines cuando hay muchos resultados juntos, y **filtro por categoría** tocando los chips de arriba del mapa
- 🚗 **"Cerca del auto"**: guardá dónde estacionaste desde el Menú
- 🖼️ **Compartir tarjeta** de un lugar como imagen (además del texto)
- ✈️ Compartir por **Telegram** y 🔗 **copiar link**, además de WhatsApp
- ⭐ Se muestra el **rating** (`stars`/`rating` de OSM) cuando el lugar lo tiene cargado


App web instalable (PWA) para encontrar **bares, cafés, parrillas, restaurantes, pizzerías y heladerías** cerca tuyo usando el GPS del celular. No necesita backend ni API keys: usa la geolocalización del navegador + [OpenStreetMap / Overpass API](https://overpass-api.de/) (gratis).

## Cómo funciona

1. Elegís qué categorías buscar (o dejás todas).
2. Ajustás el radio de búsqueda (300 m a 3 km).
3. Tocás **"Buscar cerca mío"** → el navegador pide permiso de ubicación.
4. La app consulta Overpass API y muestra los lugares ordenados por distancia, en lista o en mapa.

## 💬 Chat 100% local

Cerca tiene un cajón de chat **siempre visible** arriba del dock (el
input y el botón de "Asistente de Cerca" nunca se ocultan; tocando el
cajón se expande para ver la conversación). Es un asistente por reglas
(sin IA, sin servidor, sin conexión a internet): conoce los resultados y
favoritos que están en pantalla y responde con eso — recomienda, cuenta
cuál está más cerca o mejor calificado, muestra tus favoritos o explica
cómo usar la app. Si le pedís algo como **"¿qué tengo cerca?"** o
**"buscá bares"**, ejecuta de verdad la búsqueda (la misma función que
el botón "Buscar cerca mío") y te muestra los resultados frescos, tanto
en el chat como en la pantalla de Inicio. Todo corre en `chat.js`, en el
propio dispositivo. No requiere configuración ni API key.

## Estructura del proyecto

```
cerca-app/
├── index.html        # UI principal
├── style.css          # Estilos (tema carbón/ámbar)
├── app.js             # Lógica: geolocalización, Overpass, render
├── manifest.json       # Manifest PWA (nombre, íconos, colores)
├── sw.js               # Service worker (cache offline del shell)
├── chat.js             # Chat 100% local por reglas (sin red, sin servidor)
├── icons/               # Íconos 192/512 (normal + maskable)
└── make_icons.py        # Script que generó los íconos (opcional, no se usa en runtime)
```

## Publicar en GitHub Pages (gratis, en minutos)

1. Creá un repo nuevo en GitHub (por ejemplo `cerca-app`) y subí **todo el contenido de esta carpeta** a la raíz del repo:

   ```bash
   cd cerca-app
   git init
   git add .
   git commit -m "Cerca: PWA de lugares cercanos"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/cerca-app.git
   git push -u origin main
   ```

2. En el repo de GitHub: **Settings → Pages**.
3. En "Build and deployment" → **Source: Deploy from a branch**.
4. Elegí branch `main`, carpeta `/ (root)` → **Save**.
5. Esperá 1-2 minutos. Tu app queda publicada en:

   ```
   https://TU_USUARIO.github.io/cerca-app/
   ```

   > ⚠️ Importante: la app **tiene que servirse por HTTPS** para que la geolocalización y el Service Worker funcionen. GitHub Pages ya lo hace automáticamente.

## Instalar en el celular

### Android (Chrome)
1. Abrí la URL de GitHub Pages en Chrome.
2. Tocá el menú (⋮) → **"Instalar app"** o **"Agregar a pantalla de inicio"**.
3. Confirmá. Queda como app nativa, con ícono propio.

### iOS (Safari)
1. Abrí la URL en **Safari** (tiene que ser Safari, no Chrome — iOS solo permite instalar PWAs desde Safari).
2. Tocá el botón de **Compartir** (el cuadrado con flecha hacia arriba).
3. Elegí **"Agregar a pantalla de inicio"**.
4. Confirmá el nombre y tocá **Agregar**.

## Personalizar

- **Colores / tipografías**: editá las variables al inicio de `style.css` (`:root { --bg, --amber, ... }`).
- **Categorías**: agregá o modificá entradas en `CATEGORY_DEFS` dentro de `app.js`. Cada categoría define filtros [Overpass QL](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL) sobre tags de OpenStreetMap (`amenity`, `cuisine`, etc.).
- **Radio máximo**: cambiá `max` en el `<input type="range">` de `index.html`.
- **Íconos**: corré `python3 make_icons.py` (requiere `pip install pillow`) para regenerarlos si cambiás los colores.

## Notas técnicas

- Los datos de lugares vienen de OpenStreetMap vía Overpass API — son colaborativos y pueden faltar lugares en zonas con poco mapeo. Si el resultado te queda pobre en tu zona, se puede migrar a Google Places API (de pago, con key) reemplazando `queryOverpass()` en `app.js`.
- El Service Worker solo cachea el "app shell" (HTML/CSS/JS/íconos) para que la app abra rápido offline; las búsquedas en sí necesitan conexión.
- Sin backend propio: todo corre en el navegador del usuario.

## Licencia

Datos de lugares: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), bajo licencia [ODbL](https://opendatacommons.org/licenses/odbl/).
