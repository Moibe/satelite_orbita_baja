// Convierte errores técnicos del navegador en mensajes que digan qué pasó y qué hacer.

export function describir(e: unknown): string {
	if (e instanceof DOMException) {
		switch (e.name) {
			case 'NotAllowedError':
				return 'No se pudo compartir la pantalla: cancelaste el selector o el navegador bloqueó el permiso. Pulsa Iniciar de nuevo y elige una pantalla.';
			case 'NotFoundError':
				return 'No se encontró ninguna pantalla o pestaña para compartir.';
			case 'NotReadableError':
			case 'AbortError':
				return 'El navegador no pudo leer la pantalla o el audio (¿otra aplicación lo está usando?). Reintenta.';
			case 'NotSupportedError':
				return 'Este navegador no soporta capturar el audio del sistema. Usa Chrome o Edge en escritorio.';
		}
	}
	// fetch() que ni siquiera llegó al servidor: "Failed to fetch" (Chrome/Edge), "NetworkError..." (Firefox), "Load failed" (Safari).
	if (e instanceof TypeError && /fetch|network|load failed/i.test(e.message))
		return 'No se pudo comunicar con el servidor local de la app. ¿Sigue corriendo "npm run dev"? Si lo reiniciaste, recarga esta página.';
	return e instanceof Error ? e.message : String(e);
}
