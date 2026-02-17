<script lang="ts">
	import { api } from '$lib/api.js';

	let email = $state('');
	let submitting = $state(false);
	let success = $state(false);
	let error = $state('');

	async function handleSubmit(e: Event): Promise<void> {
		e.preventDefault();
		if (!email.trim() || submitting) return;

		submitting = true;
		error = '';
		try {
			await api.requestMagicLink(email.trim());
			success = true;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to send magic link';
		} finally {
			submitting = false;
		}
	}
</script>

<div class="login-form">
	<h2>Sign in to Beacon</h2>

	{#if success}
		<div class="success" role="status">
			Check your server console for the magic link.
		</div>
	{:else}
		<form onsubmit={handleSubmit}>
			<label for="email">Email address</label>
			<input
				id="email"
				type="email"
				bind:value={email}
				placeholder="you@example.com"
				disabled={submitting}
				required
			/>

			{#if error}
				<div class="error" role="alert">{error}</div>
			{/if}

			<button type="submit" disabled={submitting || !email.trim()}>
				{submitting ? 'Sending...' : 'Send magic link'}
			</button>
		</form>
	{/if}
</div>

<style>
	.login-form {
		max-width: 400px;
		margin: 3rem auto;
		padding: 2rem;
	}

	h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin-bottom: 1.5rem;
	}

	label {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		margin-bottom: 0.5rem;
	}

	input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.875rem;
		background: var(--color-bg);
		color: var(--color-text);
		margin-bottom: 1rem;
	}

	input:disabled {
		opacity: 0.5;
	}

	button {
		width: 100%;
		padding: 0.5rem 1rem;
		border: none;
		border-radius: var(--radius);
		background: var(--color-primary, #2563eb);
		color: white;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.success {
		padding: 1rem;
		background: color-mix(in srgb, #22c55e 10%, transparent);
		color: #22c55e;
		border-radius: var(--radius);
		font-size: 0.875rem;
	}

	.error {
		padding: 0.5rem 0.75rem;
		margin-bottom: 1rem;
		background: color-mix(in srgb, #ef4444 10%, transparent);
		color: #ef4444;
		border-radius: var(--radius);
		font-size: 0.8125rem;
	}
</style>
