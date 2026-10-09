import { json, error } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

const SYSTEM = `Eres un "satélite" que acompaña en silencio a una persona durante una junta en español. Recibes lo último que se dijo (transcripción automática, puede traer errores de reconocimiento) y decides si vale la pena explicarle algún concepto para que no pierda el hilo.

Explica SOLO conceptos técnicos o de negocio que alguien razonablemente podría no conocer: tecnologías, arquitecturas, siglas, metodologías, herramientas, términos de dominio.
NO expliques: palabras cotidianas, nombres de personas o empresas, conceptos de la lista "ya explicados", ni nada que el perfil de la persona indique que ya domina.
Si la transcripción parece mal reconocida (ej. "micro servicios" / "mikroservicios"), normaliza el término.
Prefiere no decir nada antes que ser ruidoso. Como máximo 2 conceptos por respuesta, normalmente 0 o 1.
Cada explicación: 1 o 2 frases cortas (máx. ~30 palabras), en español claro, lo que importa para entender la conversación, sin preámbulos.
Responde siempre llamando a la herramienta "reportar".`;

const TOOL: Anthropic.Tool = {
	name: 'reportar',
	description: 'Reporta los conceptos a explicar (lista vacía si no hay nada que valga la pena).',
	input_schema: {
		type: 'object',
		properties: {
			conceptos: {
				type: 'array',
				maxItems: 2,
				items: {
					type: 'object',
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
	if (!env.ANTHROPIC_API_KEY) error(500, 'Falta ANTHROPIC_API_KEY en .env');

	const { texto, contexto, perfil, yaExplicados } = (await request.json()) as {
		texto: string;
		contexto?: string;
		perfil?: string;
		yaExplicados?: string[];
	};
	if (!texto?.trim()) return json({ conceptos: [] });

	const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
	const msg = await client.messages.create({
		model: env.EXPLAIN_MODEL || 'claude-haiku-5-5',
		max_tokens: 400,
		system: SYSTEM,
		tools: [TOOL],
		tool_choice: { type: 'tool', name: 'reportar' },
		messages: [
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

	const block = msg.content.find((b) => b.type === 'tool_use');
	const conceptos = block && block.type === 'tool_use' ? (block.input as any).conceptos ?? [] : [];
	return json({ conceptos });
}
