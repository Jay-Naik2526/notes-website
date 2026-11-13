<script lang="ts">
	import { page } from '$app/state';
</script>

<main>
	<div class="slip">
		<div class="k">ATTENDANCE SHEET</div>
		<h1>{page.status === 404 ? 'ABSENT' : 'SOMETHING SPILLED'}</h1>
		<p>{page.status === 404 ? "That page isn't on the desk." : (page.error?.message ?? 'Unexpected error.')}</p>
		<a href="/desk">← back to the desk</a>
	</div>
</main>

<style>
	main {
		display: grid;
		place-items: center;
		padding: 24px;
	}
	.slip {
		width: min(100%, 420px);
		padding: 22px 24px 20px;
		color: var(--ink);
		background: var(--paper);
		border-radius: 4px;
		transform: rotate(1.2deg);
		box-shadow: 0 24px 50px rgb(0 0 0 / 0.5);
		font-family: var(--type);
	}
	.k {
		font-family: var(--mono);
		font-size: 10px;
		letter-spacing: 0.24em;
		color: var(--pencil);
	}
	h1 {
		margin: 4px 0 6px;
		font-weight: 400;
		font-size: 40px;
		line-height: 1;
		color: var(--stamp);
		letter-spacing: 0.05em;
	}
	p {
		margin: 0 0 14px;
	}
	a {
		font-family: var(--hand);
		font-size: 22px;
		color: var(--pencil);
	}
</style>
