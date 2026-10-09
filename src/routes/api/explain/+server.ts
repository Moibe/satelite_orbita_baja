import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const SYSTEM = `Eres un "satélite" que acompaña en silencio a una persona durante una junta en español. Recibes lo último que se dijo (transcripción automática, puede traer errores de reconocimiento) y decides si vale la pena explicarle algún concepto para que no pierda el hilo.

Explica SOLO conceptos técnicos o de negocio que alguien razonablemente podría no conocer: tecnologías, arquitecturas, siglas, metodologías, herramientas, términos de dominio.
NO expliques: palabras cotidianas, nombres de personas o empresas, conceptos de la lista "ya explicados", ni nada que el perfil de la persona indique que ya domina.
Si la transcripción parece mal reconocida (ej. "micro servicios" / "mikroservicios"), normaliza el término.
Prefiere no decir nada antes que ser ruidoso. Como máximo 2 conceptos por respuesta, normalmente 0 o 1.
Cada explicación: 1 o 2 frases cortas (máx. ~25 palabras), en español claro, solo lo que importa para entender la conversación.
La explicación va al grano: NO repitas el término ni abras con "Es...", "Son...", "Se refiere a...", "Un X es...". El término ya se muestra como título aparte; arranca directo con la definición.
  Mal: "Un monolito es una arquitectura donde todo va junto."
  Bien: "Arquitectura donde toda la app va en una sola pieza, difícil de escalar por partes."
  Mal: "Kubernetes es una plataforma que orquesta contenedores."
  Bien: "Orquestador de contenedores: reparte, escala y reinicia servicios solo."
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

// Llave principal (CSI) y respaldo (personal). Si la principal falla, se intenta con la de respaldo.
const KEYS = () =>
	[
		{ via: 'principal', key: env.OPENAI_API_KEY },
		{ via: 'respaldo', key: env.OPENAI_API_KEY_RESPALDO }
	].filter((k): k is { via: string; key: string } => !!k.key?.trim());

// Una llave que falló se salta un rato para no pagar un intento fallido en cada consulta.
const COOLDOWN_MS = 60_000;
const downUntil = new Map<string, number>();

export async function POST({ request }) {
	const keys = KEYS();
	if (!keys.length) error(500, 'Falta OPENAI_API_KEY en .env');

	const { texto, contexto, perfil, yaExplicados } = (await request.json()) as {
		texto: string;
		contexto?: string;
		perfil?: string;
		yaExplicados?: string[];
	};
	if (!texto?.trim()) return json({ conceptos: [] });

	const body = JSON.stringify({
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
	});

	// Las llaves en cooldown van al final: se usan solo si ya no queda otra.
	const now = Date.now();
	const ordered = [
		...keys.filter((k) => (downUntil.get(k.via) ?? 0) <= now),
		...keys.filter((k) => (downUntil.get(k.via) ?? 0) > now)
	];

	const failures: string[] = [];
	for (const { via, key } of ordered) {
		let res: Response;
		try {
			res = await fetch(`${env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
				body
			});
		} catch (e) {
			downUntil.set(via, Date.now() + COOLDOWN_MS);
			failures.push(`${via}: sin conexión`);
			continue;
		}

		if (!res.ok) {
			const err = await res.json().catch(() => null);
			const msg = `${via}: OpenAI ${res.status} ${err?.error?.message ?? ''}`.trim();
			// Un 400 es culpa de la petición, no de la llave: otra llave no lo arregla.
			if (res.status === 400) error(502, msg);
			downUntil.set(via, Date.now() + COOLDOWN_MS);
			failures.push(msg);
			console.warn(`[explain] ${msg}`);
			continue;
		}

		downUntil.delete(via);
		const data = await res.json();
		try {
			const { conceptos } = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
			return json({ conceptos: Array.isArray(conceptos) ? conceptos.slice(0, 2) : [], via });
		} catch {
			return json({ conceptos: [], via });
		}
	}

	error(502, failures.join(' | '));
}
