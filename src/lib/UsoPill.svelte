<script lang="ts">
	// Indicador de gasto (hoy / mes / total), mismo patrón que nutricion_front: una cápsula con los
	// tres valores que abre el detalle. Se abre en pestaña nueva a propósito: navegar en esta
	// pestaña desmontaría la ventanita flotante y cortaría la sesión de audio.
	import { session } from './session.svelte';
	import { usd, type BloqueUso } from './uso';

	const uso = $derived(session.uso);

	// Al pasar el cursor se ve cuánto de cada cifra es LLM y cuánto Deepgram.
	const detalle = $derived.by(() => {
		const u = session.uso;
		if (!u) return 'Gasto estimado de LLM (OpenAI) y Deepgram. Clic para ver el detalle.';
		const f = (t: string, b: BloqueUso) =>
			`${t}: ${usd(b.costo_usd)} = LLM ${usd(b.openai.costo_usd)} + Deepgram ${usd(b.deepgram.costo_usd)}`;
		return [f('Hoy', u.hoy), f('Mes', u.mes), f('Total', u.total), 'Clic para ver el detalle.'].join('\n');
	});
</script>

<a
	href="/uso"
	target="_blank"
	rel="noopener"
	class="pill"
	title={detalle}
>
	<span class="seg">
		<span class="label">Hoy</span>
		<span class="value">{uso ? usd(uso.hoy.costo_usd) : '—'}</span>
	</span>
	<span class="sep" aria-hidden="true"></span>
	<span class="seg">
		<span class="label">Mes</span>
		<span class="value">{uso ? usd(uso.mes.costo_usd) : '—'}</span>
	</span>
	<span class="sep" aria-hidden="true"></span>
	<span class="seg">
		<span class="label">Total</span>
		<span class="value">{uso ? usd(uso.total.costo_usd) : '—'}</span>
	</span>
	<span class="moneda">USD</span>
</a>

<style>
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.8rem;
		border-radius: 999px;
		background: var(--accent);
		border: 1px solid var(--accent);
		color: var(--accent-ink);
		text-decoration: none;
		white-space: nowrap;
		transition: filter 0.18s ease;
	}
	.pill:hover {
		filter: brightness(0.92);
	}
	.seg {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1.15;
	}
	.label {
		font-size: 0.58rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		opacity: 0.65;
	}
	.value {
		font-size: 0.82rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.sep {
		align-self: stretch;
		width: 1px;
		margin: 0.1rem 0;
		background: currentColor;
		opacity: 0.2;
	}
	.moneda {
		align-self: flex-end;
		margin-bottom: 0.05rem;
		font-size: 0.52rem;
		font-weight: 700;
		letter-spacing: 0.03em;
		opacity: 0.55;
	}
</style>
