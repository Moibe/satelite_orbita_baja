import { json, error } from '@sveltejs/kit';
import { registrarDeepgram, resumen } from '$lib/server/uso';

// Lectura del monitor de gasto (hoy / mes / total).
export async function GET() {
	return json(await resumen());
}

// El audio va directo del navegador a Deepgram, así que el servidor no ve cuánto se transcribió:
// el navegador reporta aquí los segundos de audio que mandó, y devuelve el resumen ya actualizado.
const MAX_SEGUNDOS_POR_REPORTE = 4 * 3600;

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const segundos = Number(body?.segundos);
	if (!Number.isFinite(segundos) || segundos <= 0 || segundos > MAX_SEGUNDOS_POR_REPORTE)
		error(400, 'segundos debe ser un número entre 0 y 14400');

	await registrarDeepgram(Math.round(segundos * 100) / 100);
	return json(await resumen());
}
