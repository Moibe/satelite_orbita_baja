import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { causaDeRed, pistaHttp } from '$lib/server/errores';

const URL_GRANT = 'https://api.deepgram.com/v1/auth/grant';

// Un fallo de red suele ser pasajero (DNS, VPN que se reconecta): se reintenta una vez antes de rendirse.
async function pedirToken() {
	for (let intento = 1; ; intento++) {
		try {
			return await fetch(URL_GRANT, {
				method: 'POST',
				headers: {
					Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ ttl_seconds: 120 }),
				signal: AbortSignal.timeout(10_000)
			});
		} catch (e) {
			if (intento >= 2)
				error(
					502,
					`No se pudo conectar con Deepgram (api.deepgram.com): ${causaDeRed(e)}. ` +
						'Revisa tu conexión a internet, VPN o proxy y vuelve a intentar.'
				);
			await new Promise((r) => setTimeout(r, 700));
		}
	}
}

// Token temporal de Deepgram: el navegador abre el WebSocket directo sin ver la API key.
export async function POST() {
	if (!env.DEEPGRAM_API_KEY?.trim())
		error(500, 'Falta DEEPGRAM_API_KEY en .env (créala en console.deepgram.com con rol Member o superior).');

	const res = await pedirToken();
	if (!res.ok) {
		const cuerpo = await res.json().catch(() => null);
		const detalle = cuerpo?.err_msg ?? cuerpo?.message ?? '';
		// 403 aquí = la key sirve para transcribir pero no para emitir tokens: le falta rol.
		const pista =
			res.status === 403
				? 'La key no puede generar tokens: en console.deepgram.com crea una con rol "Member" o superior y reemplázala en .env.'
				: pistaHttp(res.status);
		error(502, `Deepgram respondió ${res.status}${detalle ? ` (${detalle})` : ''}. ${pista}`.trim());
	}

	const datos = await res.json().catch(() => null);
	if (!datos?.access_token)
		error(
			502,
			'Deepgram respondió sin un token válido (la respuesta no es la esperada). ' +
				'Si estás en una red corporativa, un proxy o portal de acceso puede estar interceptando la conexión.'
		);
	return json({ token: datos.access_token });
}
