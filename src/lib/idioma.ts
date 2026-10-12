// Idioma con el que Deepgram transcribe el audio. Lo comparten el navegador (que abre el socket) y el
// servidor (que lo registra para estimar el costo: el modo multilingüe cuesta un poco más por minuto).

export type Idioma = 'multi' | 'es' | 'en';

export const IDIOMAS: { valor: Idioma; etiqueta: string }[] = [
	{ valor: 'multi', etiqueta: 'Español + inglés (automático)' },
	{ valor: 'es', etiqueta: 'Solo español' },
	{ valor: 'en', etiqueta: 'Solo inglés' }
];

export const esIdioma = (v: unknown): v is Idioma => v === 'multi' || v === 'es' || v === 'en';
