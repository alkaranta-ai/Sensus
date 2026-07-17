# Cerca 📍

App web instalable (PWA) para encontrar **bares, cafés, parrillas, restaurantes, pizzerías y heladerías** cerca tuyo usando el GPS del celular. No necesita backend ni API keys: usa la geolocalización del navegador + [OpenStreetMap / Overpass API](https://overpass-api.de/) (gratis).

## Cómo funciona

1. Elegís qué categorías buscar (o dejás todas).
2. Ajustás el radio de búsqueda (300 m a 3 km).
3. Tocás **"Buscar cerca mío"** → el navegador pide permiso de ubicación.
4. La app consulta Overpass API y muestra los lugares ordenados por distancia, en lista o en mapa.

## Estructura del proyecto

```
cerca-app/
├── index.html        # UI principal
├── style.css          # Estilos (tema carbón/ámbar)
├── app.js             # Lógica: geolocalización, Overpass, render
├── manifest.json       # Manifest PWA (nombre, íconos, colores)
├── sw.js               # Service worker (cache offline del shell)
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
