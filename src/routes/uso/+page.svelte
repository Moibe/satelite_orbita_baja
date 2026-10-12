<script lang="ts">
	// Detalle del gasto, equivalente a /tokens de nutricion_front: Hoy, Mes y Total, cada uno con
	// lo que costó OpenAI (tokens) y Deepgram (minutos de audio). Todo es una estimación.
	import { duracion, nfmt, usd, type BloqueUso, type Uso } from '$lib/uso';

	/** Qué parte del total es de cada servicio ("—" si todavía no hay gasto). */
	const pct = (parte: number, todo: number) => (todo > 0 ? `${Math.round((parte / todo) * 100)}%` : '—');

	let uso = $state<Uso | null>(null);
	let cargando = $state(true);
	let error = $state<string | null>(null);

	$effect(() => {
		(async () => {
			try {
				const res = await fetch('/api/uso');
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				uso = (await res.json()) as Uso;
			} catch (e) {
				error =
					e instanceof TypeError
						? 'No se pudo conectar con el servidor. ¿Sigue corriendo npm run dev?'
						: e instanceof Error
							? e.message
							: String(e);
			} finally {
				cargando = false;
			}
		})();
	});
</script>

<svelte:head><title>Gasto · Satélite de órbita baja</title></svelte:head>

{#snippet bloque(titulo: string, b: BloqueUso)}
	<div class="card">
		<div class="card-head">
			<span class="card-titulo">{titulo}</span>
			<span class="costo">{usd(b.costo_usd)} USD</span>
		</div>

		<div class="servicio">
			<div class="servicio-head">
				<span>LLM <small>explicaciones · OpenAI</small></span>
				<span class="parcial">{usd(b.openai.costo_usd)}</span>
			</div>
			<div class="stats">
				<div class="stat">
					<span class="val">{nfmt(b.openai.llamadas)}</span>
					<span class="lbl">llamadas</span>
				</div>
				<div class="stat">
					<span class="val">{nfmt(b.openai.input_tokens)}</span>
					<span class="lbl">tokens de entrada</span>
				</div>
				<div class="stat">
					<span class="val">{nfmt(b.openai.output_tokens)}</span>
					<span class="lbl">tokens de salida</span>
				</div>
			</div>
			{#if b.openai.costo_respaldo_usd > 0}
				<p class="respaldo">
					De esto, <strong>{usd(b.openai.costo_respaldo_usd)}</strong> salió por la llave de respaldo (la
					personal).
				</p>
			{/if}
		</div>

		<div class="servicio">
			<div class="servicio-head">
				<span>Deepgram <small>transcripción</small></span>
				<span class="parcial">{usd(b.deepgram.costo_usd)}</span>
			</div>
			<div class="stats">
				<div class="stat">
					<span class="val">{duracion(b.deepgram.segundos)}</span>
					<span class="lbl">de audio transcrito</span>
				</div>
			</div>
		</div>
	</div>
{/snippet}

<section class="uso">
	<h1>🛰️ Gasto estimado</h1>

	{#if cargando}
		<p class="estado">Cargando…</p>
	{:else if error}
		<div class="error">⚠️ {error}</div>
	{:else if uso}
		{@const cols = [uso.hoy, uso.mes, uso.total]}
		<!-- Separación LLM vs Deepgram de un vistazo. Va con texto y porcentaje, no solo con color. -->
		<div class="resumen-wrap">
		<table class="resumen">
			<caption>Gasto por servicio</caption>
			<thead>
				<tr>
					<th scope="col"><span class="sr">Servicio</span></th>
					<th scope="col">Hoy</th>
					<th scope="col">Mes</th>
					<th scope="col">Total</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<th scope="row">LLM <small>OpenAI</small></th>
					{#each cols as b}
						<td>{usd(b.openai.costo_usd)}<span class="pct">{pct(b.openai.costo_usd, b.costo_usd)}</span></td>
					{/each}
				</tr>
				<tr>
					<th scope="row">Deepgram <small>transcripción</small></th>
					{#each cols as b}
						<td>{usd(b.deepgram.costo_usd)}<span class="pct">{pct(b.deepgram.costo_usd, b.costo_usd)}</span></td>
					{/each}
				</tr>
				<tr class="suma">
					<th scope="row">Total</th>
					{#each cols as b}
						<td>{usd(b.costo_usd)}</td>
					{/each}
				</tr>
			</tbody>
		</table>
		</div>

		{@render bloque('Hoy', uso.hoy)}
		{@render bloque('Mes', uso.mes)}
		{@render bloque('Total', uso.total)}

		<p class="nota">
			Costo <strong>estimado</strong>. OpenAI con los precios de <code>{uso.precios.modelo}</code>:
			{usd(uso.precios.openai_input_usd_por_1m)} por 1M de tokens de entrada y
			{usd(uso.precios.openai_output_usd_por_1m)} por 1M de salida. Deepgram:
			{usd(uso.precios.deepgram_usd_por_min)} por minuto con un idioma fijo y
			{usd(uso.precios.deepgram_multi_usd_por_min)} en modo español + inglés, contado desde que se conecta,
			silencios incluidos. Si cambian los precios o el modelo, ajústalos en <code>.env</code>
			(<code>PRECIO_INPUT_USD_POR_1M</code>, <code>PRECIO_OUTPUT_USD_POR_1M</code>,
			<code>PRECIO_DEEPGRAM_USD_POR_MIN</code>, <code>PRECIO_DEEPGRAM_MULTI_USD_POR_MIN</code>).
			Los días y el mes se cuentan en hora de CDMX.
		</p>
	{/if}
</section>

<style>
	.uso {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
		max-width: 640px;
		margin: 0 auto;
		padding: 28px 16px 60px;
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
	}
	.estado {
		margin: 0;
		color: var(--dim);
	}
	/* border-collapse no admite esquinas redondeadas en la tabla: el redondeo va en el contenedor. */
	.resumen-wrap {
		border-radius: 14px;
		background: var(--card);
		border: 1px solid var(--line);
		overflow-x: auto;
	}
	.resumen {
		width: 100%;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}
	.resumen caption {
		text-align: left;
		padding: 1rem 1.3rem 0.3rem;
		font-weight: 700;
		font-size: 1.1rem;
	}
	.resumen th,
	.resumen td {
		padding: 0.6rem 0.9rem;
		text-align: right;
		border-bottom: 1px solid var(--line);
	}
	.resumen thead th {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--dim);
	}
	.resumen tbody th {
		text-align: left;
		font-weight: 600;
	}
	.resumen th small {
		font-weight: 400;
		color: var(--dim);
		margin-left: 0.3rem;
	}
	.resumen .pct {
		display: block;
		font-size: 0.7rem;
		color: var(--dim);
	}
	.resumen .suma th,
	.resumen .suma td {
		font-weight: 700;
		border-bottom: 0;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.card {
		padding: 1.1rem 1.3rem;
		border-radius: 14px;
		background: var(--card);
		border: 1px solid var(--line);
		display: grid;
		gap: 1rem;
	}
	.card-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.card-titulo {
		font-weight: 700;
		font-size: 1.1rem;
	}
	/* La cifra de costo es el dato principal de cada bloque. */
	.costo {
		font-weight: 700;
		font-size: 1.05rem;
		color: var(--accent-ink);
		background: var(--accent);
		border-radius: 999px;
		padding: 0.3rem 0.85rem;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.servicio {
		display: grid;
		gap: 0.5rem;
	}
	.servicio-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-weight: 600;
		font-size: 0.92rem;
	}
	.servicio-head small {
		font-weight: 400;
		color: var(--dim);
		margin-left: 0.3rem;
	}
	.parcial {
		font-variant-numeric: tabular-nums;
		color: var(--accent);
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.stat {
		flex: 1;
		min-width: 110px;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.6rem 0.85rem;
		border-radius: 10px;
		background: var(--card);
		border: 1px solid var(--line);
	}
	.stat .val {
		font-size: 1.1rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.stat .lbl {
		font-size: 0.72rem;
		color: var(--dim);
	}
	.respaldo {
		margin: 0;
		font-size: 0.8rem;
		color: #e0b050;
	}
	.nota {
		margin: 0;
		font-size: 0.8rem;
		color: var(--dim);
		line-height: 1.5;
	}
	.nota code {
		font-size: 0.76rem;
		background: rgba(255, 255, 255, 0.08);
		padding: 0.05rem 0.3rem;
		border-radius: 4px;
	}
	.error {
		background: rgba(255, 90, 90, 0.12);
		border: 1px solid rgba(255, 90, 90, 0.4);
		color: #ffb3b3;
		border-radius: 10px;
		padding: 0.6rem 0.85rem;
		font-size: 0.88rem;
	}
</style>
