import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Token temporal de Deepgram: el navegador abre el WebSocket directo sin ver la API key.
export async function POST() {
	if (!env.DEEPGRAM_API_KEY) error(500, 'Falta DEEPGRAM_API_KEY en .env');

	const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
		method: 'POST',
		headers: {
			Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ ttl_seconds: 120 })
	});
	if (!res.ok) error(502, `Deepgram rechazó la key (${res.status}): ${await res.text()}`);

	const { access_token } = await res.json();
	return json({ token: access_token });
}
