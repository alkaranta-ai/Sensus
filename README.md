# Cerca — Chat IA (Worker de Cloudflare)

El chat de Cerca usa **Gemini** para entender lo que pedís y "tocar los botones"
de la app por vos (buscar, filtrar, favoritos, auto, colores, etc). Como la
app no tiene backend propio, este Worker de Cloudflare cumple un solo rol:
esconder tu API key de Gemini y reenviar el pedido. Es gratis en el plan
Free de Cloudflare para este volumen de uso.

## 1. Conseguir una API key de Gemini

1. Entrá a https://aistudio.google.com/apikey
2. Creá una API key (gratis, con límite de uso por minuto/día).

## 2. Deployar el Worker

Necesitás Node instalado. Desde esta carpeta (`worker/`):

```bash
npm install -g wrangler
wrangler login
wrangler secret put GEMINI_API_KEY
# pegá acá la key que generaste en el paso 1

wrangler deploy
```

Al terminar, `wrangler` te va a mostrar una URL como:

```
https://cerca-chat.tu-cuenta.workers.dev
```

## 3. Conectar el Worker con la app

Abrí `chat.js` (en la raíz del proyecto, no en esta carpeta) y reemplazá:

```js
WORKER_URL: "https://cerca-chat.TU-CUENTA.workers.dev",
```

por la URL real que te dio `wrangler deploy`. Subí el cambio a GitHub y listo
— GitHub Pages sirve la app y las llamadas de chat van al Worker de Cloudflare.

## Notas

- El Worker no guarda nada: solo reenvía el pedido a Gemini con tu key y
  devuelve la respuesta. La conversación vive en el navegador del usuario.
- Si algún día querés restringir qué sitios pueden llamar al Worker, cambiá
  `ALLOWED_ORIGINS` en `worker.js` por tu dominio de GitHub Pages en vez de `"*"`.
- Si cambiás mucho el modelo de Gemini (`gemini-2.5-flash` por default), fijate
  que el modelo elegido soporte *function calling*.
