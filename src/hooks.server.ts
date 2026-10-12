import type { HandleServerError } from '@sveltejs/kit';
import { causaDeRed } from '$lib/server/errores';

// Red de seguridad: cualquier excepción que no capturé en un endpoint llegaría al navegador como
// "Internal Error", sin decir nada. Es una herramienta local de un solo usuario, así que se muestra
// la causa real (y el stack completo queda en la terminal donde corre `npm run dev`).
export const handleError: HandleServerError = ({ error, event, status }) => {
	if (status === 404) return { message: `No existe la ruta ${event.url.pathname}` };

	console.error(`[${status}] ${event.request.method} ${event.url.pathname}`, error);

	const err = error as { message?: string } | null;
	const detalle =
		err?.message === 'fetch failed'
			? `falló una conexión de red: ${causaDeRed(error)}`
			: (err?.message ?? String(error));

	return { message: `Error inesperado en el servidor (${event.url.pathname}): ${detalle}` };
};
