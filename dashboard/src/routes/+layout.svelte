<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<div class="app">
	<header>
		<nav>
			<a href="/__beacon/">
				<strong>Beacon</strong>
			</a>
		</nav>
	</header>

	<main>
		{@render children()}
	</main>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
	}

	header {
		border-bottom: 1px solid var(--color-border);
		padding: 0.75rem 1.5rem;
	}

	nav a {
		color: var(--color-text);
		text-decoration: none;
	}

	main {
		flex: 1;
		padding: 1.5rem;
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
	}
</style>
