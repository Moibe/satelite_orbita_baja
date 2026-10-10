// Tipos y formato compartidos entre el servidor (que calcula el gasto) y la interfaz (que lo muestra).

export type BloqueUso = {
	/** OpenAI + Deepgram, estimado en USD. */
	costo_usd: number;
	openai: {
		llamadas: number;
		input_tokens: number;
		output_tokens: number;
		costo_usd: number;
		/** Parte del costo de OpenAI que salió por la llave de respaldo (la personal). */
		costo_respaldo_usd: number;
	};
	deepgram: { segundos: number; costo_usd: number };
};

export type Uso = {
	precios: {
		modelo: string;
		openai_input_usd_por_1m: number;
		openai_output_usd_por_1m: number;
		deepgram_usd_por_min: number;
	};
	hoy: BloqueUso;
	mes: BloqueUso;
	total: BloqueUso;
};

/** Montos de centavos: más decimales mientras más chico el monto, para que $0.0005 no se vea como $0.001. */
export const usd = (n: number) =>
	'$' +
	n.toLocaleString('es-MX', {
		minimumFractionDigits: 2,
		maximumFractionDigits: n === 0 ? 2 : n < 0.01 ? 4 : n < 1 ? 3 : 2
	});

export const nfmt = (n: number) => n.toLocaleString('es-MX');

/** 3725 s → "1 h 02 min"; 95 s → "1 min 35 s". */
export function duracion(segundos: number) {
	const s = Math.round(segundos);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
	if (m) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
	return `${s} s`;
}
