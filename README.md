# 🛰️ Satélite de órbita baja

Ventanita flotante que escucha una junta (Teams u otra) y, sin que se lo pidas, te muestra una explicación breve de los conceptos técnicos que van saliendo ("microservicios", "API gateway"…).

```
audio del sistema → Deepgram (STT streaming, es) → OpenAI (¿qué explicar?) → tarjetas en una ventana flotante
```

## Uso

1. `cp .env.example .env` y llena `DEEPGRAM_API_KEY`, `OPENAI_API_KEY` (principal) y, opcional, `OPENAI_API_KEY_RESPALDO`: si la principal falla se usa la de respaldo y la ventanita muestra "respaldo".
2. `npm install && npm run dev` → <http://localhost:4500> (Chrome o Edge).
3. **Iniciar y compartir audio**: elige *Pantalla completa → Compartir audio del sistema* (o la pestaña de Teams con audio). Solo se captura lo que sale por tus bocinas.
4. La ventanita flota con la Document Picture-in-Picture API (si no se abre sola, botón **Flotar ventanita**).

La sección "Transcripción y pruebas" permite meter una frase a mano para afinar el prompt sin audio.

## Dónde ajustar

- `src/routes/api/explain/+server.ts`: prompt y criterio de qué vale la pena explicar.
- `src/lib/session.svelte.ts`: cada cuánto se consulta (`MIN_CHARS`, `MIN_GAP_MS`) y cuántas tarjetas se conservan.

Puerto 4500 (solo local). SvelteKit 2 porque SvelteKit 3 exige Node ≥ 22.17.

## Gasto

La píldora **Hoy · Mes · Total** (arriba a la derecha) y el pie de la ventanita ("Hoy $… · LLM $… · Deepgram $…") muestran el gasto estimado; al hacer clic en la píldora se abre el detalle (`/uso`) en otra pestaña, con una tabla que separa lo del LLM (OpenAI) de lo de Deepgram.

- **OpenAI:** se guardan los tokens reales que devuelve cada llamada (`usage`) y el costo se calcula al leer con los precios de `.env`.
- **Deepgram:** cobra por minuto de audio. El audio va directo del navegador a Deepgram, así que el navegador reporta al servidor cuántos segundos mandó (cada 30 s y al detener).
- Los datos viven en `data/uso.jsonl` (una línea por consumo, fuera de git). Los días y el mes se cuentan en hora de CDMX. Con `USO_FILE` se cambia la ruta.
- Es una **estimación**: no descuenta tokens cacheados ni créditos gratis, y los precios por defecto pueden quedar viejos (`PRECIO_*` en `.env`).

