// Convierte el audio (float32, a la sample rate del AudioContext) en bloques PCM16 para Deepgram.
class PcmWorklet extends AudioWorkletProcessor {
	constructor() {
		super();
		this.buf = new Int16Array(1600); // 100 ms a 16 kHz
		this.n = 0;
	}

	process(inputs) {
		const ch = inputs[0]?.[0];
		if (!ch) return true;
		for (let i = 0; i < ch.length; i++) {
			const s = Math.max(-1, Math.min(1, ch[i]));
			this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
			if (this.n === this.buf.length) {
				this.port.postMessage(this.buf.buffer.slice(0));
				this.n = 0;
			}
		}
		return true;
	}
}

registerProcessor('pcm-worklet', PcmWorklet);
