import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { env } from '$env/dynamic/private';
import type { BloqueUso, Uso } from '$lib/uso';

// Monitor de gasto, mismo patrón que nutricion_api: una fila por consumo con los tokens/segundos
// crudos y la fecha en CDMX; el costo se calcula al leer, con precios configurables por env.
// Aquí el almacén es un .jsonl (una línea por consumo) en vez de SQLite: son pocas filas y no
// hay que compilar nada nativo.

type Registro =
	| {
			ts: string;
			fecha: string;
			servicio: 'openai';
			modelo: string;
			via: string;
			input_tokens: number;
			output_tokens: number;
	  }
	| { ts: string; fecha: string; servicio: 'deepgram'; segundos: number };

const archivo = () => env.USO_FILE || 'data/uso.jsonl';

const fmtCdmx = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'America/Mexico_City',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});
/** "YYYY-MM-DD" en hora de CDMX. */
export const hoyCdmx = (d = new Date()) => fmtCdmx.format(d);

function num(valor: string | undefined, porDefecto: number) {
	const n = Number.parseFloat(valor ?? '');
	return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

// Estimación: los defaults son gpt-4o-mini y Deepgram Nova-3 en streaming (pay-as-you-go).
// Si cambian los precios o EXPLAIN_MODEL, se ajustan por env.
export function precios(): Uso['precios'] {
	return {
		modelo: env.EXPLAIN_MODEL || 'gpt-4o-mini',
		openai_input_usd_por_1m: num(env.PRECIO_INPUT_USD_POR_1M, 0.15),
		openai_output_usd_por_1m: num(env.PRECIO_OUTPUT_USD_POR_1M, 0.6),
		deepgram_usd_por_min: num(env.PRECIO_DEEPGRAM_USD_POR_MIN, 0.0077)
	};
}

async function agrega(r: Registro) {
	try {
		const ruta = archivo();
		await mkdir(dirname(ruta), { recursive: true });
		await appendFile(ruta, JSON.stringify(r) + '\n', 'utf8');
	} catch (e) {
		// El monitor nunca debe tumbar una explicación ni la transcripción.
		console.warn('[uso] no se pudo registrar el consumo:', e);
	}
}

export function registrarOpenAI(x: { modelo: string; via: string; input_tokens: number; output_tokens: number }) {
	const ahora = new Date();
	return agrega({
		ts: ahora.toISOString(),
		fecha: hoyCdmx(ahora),
		servicio: 'openai',
		modelo: x.modelo,
		via: x.via,
		input_tokens: Math.max(0, Math.round(x.input_tokens) || 0),
		output_tokens: Math.max(0, Math.round(x.output_tokens) || 0)
	});
}

export function registrarDeepgram(segundos: number) {
	const ahora = new Date();
	return agrega({ ts: ahora.toISOString(), fecha: hoyCdmx(ahora), servicio: 'deepgram', segundos });
}

const vacio = (): BloqueUso => ({
	costo_usd: 0,
	openai: { llamadas: 0, input_tokens: 0, output_tokens: 0, costo_usd: 0, costo_respaldo_usd: 0 },
	deepgram: { segundos: 0, costo_usd: 0 }
});

const redondea = (n: number) => Math.round(n * 1e6) / 1e6;

export async function resumen(): Promise<Uso> {
	const p = precios();
	let texto = '';
	try {
		texto = await readFile(archivo(), 'utf8');
	} catch {
		// sin archivo todavía = sin consumo
	}

	const total = vacio();
	const mes = vacio();
	const hoy = vacio();
	const hoyStr = hoyCdmx();
	const mesStr = hoyStr.slice(0, 7);

	for (const linea of texto.split('\n')) {
		if (!linea.trim()) continue;
		let r: Registro;
		try {
			r = JSON.parse(linea);
		} catch {
			continue; // línea truncada o dañada: se ignora
		}
		// Un registro ilegible no debe sumar basura: se descarta.
		if (typeof r?.fecha !== 'string') continue;

		const bloques = [total];
		if (r.fecha.slice(0, 7) === mesStr) bloques.push(mes);
		if (r.fecha === hoyStr) bloques.push(hoy);

		if (r.servicio === 'openai') {
			const costo =
				(r.input_tokens / 1_000_000) * p.openai_input_usd_por_1m +
				(r.output_tokens / 1_000_000) * p.openai_output_usd_por_1m;
			for (const b of bloques) {
				b.openai.llamadas += 1;
				b.openai.input_tokens += r.input_tokens;
				b.openai.output_tokens += r.output_tokens;
				b.openai.costo_usd += costo;
				if (r.via === 'respaldo') b.openai.costo_respaldo_usd += costo;
			}
		} else if (r.servicio === 'deepgram') {
			const costo = (r.segundos / 60) * p.deepgram_usd_por_min;
			for (const b of bloques) {
				b.deepgram.segundos += r.segundos;
				b.deepgram.costo_usd += costo;
			}
		}
	}

	for (const b of [total, mes, hoy]) {
		b.openai.costo_usd = redondea(b.openai.costo_usd);
		b.openai.costo_respaldo_usd = redondea(b.openai.costo_respaldo_usd);
		b.deepgram.costo_usd = redondea(b.deepgram.costo_usd);
		b.deepgram.segundos = Math.round(b.deepgram.segundos);
		b.costo_usd = redondea(b.openai.costo_usd + b.deepgram.costo_usd);
	}
	return { precios: p, hoy, mes, total };
}
