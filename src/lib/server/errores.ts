// Traduce errores de red de Node a algo que se pueda entender y accionar.
// "fetch failed" no dice nada: la causa real (DNS, conexión rechazada, certificado...) viene en error.cause.

const CAUSAS: Record<string, string> = {
	ENOTFOUND: 'no se pudo resolver el nombre del servidor (DNS): sin internet o el DNS no responde',
	EAI_AGAIN: 'el DNS no respondió: revisa tu conexión a internet',
	ECONNREFUSED: 'el servidor rechazó la conexión',
	ECONNRESET: 'la conexión se cortó a mitad de la petición',
	ETIMEDOUT: 'la conexión agotó el tiempo de espera',
	EHOSTUNREACH: 'no hay ruta hacia el servidor (red o VPN)',
	ENETUNREACH: 'no hay ruta hacia el servidor (red o VPN)',
	UND_ERR_CONNECT_TIMEOUT: 'la conexión agotó el tiempo de espera (sin internet, VPN o firewall)',
	UND_ERR_SOCKET: 'el servidor cerró la conexión',
	CERT_HAS_EXPIRED: 'el certificado del servidor está vencido',
	UNABLE_TO_VERIFY_LEAF_SIGNATURE:
		'no se pudo verificar el certificado HTTPS (típico de un proxy corporativo que intercepta el tráfico)',
	SELF_SIGNED_CERT_IN_CHAIN:
		'certificado HTTPS no confiable (típico de un proxy corporativo que intercepta el tráfico)',
	DEPTH_ZERO_SELF_SIGNED_CERT:
		'certificado HTTPS no confiable (típico de un proxy corporativo que intercepta el tráfico)'
};

type ErrorDeRed = {
	name?: string;
	message?: string;
	cause?: { code?: string; message?: string };
};

/** Causa legible de un fallo de red ("fetch failed", timeout, DNS, certificado...). */
export function causaDeRed(e: unknown): string {
	const err = e as ErrorDeRed | null;
	if (err?.name === 'TimeoutError' || err?.name === 'AbortError')
		return 'no respondió a tiempo (timeout): conexión lenta o bloqueada';
	const code = err?.cause?.code;
	if (code && CAUSAS[code]) return `${CAUSAS[code]} [${code}]`;
	const detalle = err?.cause?.message ?? err?.message;
	return code ? `${detalle ?? 'error de red'} [${code}]` : (detalle ?? 'error de red desconocido');
}

/** Mensaje para cuando un servicio externo respondió con un error HTTP. */
export function pistaHttp(status: number): string {
	if (status === 401) return 'La key es inválida o está mal copiada en .env.';
	if (status === 402) return 'La cuenta se quedó sin saldo o crédito.';
	if (status === 403) return 'La key no tiene permiso para esta operación.';
	if (status === 404) return 'No se encontró el recurso (revisa el nombre del modelo).';
	if (status === 429) return 'Límite de uso o de cuota alcanzado; espera un momento o revisa el saldo.';
	if (status >= 500) return 'El servicio tiene problemas de su lado; reintenta en un momento.';
	return '';
}
