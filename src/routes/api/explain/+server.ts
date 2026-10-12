import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { registrarOpenAI } from '$lib/server/uso';
import { causaDeRed, pistaHttp } from '$lib/server/errores';

const SYSTEM = `Eres un "satélite" que acompaña en silencio a una persona durante una junta. La junta suele ser en español, pero puede tener partes en inglés o mezclar ambos idiomas. Recibes lo último que se dijo (transcripción automática, puede traer errores de reconocimiento) y decides si vale la pena explicarle algún concepto para que no pierda el hilo.
Responde SIEMPRE en español, aunque lo dicho esté en inglés; el término se deja como se dijo (ej. "API gateway", "rate limiting").

Explica SOLO conceptos técnicos o de negocio que alguien razonablemente podría no conocer: tecnologías, arquitecturas, siglas, metodologías, herramientas, términos de dominio.
NO expliques: palabras cotidianas, nombres de personas o empresas, conceptos de la lista "ya explicados", ni nada que el perfil de la persona indique que ya domina.
Si la transcripción parece mal reconocida (ej. "micro servicios" / "mikroservicios" / "Cubernets"), normaliza el término.
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

const ETIQUETA: Record<string, string> = { principal: 'llave principal', respaldo: 'llave de respaldo' };

export async function POST({ request }) {
	const keys = KEYS();
	if (!keys.length) error(500, 'Falta OPENAI_API_KEY en .env (créala en platform.openai.com/api-keys).');

	const entrada = (await request.json().catch(() => null)) as {
		texto?: string;
		contexto?: string;
		perfil?: string;
		yaExplicados?: string[];
	} | null;
	if (!entrada) error(400, 'La petición a /api/explain no trae un JSON válido.');
	const { texto, contexto, perfil, yaExplicados } = entrada;
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
				body,
				signal: AbortSignal.timeout(30_000)
			});
		} catch (e) {
			downUntil.set(via, Date.now() + COOLDOWN_MS);
			failures.push(`${ETIQUETA[via]}: no se pudo conectar con OpenAI: ${causaDeRed(e)}`);
			continue;
		}

		if (!res.ok) {
			const err = await res.json().catch(() => null);
			const detalle = err?.error?.message ? ` (${err.error.message})` : '';
			const msg = `${ETIQUETA[via]}: OpenAI respondió ${res.status}${detalle}. ${pistaHttp(res.status)}`.trim();
			// Un 400 es culpa de la petición, no de la llave: otra llave no lo arregla.
			if (res.status === 400) error(502, msg);
			downUntil.set(via, Date.now() + COOLDOWN_MS);
			failures.push(msg);
			console.warn(`[explain] ${msg}`);
			continue;
		}

		const data = await res.json().catch(() => null);
		if (!data) {
			// Un 200 que no es JSON suele ser un portal de red o un proxy que intercepta la conexión.
			downUntil.set(via, Date.now() + COOLDOWN_MS);
			failures.push(`${ETIQUETA[via]}: OpenAI respondió algo que no es JSON (¿proxy o portal de red?)`);
			continue;
		}
		downUntil.delete(via);
		// Se registra apenas responde OpenAI (aunque luego el JSON no se pueda leer): los tokens ya se cobraron.
		await registrarOpenAI({
			modelo: data.model ?? (env.EXPLAIN_MODEL || 'gpt-4o-mini'),
			via,
			input_tokens: data.usage?.prompt_tokens ?? 0,
			output_tokens: data.usage?.completion_tokens ?? 0
		});
		try {
			const { conceptos } = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
			return json({ conceptos: Array.isArray(conceptos) ? conceptos.slice(0, 2) : [], via });
		} catch {
			return json({ conceptos: [], via });
		}
	}

	error(502, `No se pudo obtener la explicación de OpenAI. ${failures.join(' | ')}`);
}
