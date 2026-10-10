export type Card = { id: number; term: string; text: string; at: number };
type Status = 'idle' | 'connecting' | 'listening' | 'error';

const DG_URL =
	'wss://api.deepgram.com/v1/listen?model=nova-3&language=es&encoding=linear16&sample_rate=16000' +
	'&channels=1&interim_results=true&smart_format=true&endpointing=400';

// Cuándo mandar lo transcrito a explicar: suficiente texto nuevo y un mínimo entre llamadas.
const MIN_CHARS = 140;
const MIN_GAP_MS = 10_000;
const MAX_CARDS = 8;
const PROFILE_KEY = 'satelite:perfil';

function read(key: string) {
	try {
		return localStorage.getItem(key) ?? '';
	} catch {
		return '';
	}
}

class Session {
	status = $state<Status>('idle');
	error = $state('');
	interim = $state('');
	lines = $state<string[]>([]);
	cards = $state<Card[]>([]);
	thinking = $state(false);
	/** true si la última explicación salió con la llave de respaldo (personal). */
	usingBackup = $state(false);
	/** true mientras se está recuperando de una caída de la conexión. */
	reconnecting = $state(false);
	/** Resultado de la última consulta cuando no generó tarjeta nueva (se muestra en "pruebas"). */
	note = $state('');
	perfil = $state(read(PROFILE_KEY));

	#ws: WebSocket | null = null;
	#ctx: AudioContext | null = null;
	#stream: MediaStream | null = null;
	#pending = '';
	#history = '';
	#lastCall = 0;
	#seen = new Set<string>();
	#nextId = 1;
	#stopping = false;
	#flush = false;

	savePerfil() {
		try {
			localStorage.setItem(PROFILE_KEY, this.perfil);
		} catch {}
	}

	async start() {
		if (this.status === 'connecting' || this.status === 'listening') return;
		this.error = '';
		this.status = 'connecting';
		try {
			// Debe ir primero: requiere el gesto del usuario.
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: true,
				audio: true,
				// Pistas para que Chrome/Edge sugieran pantalla completa y dejen la casilla de audio del sistema.
				systemAudio: 'include',
				selfBrowserSurface: 'exclude',
				monitorTypeSurfaces: 'include'
			} as DisplayMediaStreamOptions);
			if (!stream.getAudioTracks().length) {
				const surface = (stream.getVideoTracks()[0]?.getSettings() as { displaySurface?: string }).displaySurface;
				stream.getTracks().forEach((t) => t.stop());
				throw new Error(
					surface === 'window'
						? 'Elegiste una ventana: las ventanas no traen audio. Vuelve a intentar y elige "Pantalla completa" (con Compartir audio del sistema) o la pestaña de Teams.'
						: 'No llegó audio. Abajo del selector marca "Compartir también el audio del sistema" (pantalla completa) o "Compartir audio de la pestaña".'
				);
			}
			stream.getVideoTracks().forEach((t) => t.stop());
			this.#stream = stream;
			stream.getAudioTracks()[0].addEventListener('ended', () => this.stop());

			this.#stopping = false;
			await this.#openSocket(await this.#token());
			await this.#startAudio(stream);
			this.status = 'listening';
		} catch (e) {
			this.#fail(e instanceof Error ? e.message : String(e));
		}
	}

	async #token() {
		const res = await fetch('/api/stt-token', { method: 'POST' });
		if (!res.ok) throw new Error(await errText(res));
		const { token } = await res.json();
		return token as string;
	}

	stop() {
		this.#stopping = true;
		this.#ws?.close();
		this.#ws = null;
		this.#ctx?.close().catch(() => {});
		this.#ctx = null;
		this.#stream?.getTracks().forEach((t) => t.stop());
		this.#stream = null;
		this.interim = '';
		if (this.status !== 'error') this.status = 'idle';
	}

	/** Entrada manual de texto (para probar sin audio). */
	feed(text: string) {
		this.error = '';
		this.#onFinal(text, true);
	}

	dismiss(id: number) {
		this.cards = this.cards.filter((c) => c.id !== id);
	}

	#fail(msg: string) {
		this.stop();
		this.error = msg;
		this.status = 'error';
	}

	/** Reabre el socket con un token nuevo; el audio sigue capturándose mientras tanto. */
	async #reconnect() {
		this.reconnecting = true;
		for (let intento = 1; intento <= 5; intento++) {
			await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** (intento - 1), 10_000)));
			if (this.#stopping || this.status !== 'listening') break;
			try {
				await this.#openSocket(await this.#token());
				this.reconnecting = false;
				return;
			} catch {
				// siguiente intento
			}
		}
		this.reconnecting = false;
		if (!this.#stopping) this.#fail('Se perdió la conexión con Deepgram y no se pudo restablecer.');
	}

	#openSocket(token: string) {
		return new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(DG_URL, ['bearer', token]);
			this.#ws = ws;
			ws.onopen = () => resolve();
			ws.onerror = () => reject(new Error('No se pudo abrir la conexión con Deepgram.'));
			ws.onclose = () => {
				// Caída inesperada a media junta: se reconecta con un token nuevo sin perder el audio.
				if (this.#ws === ws && !this.#stopping && this.status === 'listening') void this.#reconnect();
			};
			ws.onmessage = (ev) => {
				const msg = JSON.parse(ev.data);
				const text: string | undefined = msg.channel?.alternatives?.[0]?.transcript;
				if (msg.type !== 'Results' || !text) return;
				if (msg.is_final) {
					this.interim = '';
					this.#onFinal(text);
				} else {
					this.interim = text;
				}
			};
		});
	}

	async #startAudio(stream: MediaStream) {
		const ctx = new AudioContext({ sampleRate: 16000 });
		this.#ctx = ctx;
		await ctx.audioWorklet.addModule('/pcm-worklet.js');
		const node = new AudioWorkletNode(ctx, 'pcm-worklet');
		node.port.onmessage = (ev) => {
			if (this.#ws?.readyState === WebSocket.OPEN) this.#ws.send(ev.data);
		};
		ctx.createMediaStreamSource(stream).connect(node);
	}

	/** `force`: consulta ya, sin esperar el texto mínimo ni el intervalo (lo usan las pruebas manuales). */
	#onFinal(text: string, force = false) {
		this.lines = [...this.lines, text].slice(-30);
		this.#pending += (this.#pending ? ' ' : '') + text;
		if (force) {
			this.#flush = true;
			if (!this.thinking) void this.#explain();
			return;
		}
		// Se dispara por eventos del socket (no por timers) para que el throttling de pestañas en segundo plano no lo afecte.
		if (
			this.#pending.length >= MIN_CHARS &&
			!this.thinking &&
			Date.now() - this.#lastCall >= MIN_GAP_MS
		) {
			void this.#explain();
		}
	}

	async #explain() {
		const texto = this.#pending;
		this.#pending = '';
		this.#flush = false;
		this.#lastCall = Date.now();
		this.thinking = true;
		this.note = '';
		try {
			const res = await fetch('/api/explain', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					texto,
					contexto: this.#history.slice(-700),
					perfil: this.perfil,
					yaExplicados: [...this.#seen]
				})
			});
			if (!res.ok) throw new Error(await errText(res));
			const { conceptos, via } = (await res.json()) as {
				conceptos: { termino: string; explicacion: string }[];
				via?: string;
			};
			this.usingBackup = via === 'respaldo';
			let nuevos = 0;
			for (const c of conceptos) {
				const key = c.termino.trim().toLowerCase();
				if (!key) continue;
				if (this.#seen.has(key)) {
					this.note = `"${c.termino.trim()}" ya se explicó en esta sesión.`;
					continue;
				}
				this.#seen.add(key);
				nuevos++;
				this.cards = [
					{ id: this.#nextId++, term: c.termino.trim(), text: c.explicacion.trim(), at: Date.now() },
					...this.cards
				].slice(0, MAX_CARDS);
			}
			if (!nuevos && !this.note) this.note = 'No encontré nada que valga la pena explicar en esa frase.';
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.#history += ' ' + texto;
			this.thinking = false;
			// Si mientras tanto llegó otra prueba manual, se atiende ahora.
			if (this.#flush && this.#pending) void this.#explain();
		}
	}
}

async function errText(res: Response) {
	try {
		const j = await res.json();
		return j.message ?? JSON.stringify(j);
	} catch {
		return `Error ${res.status}`;
	}
}

export const session = new Session();
