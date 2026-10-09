<script lang="ts">
	import { session } from '$lib/session.svelte';

	let panel: HTMLElement;
	let host: HTMLElement;
	let pip = $state<Window | null>(null);
	let manual = $state('');

	const supportsPip = typeof window !== 'undefined' && 'documentPictureInPicture' in window;
	const live = $derived(session.status === 'listening');

	async function start() {
		await session.start();
		// Tras el diálogo de compartir aún suele haber gesto vigente; si no, queda el botón.
		if (session.status === 'listening' && !pip) void float().catch(() => {});
	}

	async function float() {
		const dpip = (window as any).documentPictureInPicture;
		if (!dpip) return;
		const w: Window = await dpip.requestWindow({ width: 340, height: 460 });
		for (const sheet of document.styleSheets) {
			try {
				const style = w.document.createElement('style');
				style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n');
				w.document.head.append(style);
			} catch {
				if (sheet.href) {
					const link = w.document.createElement('link');
					link.rel = 'stylesheet';
					link.href = sheet.href;
					w.document.head.append(link);
				}
			}
		}
		w.document.body.className = 'pip';
		w.document.body.append(panel);
		pip = w;
		w.addEventListener('pagehide', () => {
			host?.append(panel);
			pip = null;
		});
	}

	function ago(at: number, _tick: number) {
		const s = Math.round((Date.now() - at) / 1000);
		return s < 60 ? `hace ${s}s` : `hace ${Math.round(s / 60)} min`;
	}

	let tick = $state(0);
	$effect(() => {
		const i = setInterval(() => tick++, 5000);
		return () => clearInterval(i);
	});

	function sendManual(e: SubmitEvent) {
		e.preventDefault();
		if (manual.trim()) session.feed(manual.trim());
		manual = '';
	}
</script>

<svelte:head><title>Satélite de órbita baja</title></svelte:head>

<main>
	<header>
		<h1>🛰️ Satélite de órbita baja</h1>
		<p>Escucha la junta y te explica en silencio los conceptos que van saliendo.</p>
	</header>

	<section class="controls">
		{#if live || session.status === 'connecting'}
			<button class="danger" onclick={() => session.stop()}>Detener</button>
		{:else}
			<button class="primary" onclick={start}>Iniciar y compartir audio</button>
		{/if}
		{#if supportsPip && !pip}
			<button onclick={() => float()}>Flotar ventanita</button>
		{/if}
		{#if !supportsPip}
			<span class="hint">Tu navegador no soporta ventana flotante; usa Chrome o Edge.</span>
		{/if}
	</section>

	{#if session.error}
		<p class="err">{session.error}</p>
	{/if}

	<p class="hint">
		En el selector elige <b>Pantalla completa</b> y deja marcado <b>Compartir audio del sistema</b> (las <i>ventanas</i> no traen audio; o elige la pestaña de Teams con
		“Compartir audio de la pestaña”). Solo se oye lo que sale por tus bocinas, es decir, los demás.
	</p>

	<label class="perfil">
		Sobre ti (para no explicarte lo que ya sabes)
		<textarea
			rows="2"
			bind:value={session.perfil}
			onchange={() => session.savePerfil()}
			placeholder="Ej. Líder de proyecto en TI, no programo; conozco bases de datos pero no infraestructura."
		></textarea>
	</label>

	<div bind:this={host} class="host">
		<aside bind:this={panel} class="sat">
			<div class="bar">
				<span class="dot" class:on={live} class:busy={session.thinking}></span>
				<span class="state">
					{live ? (session.thinking ? 'Pensando…' : 'Escuchando') : session.status === 'connecting' ? 'Conectando…' : 'En pausa'}
				</span>
			</div>

			<div class="cards">
				{#each session.cards as c (c.id)}
					<article class="card">
						<button class="x" aria-label="Descartar" onclick={() => session.dismiss(c.id)}>×</button>
						<h3>{c.term}</h3>
						<p>{c.text}</p>
						<time>{ago(c.at, tick)}</time>
					</article>
				{:else}
					<p class="empty">Aquí irán apareciendo los conceptos de la junta.</p>
				{/each}
			</div>

			{#if session.interim}
				<p class="interim">{session.interim}</p>
			{/if}
		</aside>
	</div>

	<details>
		<summary>Transcripción y pruebas</summary>
		<div class="transcript">
			{#each session.lines.slice(-10) as l}<p>{l}</p>{/each}
		</div>
		<form onsubmit={sendManual}>
			<input bind:value={manual} placeholder="Escribe una frase de prueba, ej. 'migramos a microservicios con Kubernetes y un API gateway…'" />
			<button>Probar</button>
		</form>
	</details>
</main>

<style>
	:global(:root) {
		--bg: #0b1020;
		--card: rgba(255, 255, 255, 0.07);
		--line: rgba(255, 255, 255, 0.14);
		--fg: #e8ecf6;
		--dim: #8f9ab8;
		--accent: #6aa6ff;
	}
	:global(body) {
		margin: 0;
		font: 15px/1.45 system-ui, sans-serif;
		color: var(--fg);
		background: linear-gradient(135deg, #0b1020, #14224a);
		min-height: 100vh;
	}
	:global(body.pip) {
		padding: 10px;
		box-sizing: border-box;
	}
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 28px 16px 60px;
		display: grid;
		gap: 16px;
	}
	h1 {
		margin: 0 0 4px;
		font-size: 1.5rem;
	}
	header p,
	.hint {
		margin: 0;
		color: var(--dim);
		font-size: 0.9rem;
	}
	.controls {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
	}
	button {
		font: inherit;
		color: var(--fg);
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 8px 14px;
		cursor: pointer;
	}
	button:hover {
		border-color: var(--accent);
	}
	button.primary {
		background: var(--accent);
		color: #07101f;
		border-color: var(--accent);
		font-weight: 600;
	}
	button.danger {
		border-color: #ff7a7a;
		color: #ff9a9a;
	}
	.err {
		margin: 0;
		padding: 10px 12px;
		border-radius: 10px;
		background: rgba(255, 90, 90, 0.12);
		border: 1px solid rgba(255, 90, 90, 0.4);
		color: #ffb3b3;
	}
	.perfil {
		display: grid;
		gap: 6px;
		color: var(--dim);
		font-size: 0.85rem;
	}
	textarea,
	input {
		font: inherit;
		color: var(--fg);
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 8px 10px;
		resize: vertical;
	}
	form {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}
	form input {
		flex: 1;
	}
	details {
		color: var(--dim);
		font-size: 0.88rem;
	}
	.transcript p {
		margin: 4px 0;
	}

	/* ---- El satélite (lo que flota) ---- */
	.sat {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px;
		border-radius: 16px;
		border: 1px solid var(--line);
		background: rgba(10, 16, 36, 0.92);
		min-height: 200px;
		box-sizing: border-box;
	}
	:global(body.pip) .sat {
		height: 100%;
		border-radius: 12px;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--dim);
		font-size: 0.8rem;
	}
	.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #55607f;
	}
	.dot.on {
		background: #46d98a;
	}
	.dot.busy {
		background: var(--accent);
		animation: pulse 1s infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 8px;
		overflow-y: auto;
		flex: 1;
	}
	.card {
		position: relative;
		padding: 10px 28px 8px 12px;
		border-radius: 12px;
		background: var(--card);
		border: 1px solid var(--line);
		animation: in 0.35s ease-out;
	}
	.card:not(:first-child) {
		opacity: 0.72;
	}
	@keyframes in {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
	}
	.card h3 {
		margin: 0 0 2px;
		font-size: 0.95rem;
		color: var(--accent);
	}
	.card p {
		margin: 0;
		font-size: 0.9rem;
	}
	.card time {
		display: block;
		margin-top: 4px;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.x {
		position: absolute;
		top: 4px;
		right: 6px;
		padding: 0 6px;
		border: 0;
		background: none;
		color: var(--dim);
		font-size: 1.1rem;
		line-height: 1.2;
	}
	.empty {
		color: var(--dim);
		font-size: 0.85rem;
		margin: 6px 0;
	}
	.interim {
		margin: 0;
		font-size: 0.75rem;
		color: var(--dim);
		font-style: italic;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
