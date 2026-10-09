import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const SYSTEM = `Eres un "satélite" que acompaña en silencio a una persona durante una junta en español. Recibes lo último que se dijo (transcripción automática, puede traer errores de reconocimiento) y decides si vale la pena explicarle algún concepto para que no pierda el hilo.

Explica SOLO conceptos técnicos o de negocio que alguien razonablemente podría no conocer: tecnologías, arquitecturas, siglas, metodologías, herramientas, términos de dominio.
NO expliques: palabras cotidianas, nombres de personas o empresas, conceptos de la lista "ya explicados", ni nada que el perfil de la persona indique que ya domina.
Si la transcripción parece mal reconocida (ej. "micro servicios" / "mikroservicios"), normaliza el término.
Prefiere no decir nada antes que ser ruidoso. Como máximo 2 conceptos por respuesta, normalmente 0 o 1.
Cada explicación: 1 o 2 frases cortas (máx. ~30 palabras), en español claro, lo que importa para entender la conversación, sin preámbulos.
Responde solo con el JSON pedido; si no hay nada que explicar, "conceptos" va vacío.`;

const SCHEMA = {
	name: 'conceptos',
	strict: true,
	schema: {
		type: 'object',
		additionalProperties: false,
		properties: {
			conceptos: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					properties: {
						termino: { type: 'string', description: 'Nombre corto del concepto' },
						explicacion: { type: 'string' }
					},
					required: ['termino', 'explicacion']
				}
			}
		},
		required: ['conceptos']
	}
};

export async function POST({ request }) {
	if (!env.OPENAI_API_KEY) error(500, 'Falta OPENAI_API_KEY en .env');

	const { texto, contexto, perfil, yaExplicados } = (await request.json()) as {
		texto: string;
		contexto?: string;
		perfil?: string;
		yaExplicados?: string[];
	};
	if (!texto?.trim()) return json({ conceptos: [] });

	const res = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: env.EXPLAIN_MODEL || 'gpt-4o-mini',
			// Holgura por si EXPLAIN_MODEL es un modelo de razonamiento (gpt-5…), que gasta tokens pensando.
			max_completion_tokens: 1500,
			response_format: { type: 'json_schema', json_schema: SCHEMA },
			messages: [
				{ role: 'system', content: SYSTEM },
				{
					role: 'user',
					content:
						`Perfil de la persona: ${perfil?.trim() || '(sin especificar)'}\n` +
						`Ya explicados: ${yaExplicados?.join(', ') || '(ninguno)'}\n\n` +
						`Contexto previo de la junta:\n${contexto?.trim() || '(inicio)'}\n\n` +
						`LO ÚLTIMO QUE SE DIJO:\n${texto.trim()}`
				}
			]
		})
	});
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		error(502, `OpenAI (${res.status}): ${body?.error?.message ?? 'error desconocido'}`);
	}

	const data = await res.json();
	try {
		const { conceptos } = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
		return json({ conceptos: Array.isArray(conceptos) ? conceptos.slice(0, 2) : [] });
	} catch {
		return json({ conceptos: [] });
	}
}
